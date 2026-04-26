import { NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

// Aggregate stats across the upsell programme.
// Returns: per-status counts, MRR/ARR, top-selling solutions, conversion %.
export async function GET() {
  await initDb();
  const db = getClient();

  // Single CASE/WHEN aggregation — same pattern as /api/leads/stats
  const totalsSQL = `SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status = 'proposed' THEN 1 ELSE 0 END) as proposed,
    SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold,
    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
    SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
    COALESCE(SUM(CASE WHEN status IN ('sold','delivered') THEN monthly_upcharge ELSE 0 END), 0) as mrr,
    COALESCE(SUM(CASE WHEN status IN ('sold','delivered') THEN upfront_charged ELSE 0 END), 0) as one_off_revenue
  FROM entity_solutions`;

  const totals = first(await db.execute(totalsSQL));

  // Per-solution breakdown for charts and conversion
  const perSolutionSQL = `SELECT
    sc.id, sc.name,
    SUM(CASE WHEN es.status = 'proposed' THEN 1 ELSE 0 END) as proposed,
    SUM(CASE WHEN es.status = 'sold' THEN 1 ELSE 0 END) as sold,
    SUM(CASE WHEN es.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
    SUM(CASE WHEN es.status = 'declined' THEN 1 ELSE 0 END) as declined,
    COUNT(es.id) as total
  FROM solutions_catalogue sc
  LEFT JOIN entity_solutions es ON es.solution_id = sc.id
  WHERE sc.active = 1
  GROUP BY sc.id, sc.name
  ORDER BY (sold + delivered) DESC, proposed DESC`;

  const perSolution = all(await db.execute(perSolutionSQL)).map((r) => {
    const total = Number(r.total) || 0;
    const sold = Number(r.sold) || 0;
    const delivered = Number(r.delivered) || 0;
    const proposed = Number(r.proposed) || 0;
    const declined = Number(r.declined) || 0;
    const won = sold + delivered;
    const decisive = won + declined;
    return {
      id: Number(r.id),
      name: r.name as string,
      proposed,
      sold,
      delivered,
      declined,
      total,
      conversion_pct: decisive > 0 ? Math.round((won / decisive) * 100) : 0,
    };
  });

  return NextResponse.json({
    total: Number(totals?.total) || 0,
    proposed: Number(totals?.proposed) || 0,
    sold: Number(totals?.sold) || 0,
    delivered: Number(totals?.delivered) || 0,
    declined: Number(totals?.declined) || 0,
    mrr: Number(totals?.mrr) || 0,
    one_off_revenue: Number(totals?.one_off_revenue) || 0,
    per_solution: perSolution,
  }, {
    headers: { "Cache-Control": "private, max-age=10" },
  });
}
