import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

export async function GET() {
  await initDb();
  const db = getClient();
  const result = await db.execute("SELECT * FROM column_config ORDER BY sort_order ASC");
  return NextResponse.json({ columns: all(result) });
}

export async function PUT(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { id, label, col_type } = await request.json();

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const existing = first(await db.execute({ sql: "SELECT id FROM column_config WHERE id = ?", args: [id] }));

  if (existing) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (label !== undefined) { updates.push("label = ?"); values.push(label); }
    if (col_type !== undefined) { updates.push("col_type = ?"); values.push(col_type); }
    if (updates.length > 0) {
      values.push(id);
      await db.execute({ sql: `UPDATE column_config SET ${updates.join(", ")} WHERE id = ?`, args: values as never[] });
    }
  } else {
    await db.execute({
      sql: "INSERT INTO column_config (id, label, col_type) VALUES (?, ?, ?)",
      args: [id, label || id, col_type || "text"],
    });
  }

  return NextResponse.json({ ok: true });
}
