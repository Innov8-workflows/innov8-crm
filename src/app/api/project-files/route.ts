import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });

  const result = await db.execute({
    sql: "SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at DESC",
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

  const savedFile = first(await db.execute({ sql: "SELECT * FROM project_files WHERE id = ?", args: [result.lastInsertRowid!] }));
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
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.execute({ sql: "DELETE FROM project_files WHERE id = ?", args: [id] });
  return NextResponse.json({ ok: true });
}
