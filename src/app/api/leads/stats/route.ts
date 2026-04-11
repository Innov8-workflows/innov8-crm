import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first, all } from "@/lib/db";
import type { InValue } from "@libsql/client";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  const ownerParam = request.nextUrl.searchParams.get("owner");
  const today = new Date().toISOString().split("T")[0];

  // Build owner filter
  let ownerWhere = "WHERE 1=1";
  const args: InValue[] = [];
  if (ownerParam === "__unassigned__") {
    ownerWhere += " AND (owner = '' OR owner IS NULL)";
  } else if (ownerParam) {
    ownerWhere += " AND owner = ?";
    args.push(ownerParam);
  }

  // Single query for all lead stats (was 12 separate queries)
  const statsSQL = `SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status = 'emailed' THEN 1 ELSE 0 END) as emailed,
    SUM(CASE WHEN status = 'messaged' THEN 1 ELSE 0 END) as messaged,
    SUM(CASE WHEN status = 'called' THEN 1 ELSE 0 END) as called,
    SUM(CASE WHEN status = 'meeting_booked' THEN 1 ELSE 0 END) as meetingsBooked,
    SUM(CASE WHEN status = 'maybe' THEN 1 ELSE 0 END) as maybe,
    SUM(CASE WHEN status IN ('won','completed') THEN 1 ELSE 0 END) as won,
    SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
    SUM(CASE WHEN follow_up_date != '' AND follow_up_date < '${today}' AND status NOT IN ('won','lost','completed','rejected') THEN 1 ELSE 0 END) as overdue,
    SUM(CASE WHEN follow_up_date = '${today}' THEN 1 ELSE 0 END) as dueToday,
    COALESCE(SUM(CASE WHEN capex > 0 THEN capex ELSE 0 END), 0) as totalCapex
  FROM leads ${ownerWhere}`;

  const stats = first(await db.execute({ sql: statsSQL, args }));

  // Monthly total from custom fields (separate table, needs JOIN)
  let totalMonthly = 0;
  try {
    let monthlySQL = `SELECT COALESCE(SUM(CAST(cfv.value AS REAL)), 0) as v
      FROM custom_field_values cfv JOIN leads l ON cfv.lead_id = l.id
      WHERE cfv.field_id = 'custom_monthly' AND cfv.value != ''`;
    const monthlyArgs: InValue[] = [];
    if (ownerParam === "__unassigned__") {
      monthlySQL += " AND (l.owner = '' OR l.owner IS NULL)";
    } else if (ownerParam) {
      monthlySQL += " AND l.owner = ?";
      monthlyArgs.push(ownerParam);
    }
    const r = first(await db.execute({ sql: monthlySQL, args: monthlyArgs }));
    totalMonthly = (r?.v as number) || 0;
  } catch {}

  // Win/rejection breakdown by business type
  const byTypeSQL = `SELECT
    business_type,
    COUNT(*) as total,
    SUM(CASE WHEN status IN ('won','completed') THEN 1 ELSE 0 END) as won,
    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
    SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost
  FROM leads ${ownerWhere}
  AND business_type != '' AND business_type IS NOT NULL
  GROUP BY business_type
  ORDER BY total DESC`;

  const byTypeRows = all(await db.execute({ sql: byTypeSQL, args }));
  const byType = byTypeRows.map((r) => ({
    type: r.business_type as string,
    total: Number(r.total) || 0,
    won: Number(r.won) || 0,
    rejected: Number(r.rejected) || 0,
    lost: Number(r.lost) || 0,
  }));

  const response = NextResponse.json({
    total: Number(stats?.total) || 0,
    emailed: Number(stats?.emailed) || 0,
    messaged: Number(stats?.messaged) || 0,
    called: Number(stats?.called) || 0,
    meetingsBooked: Number(stats?.meetingsBooked) || 0,
    maybe: Number(stats?.maybe) || 0,
    won: Number(stats?.won) || 0,
    lost: Number(stats?.lost) || 0,
    rejected: Number(stats?.rejected) || 0,
    overdue: Number(stats?.overdue) || 0,
    dueToday: Number(stats?.dueToday) || 0,
    totalCapex: Number(stats?.totalCapex) || 0,
    totalMonthly,
    byType,
  });
  response.headers.set("Cache-Control", "private, max-age=5");
  return response;
}
