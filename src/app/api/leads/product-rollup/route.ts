import { NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";

// GET /api/leads/product-rollup
// Per-lead summary of attached products (entity_solutions on the lead) so the
// Prospects grid cell + the client cards can render without an N-call fan-out.
// Excludes 'declined' (not part of what they're buying). Returns:
//   { rollup: { [lead_id]: { count, monthly, upfront, items: [{ name, category }] } } }
export async function GET() {
  await initDb();
  const db = getClient();

  const rows = all(await db.execute(`
    SELECT es.entity_id AS lead_id, sc.name AS name, sc.category AS category,
           es.monthly_upcharge AS monthly, es.upfront_charged AS upfront
    FROM entity_solutions es
    JOIN solutions_catalogue sc ON sc.id = es.solution_id
    WHERE es.entity_type = 'lead' AND es.status != 'declined'
    ORDER BY sc.sort_order
  `));

  const rollup: Record<string, { count: number; monthly: number; upfront: number; items: { name: string; category: string }[] }> = {};
  for (const r of rows) {
    const id = String(r.lead_id);
    if (!rollup[id]) rollup[id] = { count: 0, monthly: 0, upfront: 0, items: [] };
    rollup[id].count += 1;
    rollup[id].monthly += Number(r.monthly) || 0;
    rollup[id].upfront += Number(r.upfront) || 0;
    rollup[id].items.push({ name: String(r.name), category: String(r.category) });
  }

  return NextResponse.json({ rollup }, {
    // Hot-write — recomputed as products are attached; never serve stale.
    headers: { "Cache-Control": "private, no-store" },
  });
}
