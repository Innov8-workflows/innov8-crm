import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { orderedIds } = await request.json();

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: "orderedIds array required" }, { status: 400 });
  }

  // Batch update using CASE/WHEN — single query instead of N queries
  const cases = orderedIds.map((_: number, i: number) => `WHEN ? THEN ?`).join(" ");
  const args = orderedIds.flatMap((id: number, i: number) => [id, i]);
  const placeholders = orderedIds.map(() => "?").join(",");

  await db.execute({
    sql: `UPDATE leads SET sort_order = CASE id ${cases} END WHERE id IN (${placeholders})`,
    args: [...args, ...orderedIds],
  });

  return NextResponse.json({ ok: true });
}
