import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  // ?file=N → serve a single uploaded file's bytes (lazy + cached) instead of
  // shipping multi-MB base64 blobs in the list. Mirrors /api/projects/[id]/cover.
  const fileId = request.nextUrl.searchParams.get("file");
  if (fileId) {
    const row = first(await db.execute({ sql: "SELECT url, file_type, name FROM project_files WHERE id = ? LIMIT 1", args: [Number(fileId)] }));
    if (!row) return new NextResponse("Not found", { status: 404 });
    const url = String(row.url || "");
    const m = url.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return new NextResponse("Not a stored file", { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(m[2], "base64")), {
      headers: {
        "Content-Type": m[1] || String(row.file_type || "application/octet-stream"),
        "Cache-Control": "private, max-age=86400, immutable",
        "Content-Disposition": `inline; filename="${String(row.name || "file").replace(/[\r\n"]/g, "")}"`,
      },
    });
  }

  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });

  // List omits the base64 blob (uploaded files) — only external links keep their url.
  // Uploaded images/files are fetched lazily via ?file=<id>; is_blob tells the client.
  const result = await db.execute({
    sql: `SELECT id, project_id, name, file_type, size, is_cover, created_at,
                 CASE WHEN url LIKE 'data:%' THEN '' ELSE url END AS url,
                 CASE WHEN url LIKE 'data:%' THEN 1 ELSE 0 END AS is_blob
          FROM project_files WHERE project_id = ? ORDER BY created_at DESC`,
    args: [Number(projectId)],
  });
  return NextResponse.json({ files: all(result) });
}

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();

  const contentType = request.headers.get("content-type") || "";

  let project_id: number, name: string, url: string, file_type = "", size = 0, is_cover = 0;

  if (contentType.includes("multipart/form-data")) {
    // File upload via FormData
    const formData = await request.formData();
    project_id = Number(formData.get("project_id"));
    name = formData.get("name") as string || "file";
    is_cover = Number(formData.get("is_cover") || 0);
    const file = formData.get("file") as File;

    if (!file || !project_id) {
      return NextResponse.json({ error: "project_id and file required" }, { status: 400 });
    }

    file_type = file.type;
    size = file.size;

    // Reject files over 5MB
    const MAX_SIZE = 5 * 1024 * 1024;
    if (size > MAX_SIZE) {
      return NextResponse.json({ error: `File too large (${(size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.` }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/", "application/pdf", "text/"];
    if (!allowedTypes.some((t) => file_type.startsWith(t))) {
      return NextResponse.json({ error: `File type "${file_type}" not allowed. Use images, PDFs, or text files.` }, { status: 400 });
    }

    // Convert to base64 data URL for storage
    const buffer = Buffer.from(await file.arrayBuffer());
    url = `data:${file.type};base64,${buffer.toString("base64")}`;
    name = name || file.name;
  } else {
    // JSON body (URL link)
    const body = await request.json();
    project_id = body.project_id;
    name = body.name;
    url = body.url;
    file_type = body.file_type || "";
    size = body.size || 0;
    is_cover = body.is_cover || 0;

    if (!project_id || !name || !url) {
      return NextResponse.json({ error: "project_id, name, url required" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const result = await db.execute({
    sql: "INSERT INTO project_files (project_id, name, url, file_type, size, is_cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [project_id, name, url, file_type, size, is_cover, now],
  });

  // Keep the cached cover pointer fresh (see src/lib/projectCache.ts): an
  // explicit cover always wins; otherwise the first image on a project without
  // a cover becomes it (matches the is_cover DESC, created_at ASC rule).
  const newId = Number(result.lastInsertRowid!);
  const isImage = file_type.startsWith("image/") || url.startsWith("data:image/");
  if (is_cover) {
    await db.execute({ sql: "UPDATE projects SET cover_file_id = ? WHERE id = ?", args: [newId, project_id] });
  } else if (isImage) {
    await db.execute({
      sql: "UPDATE projects SET cover_file_id = ? WHERE id = ? AND (cover_file_id IS NULL OR cover_file_id = 0)",
      args: [newId, project_id],
    });
  }

  // Echo back metadata only — never the just-uploaded base64 blob (doubles the payload).
  const savedFile = first(await db.execute({
    sql: `SELECT id, project_id, name, file_type, size, is_cover, created_at,
                 CASE WHEN url LIKE 'data:%' THEN '' ELSE url END AS url,
                 CASE WHEN url LIKE 'data:%' THEN 1 ELSE 0 END AS is_blob
          FROM project_files WHERE id = ?`,
    args: [result.lastInsertRowid!],
  }));
  return NextResponse.json(savedFile, { status: 201 });
}

export async function PUT(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { id, is_cover } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (is_cover !== undefined) {
    // Clear other covers for this project first
    const file = first(await db.execute({ sql: "SELECT project_id FROM project_files WHERE id = ?", args: [id] }));
    if (file) {
      await db.execute({ sql: "UPDATE project_files SET is_cover = 0 WHERE project_id = ?", args: [file.project_id as number] });
    }
    await db.execute({ sql: "UPDATE project_files SET is_cover = ? WHERE id = ?", args: [is_cover ? 1 : 0, id] });
    // Cached pointer: explicit cover set → point at it; cover unset → NULL
    // (unknown) so the next list/cover request recomputes the fallback.
    if (file) {
      await db.execute({
        sql: is_cover ? "UPDATE projects SET cover_file_id = ? WHERE id = ?" : "UPDATE projects SET cover_file_id = NULL WHERE id = ?",
        args: is_cover ? [id, file.project_id as number] : [file.project_id as number],
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // If this file was the cached cover, mark it unknown (NULL) so the next
  // list/cover request recomputes it. project_id is an early column — reading
  // it never touches the blob.
  const file = first(await db.execute({ sql: "SELECT project_id FROM project_files WHERE id = ?", args: [id] }));
  await db.execute({ sql: "DELETE FROM project_files WHERE id = ?", args: [id] });
  if (file) {
    await db.execute({
      sql: "UPDATE projects SET cover_file_id = NULL WHERE id = ? AND cover_file_id = ?",
      args: [file.project_id as number, id],
    });
  }
  return NextResponse.json({ ok: true });
}
