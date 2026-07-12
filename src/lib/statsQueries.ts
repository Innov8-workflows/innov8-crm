import type { Client, InValue } from "@libsql/client";
import { all, first } from "@/lib/db";

// Shared aggregate queries used by /api/leads/stats, /api/clients/stats AND
// /api/bootstrap — one implementation so the consolidated bootstrap response
// can never drift from the standalone endpoints.

export interface LeadStats {
  total: number; emailed: number; messaged: number; called: number;
  meetingsBooked: number; maybe: number; won: number; lost: number;
  rejected: number; overdue: number; dueToday: number;
  totalCapex: number; totalMonthly: number; verbalMonthly: number;
  byType: { type: string; total: number; won: number; rejected: number; lost: number }[];
}

export async function getLeadStats(db: Client, ownerParam: string | null): Promise<LeadStats> {
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

  // Run all independent aggregates in PARALLEL — one round-trip of latency
  // instead of five sequential ones (this was the dominant cost of this endpoint).
  // The custom-fields + money queries stay optional (null on error, as before).
  const [stats, customCounts, money, verbal, byTypeRows] = await Promise.all([
    db.execute({ sql: statsSQL, args: [today, today, ...args] }).then(first),
    db.execute({ sql: customCountsSQL, args }).then(first).catch(() => null),
    db.execute({ sql: moneySQL, args }).then(first).catch(() => null),
    db.execute({ sql: verbalSQL, args }).then(first).catch(() => null),
    db.execute({ sql: byTypeSQL, args }).then(all),
  ]);

  const fbMessengerOnlyCount = Number(customCounts?.fb_only) || 0;

  return {
    total: Number(stats?.total) || 0,
    emailed: Number(stats?.emailed) || 0,
    messaged: (Number(stats?.messaged) || 0) + fbMessengerOnlyCount,
    called: Number(customCounts?.called) || 0,
    meetingsBooked: Number(stats?.meetingsBooked) || 0,
    maybe: Number(stats?.maybe) || 0,
    won: Number(stats?.won) || 0,
    lost: Number(stats?.lost) || 0,
    rejected: Number(stats?.rejected) || 0,
    overdue: Number(stats?.overdue) || 0,
    dueToday: Number(stats?.dueToday) || 0,
    totalCapex: Number(money?.capex) || 0,
    totalMonthly: Number(money?.monthly) || 0,
    verbalMonthly: Number(verbal?.monthly) || 0,
    byType: byTypeRows.map((r) => ({
      type: r.business_type as string,
      total: Number(r.total) || 0,
      won: Number(r.won) || 0,
      rejected: Number(r.rejected) || 0,
      lost: Number(r.lost) || 0,
    })),
  };
}

export interface ClientStats {
  mrr: number; capex: number; clientCount: number; overdueRenewals: number; lostClients: number;
}

export async function getClientStats(db: Client, ownerParam: string | null): Promise<ClientStats> {
  const today = new Date().toISOString().split("T")[0];

  // Always JOIN leads for owner filter and capex
  let ownerFilter = "";
  const args: InValue[] = [];
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

  // Money is product-driven: sum every attached (non-declined) product line item on
  // each client lead — base plan + add-ons — so the board total matches exactly what
  // the cards show. The card value badges come from the product rollup, which also
  // counts everything except 'declined', so this status filter must mirror it.
  const moneySql = `SELECT
    COALESCE(SUM(es.monthly_upcharge), 0) as mrr,
    COALESCE(SUM(es.upfront_charged), 0) as capex
  FROM entity_solutions es
  JOIN leads l ON es.entity_type = 'lead' AND es.entity_id = l.id
  WHERE es.status != 'declined'
    AND EXISTS (
      SELECT 1 FROM projects p WHERE p.lead_id = l.id AND p.stage != 'onboarding'
        AND (p.client_status IN ('active','refine') OR p.client_status IS NULL)
    )${ownerFilter}`;

  // Counts + money are independent — run them in parallel (one round-trip, not two).
  const [stats, money] = await Promise.all([
    db.execute({ sql: countsSql, args }).then(first),
    db.execute({ sql: moneySql, args }).then(first),
  ]);

  return {
    mrr: Number(money?.mrr) || 0,
    capex: Number(money?.capex) || 0,
    clientCount: Number(stats?.clientCount) || 0,
    overdueRenewals: Number(stats?.overdueRenewals) || 0,
    lostClients: Number(stats?.lostClients) || 0,
  };
}

// Per-lead summary of attached products (entity_solutions on the lead) so the
// Prospects grid cell + the client cards can render without an N-call fan-out.
// Excludes 'declined' (not part of what they're buying).
export type ProductRollup = Record<string, { count: number; monthly: number; upfront: number; items: { name: string; category: string }[] }>;

export async function getProductRollup(db: Client): Promise<ProductRollup> {
  const rows = all(await db.execute(`
    SELECT es.entity_id AS lead_id, sc.name AS name, sc.category AS category,
           es.monthly_upcharge AS monthly, es.upfront_charged AS upfront
    FROM entity_solutions es
    JOIN solutions_catalogue sc ON sc.id = es.solution_id
    WHERE es.entity_type = 'lead' AND es.status != 'declined'
    ORDER BY sc.sort_order
  `));

  const rollup: ProductRollup = {};
  for (const r of rows) {
    const id = String(r.lead_id);
    if (!rollup[id]) rollup[id] = { count: 0, monthly: 0, upfront: 0, items: [] };
    rollup[id].count += 1;
    rollup[id].monthly += Number(r.monthly) || 0;
    rollup[id].upfront += Number(r.upfront) || 0;
    rollup[id].items.push({ name: String(r.name), category: String(r.category) });
  }
  return rollup;
}
