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

  // Today bindings come first because they appear first in the SELECT
  const stats = first(await db.execute({ sql: statsSQL, args: [today, today, ...args] }));

  // "Called" count comes from the custom_called checkbox (cumulative — once called, always counted)
  // "Messaged" needs to include both the WhatsApp column (messaged=1) and the FB Messenger custom field
  let calledCount = 0;
  let fbMessengerOnlyCount = 0;
  try {
    const customCountsSQL = `SELECT
      COUNT(DISTINCT CASE WHEN cfv.field_id = 'custom_called' AND cfv.value = '1' THEN cfv.lead_id END) as called,
      COUNT(DISTINCT CASE WHEN cfv.field_id = 'custom_fb_messenger' AND cfv.value = '1' AND (l.messaged = 0 OR l.messaged IS NULL) THEN cfv.lead_id END) as fb_only
      FROM custom_field_values cfv JOIN leads l ON cfv.lead_id = l.id
      WHERE 1=1`;
    let sql = customCountsSQL;
    const customArgs: InValue[] = [];
    if (ownerParam === "__unassigned__") {
      sql += " AND (l.owner = '' OR l.owner IS NULL)";
    } else if (ownerParam) {
      sql += " AND l.owner = ?";
      customArgs.push(ownerParam);
    }
    const r = first(await db.execute({ sql, args: customArgs }));
    calledCount = Number(r?.called) || 0;
    fbMessengerOnlyCount = Number(r?.fb_only) || 0;
  } catch {}

  // Prospect forecast is product-driven: sum the product line items (any status
  // except declined) attached to open-prospect leads. Open prospect = status not
  // in won/completed (live clients, in /api/clients/stats), rejected, or dead.
  // Replaces the old leads.capex + custom_monthly manual fields.
  let totalMonthly = 0;
  let totalCapex = 0;
  try {
    let psql = `SELECT
        COALESCE(SUM(es.monthly_upcharge), 0) as monthly,
        COALESCE(SUM(es.upfront_charged), 0) as capex
      FROM entity_solutions es
      JOIN leads l ON es.entity_type = 'lead' AND es.entity_id = l.id
      WHERE es.status IN ('proposed','sold','delivered')
        AND l.status NOT IN ('won','completed','rejected','dead')`;
    const pArgs: InValue[] = [];
    if (ownerParam === "__unassigned__") {
      psql += " AND (l.owner = '' OR l.owner IS NULL)";
    } else if (ownerParam) {
      psql += " AND l.owner = ?";
      pArgs.push(ownerParam);
    }
    const r = first(await db.execute({ sql: psql, args: pArgs }));
    totalMonthly = Number(r?.monthly) || 0;
    totalCapex = Number(r?.capex) || 0;
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
    byType,
  });
  response.headers.set("Cache-Control", "private, max-age=5");
  return response;
}
