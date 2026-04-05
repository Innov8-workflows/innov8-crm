import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const db = await getDb();
  const params = request.nextUrl.searchParams;
  const leadId = params.get("lead_id");
  const matched = params.get("matched");

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (leadId) {
    conditions.push("lead_id = ?");
    values.push(Number(leadId));
  }

  if (matched !== null && matched !== undefined && matched !== "") {
    conditions.push("matched = ?");
    values.push(Number(matched));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM email_logs ${where} ORDER BY sent_at DESC`;

  const stmt = db.prepare(sql);
  values.forEach((v, i) => stmt.bind({ [i + 1]: v }));

  const logs = [];
  while (stmt.step()) {
    logs.push(stmt.getAsObject());
  }
  stmt.free();

  return NextResponse.json({ email_logs: logs });
}
