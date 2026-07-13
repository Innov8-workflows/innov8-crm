import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import { computeAndStoreCover } from "@/lib/projectCache";

// Serves a single project's cover image — explicit cover (is_cover=1) if set,
// else the oldest image. The file id comes from the cached projects.cover_file_id
// (computed + persisted on miss) so this reads exactly ONE project_files row
// instead of scanning the blob-heavy table per request.
// Heavily cached in the browser so kanban cards don't re-fetch on every render.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = parseInt(id, 10);
  if (!projectId) return new NextResponse("Bad request", { status: 400 });

  const db = getClient();
  const proj = first(await db.execute({ sql: "SELECT cover_file_id FROM projects WHERE id = ?", args: [projectId] }));
  if (!proj) return new NextResponse("Not found", { status: 404 });

  let coverId = proj.cover_file_id as number | null;
  if (coverId === null || coverId === undefined) {
    coverId = await computeAndStoreCover(db, projectId);
  }
  if (!coverId) return new NextResponse("Not found", { status: 404 });

  const row = first(await db.execute({ sql: "SELECT url FROM project_files WHERE id = ?", args: [Number(coverId)] }));

  if (!row?.url) return new NextResponse("Not found", { status: 404 });

  const url = row.url as string;

  // If it's a data URL, decode and serve as proper image (browser can cache binary)
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const [, contentType, b64] = match;
      try {
        const buf = Buffer.from(b64, "base64");
        if (buf.length === 0) return new NextResponse("Empty image data", { status: 400 });
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=86400, immutable",
            "Content-Length": buf.length.toString(),
          },
        });
      } catch {
        return new NextResponse("Invalid image data", { status: 400 });
      }
    }
    // data: URL but not base64 (e.g., data:image/svg+xml,...) — return as-is
    return new NextResponse("Unsupported data URL format", { status: 400 });
  }

  // Otherwise it's a regular URL — redirect the browser to it
  return NextResponse.redirect(url, 302);
}
