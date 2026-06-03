import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import { mondayOfWeek, dateForDayOffset } from "@/lib/scheduleTemplate";

// GET /api/schedule?week=YYYY-MM-DD
// Returns all completions for the 7-day window starting Monday=week param.
// Falls back to current week if param missing.
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  const weekParam = request.nextUrl.searchParams.get("week");
  const monday = weekParam || mondayOfWeek();
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(dateForDayOffset(monday, i));

  const placeholders = days.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT slot_id, date, completed_at, notes FROM schedule_completions WHERE date IN (${placeholders})`,
    args: days,
  });

  return NextResponse.json({
    week: monday,
    days,
    completions: all(result),
  }, {
    // No cache — completions change frequently and the cached response was
    // sometimes hiding fresh data after a toggle.
    headers: { "Cache-Control": "private, no-store" },
  });
}

// PUT body { slot_id, date, completed: boolean, notes?: string }
// Upserts if completed=true, deletes if completed=false. Idempotent.
export async function PUT(request: NextRequest) {
  await initDb();
  const db = getClient();
  const body = await request.json();
  const { slot_id, date, completed, notes } = body || {};

  if (!slot_id || !date) {
    return NextResponse.json({ error: "slot_id and date required" }, { status: 400 });
  }

  if (completed === false) {
    await db.execute({
      sql: "DELETE FROM schedule_completions WHERE slot_id = ? AND date = ?",
      args: [slot_id, date],
    });
    return NextResponse.json({ ok: true, completed: false });
  }

  // completed=true (or undefined → default to true): upsert
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO schedule_completions (slot_id, date, completed_at, notes)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(slot_id, date) DO UPDATE SET notes = excluded.notes`,
    args: [slot_id, date, now, notes || ""],
  });
  return NextResponse.json({ ok: true, completed: true });
}
