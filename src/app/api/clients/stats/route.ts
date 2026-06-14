import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  const ownerParam = request.nextUrl.searchParams.get("owner");
  const today = new Date().toISOString().split("T")[0];

  // Always JOIN leads for owner filter and capex
  let ownerFilter = "";
  const args: unknown[] = [];
  if (ownerParam === "__unassigned__") {
    ownerFilter = " AND (l.owner = '' OR l.owner IS NULL)";
  } else if (ownerParam) {
    ownerFilter = " AND l.owner = ?";
    args.push(ownerParam);
  }

  // Counts come from projects. A client is "paying" once they've moved past the
  // Onboarding stage (Design & Content onwards = subscription started).
  const countsSql = `SELECT
    SUM(CASE WHEN p.client_status IN ('active','refine') OR p.client_status IS NULL THEN 1 ELSE 0 END) as clientCount,
    SUM(CASE WHEN (p.client_status IN ('active','refine') OR p.client_status IS NULL) AND p.renewal_date != '' AND p.renewal_date < '${today}' THEN 1 ELSE 0 END) as overdueRenewals,
    SUM(CASE WHEN p.client_status = 'lost' THEN 1 ELSE 0 END) as lostClients
  FROM projects p
  JOIN leads l ON p.lead_id = l.id
  WHERE p.stage != 'onboarding'${ownerFilter}`;

  const stats = first(await db.execute({ sql: countsSql, args: args as never[] }));

  // Money is product-driven: sum the sold/delivered product line items attached to
  // each client lead (base plan + add-ons). Replaces the old projects.monthly_fee /
  // leads.capex manual fields.
  const moneySql = `SELECT
    COALESCE(SUM(es.monthly_upcharge), 0) as mrr,
    COALESCE(SUM(es.upfront_charged), 0) as capex
  FROM entity_solutions es
  JOIN leads l ON es.entity_type = 'lead' AND es.entity_id = l.id
  WHERE es.status IN ('sold','delivered')
    AND EXISTS (
      SELECT 1 FROM projects p WHERE p.lead_id = l.id AND p.stage != 'onboarding'
        AND (p.client_status IN ('active','refine') OR p.client_status IS NULL)
    )${ownerFilter}`;
  const money = first(await db.execute({ sql: moneySql, args: args as never[] }));

  const response = NextResponse.json({
    mrr: Number(money?.mrr) || 0,
    capex: Number(money?.capex) || 0,
    clientCount: Number(stats?.clientCount) || 0,
    overdueRenewals: Number(stats?.overdueRenewals) || 0,
    lostClients: Number(stats?.lostClients) || 0,
  });
  // no-store: now product-driven (hot-write via the picker) — must reflect changes immediately.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
