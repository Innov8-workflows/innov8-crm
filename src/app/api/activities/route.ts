import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const leadId = request.nextUrl.searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  // LIMIT: the panel shows a recent-history feed — unbounded rows on old leads
  // just inflate the payload.
  const result = await db.execute({ sql: "SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC LIMIT 200", args: [Number(leadId)] });
  return NextResponse.json({ activities: all(result) }, {
    headers: { "Cache-Control": "private, max-age=10" },
  });
}

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { lead_id, type, description } = await request.json();

  if (!lead_id || !type) return NextResponse.json({ error: "lead_id and type required" }, { status: 400 });

  const now = new Date().toISOString();
  const result = await db.execute({
    sql: "INSERT INTO activities (lead_id, type, description, created_at) VALUES (?, ?, ?, ?)",
    args: [lead_id, type, description || "", now],
  });

  const activity = first(await db.execute({ sql: "SELECT * FROM activities WHERE id = ?", args: [result.lastInsertRowid!] }));
  return NextResponse.json(activity, { status: 201 });
}
