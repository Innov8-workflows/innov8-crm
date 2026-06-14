import { NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";

// GET /api/leads/product-rollup
// Per-lead summary of attached products (entity_solutions on the lead), so the
// Prospects grid can render a "Plan / Products" cell without an N-call fan-out.
// Excludes 'declined' (not part of what they're buying). Returns:
//   { rollup: { [lead_id]: { count, monthly, upfront } } }
export async function GET() {
  await initDb();
  const db = getClient();

  const rows = all(await db.execute(`
    SELECT es.entity_id AS lead_id,
           COUNT(*) AS count,
           COALESCE(SUM(es.monthly_upcharge), 0) AS monthly,
           COALESCE(SUM(es.upfront_charged), 0) AS upfront
    FROM entity_solutions es
    WHERE es.entity_type = 'lead' AND es.status != 'declined'
    GROUP BY es.entity_id
  `));

  const rollup: Record<string, { count: number; monthly: number; upfront: number }> = {};
  for (const r of rows) {
    rollup[String(r.lead_id)] = {
      count: Number(r.count) || 0,
      monthly: Number(r.monthly) || 0,
      upfront: Number(r.upfront) || 0,
    };
  }

  return NextResponse.json({ rollup }, {
    // Hot-write — recomputed as products are attached; never serve stale.
    headers: { "Cache-Control": "private, no-store" },
  });
}
