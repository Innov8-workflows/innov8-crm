import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  const ownerParam = request.nextUrl.searchParams.get("owner");
  const today = new Date().toISOString().split("T")[0];

  // Build owner join/filter
  let ownerJoin = "";
  let ownerFilter = "";
  const ownerArgs: unknown[] = [];
  if (ownerParam === "__unassigned__") {
    ownerJoin = " JOIN leads l ON p.lead_id = l.id";
    ownerFilter = " AND (l.owner = '' OR l.owner IS NULL)";
  } else if (ownerParam) {
    ownerJoin = " JOIN leads l ON p.lead_id = l.id";
    ownerFilter = " AND l.owner = ?";
    ownerArgs.push(ownerParam);
  }

  const ACTIVE = `p.completed_at != '' AND (p.client_status IN ('active', 'refine') OR p.client_status IS NULL)`;
  const LOST = `p.completed_at != '' AND p.client_status = 'lost'`;

  const [mrrResult, capexResult, countResult, overdueResult, lostResult] = await Promise.all([
    db.execute({ sql: `SELECT COALESCE(SUM(p.monthly_fee), 0) as total FROM projects p${ownerJoin} WHERE ${ACTIVE}${ownerFilter}`, args: [...ownerArgs] as never[] }),
    db.execute({ sql: `SELECT COALESCE(SUM(l2.capex), 0) as total FROM leads l2 JOIN projects p ON p.lead_id = l2.id${ownerParam ? " JOIN leads lo ON p.lead_id = lo.id" : ""} WHERE ${ACTIVE}${ownerParam === "__unassigned__" ? " AND (l2.owner = '' OR l2.owner IS NULL)" : ownerParam ? " AND l2.owner = ?" : ""}`, args: ownerParam && ownerParam !== "__unassigned__" ? [ownerParam] as never[] : [] as never[] }),
    db.execute({ sql: `SELECT COUNT(*) as total FROM projects p${ownerJoin} WHERE ${ACTIVE}${ownerFilter}`, args: [...ownerArgs] as never[] }),
    db.execute({ sql: `SELECT COUNT(*) as total FROM projects p${ownerJoin} WHERE ${ACTIVE}${ownerFilter} AND p.renewal_date != '' AND p.renewal_date < ?`, args: [...ownerArgs, today] as never[] }),
    db.execute({ sql: `SELECT COUNT(*) as total FROM projects p${ownerJoin} WHERE ${LOST}${ownerFilter}`, args: [...ownerArgs] as never[] }),
  ]);

  return NextResponse.json({
    mrr: (first(mrrResult)?.total as number) || 0,
    capex: (first(capexResult)?.total as number) || 0,
    clientCount: (first(countResult)?.total as number) || 0,
    overdueRenewals: (first(overdueResult)?.total as number) || 0,
    lostClients: (first(lostResult)?.total as number) || 0,
  });
}
