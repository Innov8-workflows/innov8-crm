import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

// GET — list active catalogue
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";
  const where = includeInactive ? "" : "WHERE active = 1";
  const result = await db.execute(`SELECT * FROM solutions_catalogue ${where} ORDER BY sort_order ASC, name ASC`);
  return NextResponse.json({ solutions: all(result) }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}

// POST — create new solution
export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const now = new Date().toISOString();
  const maxOrder = first(await db.execute("SELECT COALESCE(MAX(sort_order), 0) as v FROM solutions_catalogue"));
  const nextOrder = ((maxOrder?.v as number) || 0) + 1;

  const r = await db.execute({
    sql: `INSERT INTO solutions_catalogue
      (name, description, category, target_trades, upfront_price, monthly_price, install_days, pitch_angle, active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    args: [
      body.name,
      body.description || "",
      body.category || "",
      body.target_trades || "",
      Number(body.upfront_price) || 0,
      Number(body.monthly_price) || 0,
      Number(body.install_days) || 0,
      body.pitch_angle || "",
      nextOrder,
      now,
      now,
    ],
  });

  const created = first(await db.execute({ sql: "SELECT * FROM solutions_catalogue WHERE id = ?", args: [r.lastInsertRowid!] }));
  return NextResponse.json({ solution: created }, { status: 201 });
}
