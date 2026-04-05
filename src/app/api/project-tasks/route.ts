import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });

  const result = await db.execute({
    sql: "SELECT * FROM project_tasks WHERE project_id = ? ORDER BY sort_order ASC",
    args: [Number(projectId)],
  });
  return NextResponse.json({ tasks: all(result) });
}

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { project_id, title, stage = "" } = await request.json();

  if (!project_id || !title) return NextResponse.json({ error: "project_id and title required" }, { status: 400 });

  const maxOrder = first(await db.execute({ sql: "SELECT COALESCE(MAX(sort_order), 0) as v FROM project_tasks WHERE project_id = ?", args: [project_id] }));
  const now = new Date().toISOString();

  const result = await db.execute({
    sql: "INSERT INTO project_tasks (project_id, title, stage, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [project_id, title, stage, ((maxOrder?.v as number) || 0) + 1, now],
  });

  const task = first(await db.execute({ sql: "SELECT * FROM project_tasks WHERE id = ?", args: [result.lastInsertRowid!] }));
  return NextResponse.json(task, { status: 201 });
}

export async function PUT(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { id, completed, title, stage, sort_order } = await request.json();

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: string[] = [];
  const values: unknown[] = [];

  if (completed !== undefined) { updates.push("completed = ?"); values.push(completed ? 1 : 0); }
  if (title !== undefined) { updates.push("title = ?"); values.push(title); }
  if (stage !== undefined) { updates.push("stage = ?"); values.push(stage); }
  if (sort_order !== undefined) { updates.push("sort_order = ?"); values.push(sort_order); }

  if (updates.length === 0) return NextResponse.json({ error: "No fields" }, { status: 400 });
  values.push(id);

  await db.execute({ sql: `UPDATE project_tasks SET ${updates.join(", ")} WHERE id = ?`, args: values as never[] });

  const task = first(await db.execute({ sql: "SELECT * FROM project_tasks WHERE id = ?", args: [id] }));
  return NextResponse.json(task);
}

export async function DELETE(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.execute({ sql: "DELETE FROM project_tasks WHERE id = ?", args: [id] });
  return NextResponse.json({ ok: true });
}
