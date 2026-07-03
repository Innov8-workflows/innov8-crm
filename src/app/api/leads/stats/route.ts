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

  // Single query for most stats. Top-of-funnel (emailed/messaged) are checkbox-based
  // so they're cumulative — a lead that's been called still counts as "emailed".
  // For "called" and fb-messenger we need to join the custom_field_values table below.
  // Parameterised: today is bound twice for the overdue/dueToday CASE branches.
  const statsSQL = `SELECT
    COUNT(*) as total,
    SUM(CASE WHEN emailed = 1 THEN 1 ELSE 0 END) as emailed,
    SUM(CASE WHEN messaged = 1 THEN 1 ELSE 0 END) as messaged,
    SUM(CASE WHEN status = 'meeting_booked' THEN 1 ELSE 0 END) as meetingsBooked,
    SUM(CASE WHEN status = 'maybe' THEN 1 ELSE 0 END) as maybe,
    SUM(CASE WHEN status IN ('won','completed') THEN 1 ELSE 0 END) as won,
    SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
    SUM(CASE WHEN follow_up_date != '' AND follow_up_date < ? AND status NOT IN ('won','lost','completed','rejected') THEN 1 ELSE 0 END) as overdue,
    SUM(CASE WHEN follow_up_date = ? THEN 1 ELSE 0 END) as dueToday
  FROM leads ${ownerWhere}`;

  // Owner filter for the two leads-JOIN queries (custom counts + money forecast).
  const ownerJoin = ownerParam === "__unassigned__" ? " AND (l.owner = '' OR l.owner IS NULL)"
    : ownerParam ? " AND l.owner = ?" : "";

  // "Called" count = custom_called checkbox; FB-messenger-only adds to "messaged".
  const customCountsSQL = `SELECT
    COUNT(DISTINCT CASE WHEN cfv.field_id = 'custom_called' AND cfv.value = '1' THEN cfv.lead_id END) as called,
    COUNT(DISTINCT CASE WHEN cfv.field_id = 'custom_fb_messenger' AND cfv.value = '1' AND (l.messaged = 0 OR l.messaged IS NULL) THEN cfv.lead_id END) as fb_only
    FROM custom_field_values cfv JOIN leads l ON cfv.lead_id = l.id
    WHERE 1=1${ownerJoin}`;

  // Prospect forecast — product line items (non-declined) on open-prospect leads.
  const moneySQL = `SELECT
      COALESCE(SUM(es.monthly_upcharge), 0) as monthly,
      COALESCE(SUM(es.upfront_charged), 0) as capex
    FROM entity_solutions es
    JOIN leads l ON es.entity_type = 'lead' AND es.entity_id = l.id
    WHERE es.status IN ('proposed','sold','delivered')
      AND l.status NOT IN ('won','completed','rejected','dead')${ownerJoin}`;

  // Verbal-stage forecast — monthly value of the deals verbally agreed (near close).
  const verbalSQL = `SELECT COALESCE(SUM(es.monthly_upcharge), 0) as monthly
    FROM entity_solutions es
    JOIN leads l ON es.entity_type = 'lead' AND es.entity_id = l.id
    WHERE es.status IN ('proposed','sold','delivered')
      AND l.status = 'verbal'${ownerJoin}`;

  // Win/rejection breakdown by business type.
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

  // Run all four independent aggregates in PARALLEL — one round-trip of latency
  // instead of four sequential ones (this was the dominant cost of this endpoint).
  // The custom-fields + money queries stay optional (null on error, as before).
  const [stats, customCounts, money, verbal, byTypeRows] = await Promise.all([
    db.execute({ sql: statsSQL, args: [today, today, ...args] }).then(first),
    db.execute({ sql: customCountsSQL, args }).then(first).catch(() => null),
    db.execute({ sql: moneySQL, args }).then(first).catch(() => null),
    db.execute({ sql: verbalSQL, args }).then(first).catch(() => null),
    db.execute({ sql: byTypeSQL, args }).then(all),
  ]);

  const calledCount = Number(customCounts?.called) || 0;
  const fbMessengerOnlyCount = Number(customCounts?.fb_only) || 0;
  const totalMonthly = Number(money?.monthly) || 0;
  const totalCapex = Number(money?.capex) || 0;
  const verbalMonthly = Number(verbal?.monthly) || 0;
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
    messaged: (Number(stats?.messaged) || 0) + fbMessengerOnlyCount,
    called: calledCount,
    meetingsBooked: Number(stats?.meetingsBooked) || 0,
    maybe: Number(stats?.maybe) || 0,
    won: Number(stats?.won) || 0,
    lost: Number(stats?.lost) || 0,
    rejected: Number(stats?.rejected) || 0,
    overdue: Number(stats?.overdue) || 0,
    dueToday: Number(stats?.dueToday) || 0,
    totalCapex,
    totalMonthly,
    verbalMonthly,
    byType,
  });
  // no-store: prospect monthly/capex are now product-driven — must reflect picker changes immediately.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
