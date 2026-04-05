import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();

  const secret = request.headers.get("x-webhook-secret");
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recipient, subject, sent_at, gmail_msg_id } = await request.json();

  if (!recipient || !sent_at || !gmail_msg_id) {
    return NextResponse.json({ error: "recipient, sent_at, and gmail_msg_id are required" }, { status: 400 });
  }

  const dup = first(await db.execute({ sql: "SELECT id FROM email_logs WHERE gmail_msg_id = ?", args: [gmail_msg_id] }));
  if (dup) return NextResponse.json({ duplicate: true, message: "Already logged" });

  const leadRow = first(await db.execute({ sql: "SELECT id FROM leads WHERE email = ? COLLATE NOCASE", args: [recipient] }));
  let leadId: number | null = null;
  let matched = 0;

  if (leadRow) {
    leadId = leadRow.id as number;
    matched = 1;
    await db.execute({ sql: "UPDATE leads SET emailed = 1, updated_at = ? WHERE id = ?", args: [new Date().toISOString(), leadId] });
  }

  await db.execute({
    sql: "INSERT INTO email_logs (lead_id, recipient, subject, sent_at, gmail_msg_id, matched, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [leadId, recipient, subject || "", sent_at, gmail_msg_id, matched, new Date().toISOString()],
  });

  return NextResponse.json({ matched: !!matched, lead_id: leadId });
}
