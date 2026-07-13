import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { getCallRollup } from "@/lib/statsQueries";

const OUTCOMES = ["answered", "no_answer", "voicemail"];

// GET ?lead_id=N  → that lead's call history, newest first
// GET ?rollup=1   → { rollup: { [lead_id]: { count, last_date, last_outcome } } }
//                   (legacy fallback — the grid normally gets this via /api/bootstrap)
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  if (request.nextUrl.searchParams.get("rollup")) {
    const rollup = await getCallRollup(db);
    return NextResponse.json({ rollup }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const leadId = request.nextUrl.searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const result = await db.execute({
    sql: "SELECT * FROM call_logs WHERE lead_id = ? ORDER BY called_at DESC, id DESC LIMIT 200",
    args: [Number(leadId)],
  });
  return NextResponse.json({ calls: all(result) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

// POST { lead_id, called_at?, outcome?, notes? } → log a call
export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { lead_id, called_at, outcome, notes } = await request.json();

  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const safeOutcome = OUTCOMES.includes(outcome) ? outcome : "answered";
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(called_at || "") ? called_at : new Date().toISOString().split("T")[0];

  const result = await db.execute({
    sql: "INSERT INTO call_logs (lead_id, called_at, outcome, notes, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [Number(lead_id), safeDate, safeOutcome, (notes || "").slice(0, 2000), new Date().toISOString()],
  });

  const log = first(await db.execute({ sql: "SELECT * FROM call_logs WHERE id = ?", args: [result.lastInsertRowid!] }));
  return NextResponse.json(log, { status: 201 });
}

// PUT { id, called_at?, outcome?, notes? } → edit a logged call
export async function PUT(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { id, called_at, outcome, notes } = await request.json();

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: string[] = [];
  const args: (string | number)[] = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(called_at || "")) { updates.push("called_at = ?"); args.push(called_at); }
  if (OUTCOMES.includes(outcome)) { updates.push("outcome = ?"); args.push(outcome); }
  if (notes !== undefined) { updates.push("notes = ?"); args.push(String(notes).slice(0, 2000)); }
  if (updates.length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  args.push(Number(id));
  await db.execute({ sql: `UPDATE call_logs SET ${updates.join(", ")} WHERE id = ?`, args });

  const log = first(await db.execute({ sql: "SELECT * FROM call_logs WHERE id = ?", args: [Number(id)] }));
  return NextResponse.json(log);
}

// DELETE ?id=N → remove one log entry
export async function DELETE(request: NextRequest) {
  await initDb();
  const db = getClient();
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.execute({ sql: "DELETE FROM call_logs WHERE id = ?", args: [Number(id)] });
  return NextResponse.json({ ok: true });
}
