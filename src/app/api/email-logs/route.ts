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
  const result = await db.execute({ sql: `SELECT * FROM email_logs ${where} ORDER BY sent_at DESC`, args: values });

  return NextResponse.json({ email_logs: all(result) });
}
