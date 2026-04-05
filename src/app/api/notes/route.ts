import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const leadId = request.nextUrl.searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const result = await db.execute({ sql: "SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC", args: [Number(leadId)] });
  return NextResponse.json({ notes: all(result) });
}

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { lead_id, content } = await request.json();

  if (!lead_id || !content) return NextResponse.json({ error: "lead_id and content required" }, { status: 400 });

  const now = new Date().toISOString();
  const result = await db.execute({
    sql: "INSERT INTO lead_notes (lead_id, content, created_at) VALUES (?, ?, ?)",
    args: [lead_id, content, now],
  });

  const note = first(await db.execute({ sql: "SELECT * FROM lead_notes WHERE id = ?", args: [result.lastInsertRowid!] }));
  return NextResponse.json(note, { status: 201 });
}
