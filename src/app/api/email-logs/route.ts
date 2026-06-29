import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import type { InValue } from "@libsql/client";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const params = request.nextUrl.searchParams;
  const leadId = params.get("lead_id");
  const matched = params.get("matched");

  const conditions: string[] = [];
  const values: InValue[] = [];

  if (leadId) { conditions.push("lead_id = ?"); values.push(Number(leadId)); }
  if (matched !== null && matched !== undefined && matched !== "") { conditions.push("matched = ?"); values.push(Number(matched)); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  // Explicit columns + LIMIT — the table grows unboundedly and the idx_email_logs_sent
  // index now backs the ORDER BY (no full-table filesort).
  const result = await db.execute({ sql: `SELECT id, lead_id, recipient, subject, sent_at, gmail_msg_id, matched, created_at FROM email_logs ${where} ORDER BY sent_at DESC LIMIT 200`, args: values });

  return NextResponse.json({ email_logs: all(result) }, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
