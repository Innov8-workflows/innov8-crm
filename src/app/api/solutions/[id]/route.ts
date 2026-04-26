import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

// PUT — update solution
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const db = getClient();
  const body = await request.json();

  const allowed = ["name", "description", "category", "target_trades", "upfront_price", "monthly_price", "install_days", "pitch_angle", "active", "sort_order"];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const f of allowed) {
    if (f in body) {
      updates.push(`${f} = ?`);
      values.push(body[f]);
    }
  }

  if (updates.length === 0) return NextResponse.json({ error: "no fields to update" }, { status: 400 });

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(Number(id));

  await db.execute({
    sql: `UPDATE solutions_catalogue SET ${updates.join(", ")} WHERE id = ?`,
    args: values as never[],
  });

  const updated = first(await db.execute({ sql: "SELECT * FROM solutions_catalogue WHERE id = ?", args: [Number(id)] }));
  return NextResponse.json({ solution: updated });
}

// DELETE — soft-delete (active = 0). Historical entity_solutions rows remain valid.
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const db = getClient();
  await db.execute({
    sql: "UPDATE solutions_catalogue SET active = 0, updated_at = ? WHERE id = ?",
    args: [new Date().toISOString(), Number(id)],
  });
  return NextResponse.json({ ok: true });
}
