import { NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

// Aggregate stats across the upsell programme.
// Returns: per-status counts, MRR/ARR, top-selling solutions, conversion %,
// plus a `buyers` list per solution (who has it sold/delivered) so the dashboard
// can show *which* business is behind each count — vital for catching accidental
// status toggles in the matrix.
export async function GET() {
  await initDb();
  const db = getClient();

  // Single CASE/WHEN aggregation. mrr / one_off_revenue are the UPSELL figures —
  // add-ons only (category != 'website'); the base plan is already counted in
  // Client MRR via /api/clients/stats, so excluding it here avoids double counting.
  const totalsSQL = `SELECT
    COUNT(*) as total,
    SUM(CASE WHEN es.status = 'proposed' THEN 1 ELSE 0 END) as proposed,
    SUM(CASE WHEN es.status = 'sold' THEN 1 ELSE 0 END) as sold,
    SUM(CASE WHEN es.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
    SUM(CASE WHEN es.status = 'declined' THEN 1 ELSE 0 END) as declined,
    COALESCE(SUM(CASE WHEN es.status IN ('sold','delivered') AND sc.category != 'website' THEN es.monthly_upcharge ELSE 0 END), 0) as mrr,
    COALESCE(SUM(CASE WHEN es.status IN ('sold','delivered') AND sc.category != 'website' THEN es.upfront_charged ELSE 0 END), 0) as one_off_revenue
  FROM entity_solutions es
  LEFT JOIN solutions_catalogue sc ON sc.id = es.solution_id`;

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

  // For solutions with at least one sold/delivered, fetch the business names behind those rows.
  // Polymorphic join: entity_solutions.entity_type can be 'lead' or 'project'.
  const buyersBySolution: Record<number, Array<{ id: number; entity_type: string; entity_id: number; business_name: string; status: string }>> = {};
  const soldIds = perSolution.filter((s) => s.sold + s.delivered > 0).map((s) => s.id);
  if (soldIds.length > 0) {
    const placeholders = soldIds.map(() => "?").join(",");
    const buyersSQL = `
      SELECT es.id, es.solution_id, es.entity_type, es.entity_id, es.status,
        CASE
          WHEN es.entity_type = 'lead' THEN l.business_name
          WHEN es.entity_type = 'project' THEN pl.business_name
        END as business_name
      FROM entity_solutions es
      LEFT JOIN leads l ON es.entity_type = 'lead' AND l.id = es.entity_id
      LEFT JOIN projects p ON es.entity_type = 'project' AND p.id = es.entity_id
      LEFT JOIN leads pl ON p.lead_id = pl.id
      WHERE es.status IN ('sold','delivered') AND es.solution_id IN (${placeholders})`;
    const buyersRows = all(await db.execute({ sql: buyersSQL, args: soldIds as never[] }));
    for (const row of buyersRows) {
      const sid = Number(row.solution_id);
      if (!buyersBySolution[sid]) buyersBySolution[sid] = [];
      buyersBySolution[sid].push({
        id: Number(row.id),
        entity_type: row.entity_type as string,
        entity_id: Number(row.entity_id),
        business_name: (row.business_name as string) || "(unknown)",
        status: row.status as string,
      });
    }
  }

  // Attach buyers to each per_solution entry
  const perSolutionWithBuyers = perSolution.map((s) => ({
    ...s,
    buyers: buyersBySolution[s.id] || [],
  }));

  return NextResponse.json({
    total: Number(totals?.total) || 0,
    proposed: Number(totals?.proposed) || 0,
    sold: Number(totals?.sold) || 0,
    delivered: Number(totals?.delivered) || 0,
    declined: Number(totals?.declined) || 0,
    mrr: Number(totals?.mrr) || 0,
    one_off_revenue: Number(totals?.one_off_revenue) || 0,
    per_solution: perSolutionWithBuyers,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
