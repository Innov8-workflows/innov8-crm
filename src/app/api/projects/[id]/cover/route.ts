import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

// Serves a single project's cover image. Uses window-function query to pick
// the explicit cover (is_cover=1) if set, else the oldest image.
// Heavily cached in the browser so kanban cards don't re-fetch on every render.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = parseInt(id, 10);
  if (!projectId) return new NextResponse("Bad request", { status: 400 });

  const db = getClient();
  const row = first(await db.execute({
    sql: `SELECT url FROM project_files
          WHERE project_id = ?
            AND (file_type LIKE 'image/%' OR url LIKE 'data:image/%' OR is_cover = 1)
          ORDER BY is_cover DESC, created_at ASC
          LIMIT 1`,
    args: [projectId],
  }));

  if (!row?.url) return new NextResponse("Not found", { status: 404 });

  const url = row.url as string;

  // If it's a data URL, decode and serve as proper image (browser can cache binary)
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const [, contentType, b64] = match;
      const buf = Buffer.from(b64, "base64");
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=86400, immutable",
          "Content-Length": buf.length.toString(),
        },
      });
    }
  }

  // Otherwise it's a regular URL — redirect the browser to it
  return NextResponse.redirect(url, 302);
}
