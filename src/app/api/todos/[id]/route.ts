import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

// PATCH /api/todos/[id]  body { text?, detail?, priority?, done? }
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const db = getClient();
  const body = await request.json();

  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof body.text === "string") { updates.push("text = ?"); values.push(body.text.trim()); }
  if (typeof body.detail === "string") { updates.push("detail = ?"); values.push(body.detail.trim()); }
  if (typeof body.priority === "string") { updates.push("priority = ?"); values.push(body.priority); }
  if (body.done !== undefined) {
    const done = body.done ? 1 : 0;
    updates.push("done = ?"); values.push(done);
    // Stamp / clear completion time as the checkbox flips.
    updates.push("completed_at = ?"); values.push(done ? new Date().toISOString() : "");
  }

  if (updates.length === 0) return NextResponse.json({ error: "no fields to update" }, { status: 400 });

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(Number(id));

  await db.execute({ sql: `UPDATE todos SET ${updates.join(", ")} WHERE id = ?`, args: values as never[] });

  const todo = first(await db.execute({ sql: "SELECT * FROM todos WHERE id = ?", args: [Number(id)] }));
  if (!todo) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(todo);
}

// DELETE /api/todos/[id]
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const db = getClient();
  await db.execute({ sql: "DELETE FROM todos WHERE id = ?", args: [Number(id)] });
  return NextResponse.json({ ok: true });
}
