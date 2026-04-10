import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import type { InValue } from "@libsql/client";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  const ownerParam = request.nextUrl.searchParams.get("owner");

  // Build owner filter clause
  let ownerClause = "";
  const ownerArgs: InValue[] = [];
  if (ownerParam === "__unassigned__") {
    ownerClause = " AND (owner = '' OR owner IS NULL)";
  } else if (ownerParam) {
    ownerClause = " AND owner = ?";
    ownerArgs.push(ownerParam);
  }

  const get = async (baseSql: string, extraArgs?: InValue[]) => {
    // Inject owner filter: replace "FROM leads" with "FROM leads WHERE 1=1 {ownerClause}"
    // or append to existing WHERE
    let sql = baseSql;
    const args = [...(extraArgs || []), ...ownerArgs];
    if (ownerClause) {
      if (sql.includes("WHERE")) {
        sql = sql + ownerClause;
      } else {
        sql = sql.replace("FROM leads", "FROM leads WHERE 1=1" + ownerClause);
      }
    }
    const r = first(await db.execute({ sql, args }));
    return (r?.v as number) || 0;
  };

  const today = new Date().toISOString().split("T")[0];

  const [total, emailed, messaged, called, meetingsBooked, maybe, won, lost, rejected, overdue, dueToday] = await Promise.all([
    get("SELECT COUNT(*) as v FROM leads"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'emailed'"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'messaged'"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'called'"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'meeting_booked'"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'maybe'"),
    get("SELECT COUNT(*) as v FROM leads WHERE status IN ('won','completed')"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'lost'"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'rejected'"),
    get("SELECT COUNT(*) as v FROM leads WHERE follow_up_date != '' AND follow_up_date < ? AND status NOT IN ('won','lost','completed','rejected')", [today]),
    get("SELECT COUNT(*) as v FROM leads WHERE follow_up_date = ?", [today]),
  ]);

  return NextResponse.json({ total, emailed, messaged, called, meetingsBooked, maybe, won, lost, rejected, overdue, dueToday });
}
