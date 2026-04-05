import { NextRequest, NextResponse } from "next/server";
import { getDb, persist } from "@/lib/db";

export async function POST(request: NextRequest) {
  const db = await getDb();

  // Optional: verify webhook secret
  const secret = request.headers.get("x-webhook-secret");
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { recipient, subject, sent_at, gmail_msg_id } = body;

  if (!recipient || !sent_at || !gmail_msg_id) {
    return NextResponse.json(
      { error: "recipient, sent_at, and gmail_msg_id are required" },
      { status: 400 }
    );
  }

  // Dedup check
  const dupStmt = db.prepare("SELECT id FROM email_logs WHERE gmail_msg_id = ?");
  dupStmt.bind([gmail_msg_id]);
  if (dupStmt.step()) {
    dupStmt.free();
    return NextResponse.json({ duplicate: true, message: "Already logged" });
  }
  dupStmt.free();

  // Try to match recipient to a lead
  const leadStmt = db.prepare("SELECT id FROM leads WHERE email = ? COLLATE NOCASE");
  leadStmt.bind([recipient]);
  let leadId: number | null = null;
  let matched = 0;

  if (leadStmt.step()) {
    leadId = leadStmt.getAsObject().id as number;
    matched = 1;

    // Auto-set emailed flag on the lead
    db.run("UPDATE leads SET emailed = 1, updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      leadId,
    ]);
  }
  leadStmt.free();

  // Insert email log
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO email_logs (lead_id, recipient, subject, sent_at, gmail_msg_id, matched, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [leadId, recipient, subject || "", sent_at, gmail_msg_id, matched, now]
  );

  persist();

  return NextResponse.json({ matched: !!matched, lead_id: leadId });
}
