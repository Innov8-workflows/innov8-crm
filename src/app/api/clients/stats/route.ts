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

  // Single query for all client stats (was 5 separate queries)
  const sql = `SELECT
    COALESCE(SUM(CASE WHEN p.client_status IN ('active','refine') OR p.client_status IS NULL THEN p.monthly_fee ELSE 0 END), 0) as mrr,
    COALESCE(SUM(CASE WHEN p.client_status IN ('active','refine') OR p.client_status IS NULL THEN l.capex ELSE 0 END), 0) as capex,
    SUM(CASE WHEN p.client_status IN ('active','refine') OR p.client_status IS NULL THEN 1 ELSE 0 END) as clientCount,
    SUM(CASE WHEN (p.client_status IN ('active','refine') OR p.client_status IS NULL) AND p.renewal_date != '' AND p.renewal_date < '${today}' THEN 1 ELSE 0 END) as overdueRenewals,
    SUM(CASE WHEN p.client_status = 'lost' THEN 1 ELSE 0 END) as lostClients
  FROM projects p
  JOIN leads l ON p.lead_id = l.id
  WHERE p.completed_at != ''${ownerFilter}`;

  const stats = first(await db.execute({ sql, args: args as never[] }));

  const response = NextResponse.json({
    mrr: Number(stats?.mrr) || 0,
    capex: Number(stats?.capex) || 0,
    clientCount: Number(stats?.clientCount) || 0,
    overdueRenewals: Number(stats?.overdueRenewals) || 0,
    lostClients: Number(stats?.lostClients) || 0,
  });
  response.headers.set("Cache-Control", "private, max-age=5");
  return response;
}
