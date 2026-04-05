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
  const { project_id, name, url, file_type = "", size = 0 } = await request.json();

  if (!project_id || !name || !url) return NextResponse.json({ error: "project_id, name, url required" }, { status: 400 });

  const now = new Date().toISOString();
  const result = await db.execute({
    sql: "INSERT INTO project_files (project_id, name, url, file_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [project_id, name, url, file_type, size, now],
  });

  const file = first(await db.execute({ sql: "SELECT * FROM project_files WHERE id = ?", args: [result.lastInsertRowid!] }));
  return NextResponse.json(file, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.execute({ sql: "DELETE FROM project_files WHERE id = ?", args: [id] });
  return NextResponse.json({ ok: true });
}
