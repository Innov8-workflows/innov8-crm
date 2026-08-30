import type { Client, InValue } from "@libsql/client";
import { all, first, MIGRATED_NOTE } from "@/lib/db";
import { CLIENT_STAGES } from "@/lib/statsQueries";
import { type DayRange, dayBefore, monthEnd, monthsBetween } from "@/lib/dateRange";
export { type DayRange, type RangePreset, DATE_ONLY, isValidDate, presetRange, monthsBetween } from "@/lib/dateRange";

// Agency revenue over an arbitrary date range: what MRR STOOD AT on a given day
// (snapshot) and what CHANGED during a window (movement).
//
// Deliberately its own module. statsQueries.ts is "global aggregates cheap enough to
// sit inside /api/bootstrap's Promise.all"; clientReporting.ts is per-project,
// per-calendar-month, client-facing. This is neither.
//
// DATE HANDLING — read src/lib/clientReporting.ts:15-26 before touching a comparison
// here. The short version: this database stores timestamps in TWO shapes, sometimes
// in the SAME column (projects.created_at is toISOString() when written by the
// conversion POST and datetime('now') when it falls back to the column DEFAULT), and
// comparing the shapes directly silently drops boundary days. Everything below is
// normalised to DATE-ONLY 'YYYY-MM-DD' with substr(col,1,10) and compared half-open:
// start <= x AND x < end.
//
// WHAT THIS CANNOT KNOW. Churn has no history: client_status='lost' overwrites in
// place with no timestamp and there is no transition log, so lost_at only exists
// going forward. Price changes edit monthly_upcharge in place and line items are hard
// DELETEd, so contraction is unknowable and removing a product silently rewrites
// every past month. Callers must render "—" rather than 0 where coverage says the
// data isn't there, and must never present a "net new MRR" figure.

/** Sorts after every real date — "still running". NOT '', which sorts BEFORE
 *  every date and would silently end every live line item. */
const FOREVER = "9999-12-31";

export interface RevenueLine {
  project_id: number;
  monthly: number;
  upfront: number;
  effective_start: string;
  effective_end: string;
  won_at: string;
  is_upsell: boolean;
}

export interface ClientCal {
  project_id: number;
  business_name: string;
  won_at: string;
  lost_at: string;
  client_status: string;
}

function ownerClause(ownerParam: string | null, args: InValue[]): string {
  if (ownerParam === "__unassigned__") return " AND (l.owner = '' OR l.owner IS NULL)";
  if (ownerParam) { args.push(ownerParam); return " AND l.owner = ?"; }
  return "";
}

/**
 * When did this line item's recurring revenue actually begin?
 *
 * Clause order is load-bearing:
 *  1. Migrated base rows carry sold_at = the MIGRATION RUN DATE (db.ts), pure fiction.
 *     The marker note is the only way to tell fiction from fact, so it wins outright.
 *  2. A real sold_at, FLOORED at the won date. ProductPicker attaches products with
 *     status:'sold' on first click, so sold_at can predate conversion — without the
 *     floor, revenue lands in a month where the client didn't exist yet and the
 *     "new MRR" and "clients won" panels tell different stories.
 *  3/4. Fallbacks for the '' sentinel (still proposed, or predates stamping).
 *
 * MAX() here is SQLite's SCALAR max, not the aggregate. '' loses to any real date, so
 * a missing won_at degrades to "no floor" rather than NULL-poisoning the comparison.
 */
const EFFECTIVE_START = `
  CASE
    WHEN es.notes = '${MIGRATED_NOTE}' AND COALESCE(p.won_at,'') != '' THEN p.won_at
    WHEN COALESCE(es.sold_at,'')     != '' THEN MAX(substr(es.sold_at,1,10),     COALESCE(p.won_at,''))
    WHEN COALESCE(es.proposed_at,'') != '' THEN MAX(substr(es.proposed_at,1,10), COALESCE(p.won_at,''))
    WHEN COALESCE(es.created_at,'')  != '' THEN MAX(substr(es.created_at,1,10),  COALESCE(p.won_at,''))
    ELSE COALESCE(p.won_at,'')
  END`;

/**
 * When did it stop?
 *  - declined: updated_at is "last touched", not "declined on" — the best available.
 *  - churned: the recorded lost_at.
 *  - already-lost with no date: end it at its own start so it is NEVER counted. That
 *    keeps today's snapshot equal to the live MRR figure and avoids inventing a churn
 *    cliff on the cutover date for clients lost long ago.
 */
const EFFECTIVE_END = `
  CASE
    WHEN es.status = 'declined' THEN COALESCE(NULLIF(substr(es.updated_at,1,10),''), '${FOREVER}')
    WHEN COALESCE(p.lost_at,'') != '' THEN p.lost_at
    WHEN p.client_status = 'lost' THEN COALESCE(p.won_at,'')
    ELSE '${FOREVER}'
  END`;

/**
 * Every line item on every stage-qualifying client, dated.
 *
 * Note this deliberately does NOT use liveClientExistsSql(): that filters on CURRENT
 * client_status, so a client lost in June would vanish from May's snapshot — which
 * defeats the entire point. Stage membership stays here; lost-ness lives in
 * effective_end, where it can be time-aware.
 */
export async function getRevenueLines(db: Client, ownerParam: string | null): Promise<RevenueLine[]> {
  const args: InValue[] = [];
  const owner = ownerClause(ownerParam, args);
  const rows = all(await db.execute({
    sql: `SELECT p.id AS project_id,
                 COALESCE(es.monthly_upcharge,0) AS monthly,
                 COALESCE(es.upfront_charged,0)  AS upfront,
                 COALESCE(p.won_at,'')           AS won_at,
                 CASE WHEN COALESCE(sc.category,'') != 'website' THEN 1 ELSE 0 END AS is_upsell,
                 ${EFFECTIVE_START} AS effective_start,
                 ${EFFECTIVE_END}   AS effective_end
          FROM entity_solutions es
          JOIN leads l ON es.entity_type = 'lead' AND es.entity_id = l.id
          JOIN projects p ON p.lead_id = l.id
          LEFT JOIN solutions_catalogue sc ON sc.id = es.solution_id
          WHERE p.stage IN ${CLIENT_STAGES}${owner}`,
    args,
  }));
  return rows.map((r) => ({
    project_id: Number(r.project_id),
    monthly: Number(r.monthly) || 0,
    upfront: Number(r.upfront) || 0,
    effective_start: String(r.effective_start || ""),
    effective_end: String(r.effective_end || FOREVER),
    won_at: String(r.won_at || ""),
    is_upsell: Number(r.is_upsell) === 1,
  }));
}

/** The client calendar. Separate query because a client with no line items must still
 *  count towards "clients won" in a period. */
export async function getClientCalendar(db: Client, ownerParam: string | null): Promise<ClientCal[]> {
  const args: InValue[] = [];
  const owner = ownerClause(ownerParam, args);
  const rows = all(await db.execute({
    sql: `SELECT p.id AS project_id, l.business_name,
                 COALESCE(p.won_at,'') AS won_at, COALESCE(p.lost_at,'') AS lost_at,
                 COALESCE(p.client_status,'') AS client_status
          FROM projects p JOIN leads l ON p.lead_id = l.id
          WHERE p.stage IN ${CLIENT_STAGES}${owner}`,
    args,
  }));
  return rows.map((r) => ({
    project_id: Number(r.project_id),
    business_name: String(r.business_name || ""),
    won_at: String(r.won_at || ""),
    lost_at: String(r.lost_at || ""),
    client_status: String(r.client_status || ""),
  }));
}

/* ---------- pure functions: no DB, unit-testable, used by the anchors ---------- */

const liveAt = (l: RevenueLine, d: string) =>
  l.effective_start !== "" && l.effective_start <= d && l.effective_end > d;

const inRange = (x: string, r: DayRange) => x !== "" && x >= r.start && x < r.end;

/** MRR as it stood at instant `d`. */
export function mrrAsAt(lines: RevenueLine[], d: string): number {
  return lines.reduce((n, l) => (liveAt(l, d) ? n + l.monthly : n), 0);
}

/** Live client count at instant `d` — won on or before, not yet churned. */
export function clientsAsAt(cal: ClientCal[], d: string): number {
  return cal.filter((c) => {
    if (c.won_at === "" || c.won_at > d) return false;
    if (c.lost_at !== "") return c.lost_at > d;
    return c.client_status !== "lost";   // lost with no date = never counted
  }).length;
}

export interface Movement {
  newMrr: number; expansionMrr: number; churnedMrr: number;
  newClients: number; churnedClients: number; capex: number;
  reconciles: boolean;
}

export function movement(lines: RevenueLine[], cal: ClientCal[], r: DayRange): Movement {
  let newMrr = 0, expansionMrr = 0, churnedMrr = 0, capex = 0;

  for (const l of lines) {
    if (inRange(l.effective_start, r)) {
      // Won inside the window = new business. Won earlier = an upsell onto an
      // existing client. The distinction is the client's won date, not the product's.
      if (inRange(l.won_at, r)) newMrr += l.monthly; else expansionMrr += l.monthly;
      capex += l.upfront;
    }
    if (inRange(l.effective_end, r)) churnedMrr += l.monthly;
  }

  const newClients = cal.filter((c) => inRange(c.won_at, r)).length;
  const churnedClients = cal.filter((c) => inRange(c.lost_at, r)).length;

  // Every line contributes to the endpoint difference through exactly one of
  // {started, ended, both, neither}, so this identity holds by construction. It is
  // the cheapest possible detector for an off-by-one at a range boundary — the exact
  // bug class this codebase has already shipped once.
  //
  // Both balances are read on the last day INSIDE their window: closing on
  // dayBefore(end), opening on the day before the range began. Reading the close at
  // `end` itself would include a line starting exactly on the boundary, which belongs
  // to the NEXT period and is (correctly) excluded from the movement above.
  const delta = mrrAsAt(lines, dayBefore(r.end)) - mrrAsAt(lines, dayBefore(r.start));
  const reconciles = Math.abs(delta - (newMrr + expansionMrr - churnedMrr)) < 0.005;

  return { newMrr, expansionMrr, churnedMrr, newClients, churnedClients, capex, reconciles };
}

export interface SeriesPoint {
  period: string; mrr: number; newMrr: number; expansionMrr: number;
  churnedMrr: number; clients: number; estimated: boolean;
}

/**
 * Month-by-month, bucketed in JS from the already-fetched arrays.
 *
 * Twelve SQL round trips would be 1.2-3.6s of pure latency (db.ts documents
 * ~100-300ms each) and twelve identical scans of the same ~100 rows. Bucketing one
 * materialised array also makes the reconciliation identity a property of the data
 * rather than an agreement between queries that can drift.
 *
 * If entity_solutions ever exceeds ~5,000 rows this should flip to SQL-side
 * aggregation. At ~100 rows that is years away.
 */
export function monthlySeries(
  lines: RevenueLine[], cal: ClientCal[], r: DayRange, historyFrom: string
): SeriesPoint[] {
  return monthsBetween(r).map((period) => {
    const end = monthEnd(period);
    const close = dayBefore(end);   // last day of the month, where the balance is read
    const bucket: DayRange = { start: `${period}-01`, end };
    const m = movement(lines, cal, bucket);
    return {
      period,
      mrr: mrrAsAt(lines, close),
      newMrr: m.newMrr,
      expansionMrr: m.expansionMrr,
      churnedMrr: m.churnedMrr,
      clients: clientsAsAt(cal, close),
      // Reconstructed from won dates rather than recorded as it happened.
      estimated: historyFrom !== "" && period < historyFrom.slice(0, 7),
    };
  });
}

export interface RevenuePeriodResponse {
  range: DayRange;
  snapshot: { mrr: number; clients: number; at: string };
  opening: { mrr: number; clients: number; at: string };
  movement: Movement;
  series: SeriesPoint[];
  coverage: { historyFrom: string; churnTracked: boolean; contractionTracked: boolean };
}

export async function buildRevenuePeriod(
  db: Client, ownerParam: string | null, r: DayRange
): Promise<RevenuePeriodResponse> {
  const [lines, cal, marker] = await Promise.all([
    getRevenueLines(db, ownerParam),
    getClientCalendar(db, ownerParam),
    db.execute("SELECT value FROM app_meta WHERE key = 'revenue_history_from'").then(first),
  ]);
  const historyFrom = String(marker?.value || "");

  // "All time" asks from 1970. Clamp the start up to the first month that actually
  // contains something, so the chart isn't 600 empty buckets and the caller's span
  // guard doesn't have to allow absurd ranges. The clamped range is returned, so the
  // UI labels what it actually rendered.
  const earliest = [...lines.map((l) => l.effective_start), ...cal.map((c) => c.won_at)]
    .filter((d) => d !== "")
    .sort()[0];
  const start = earliest && r.start < earliest ? `${earliest.slice(0, 7)}-01` : r.start;
  const range: DayRange = { start, end: r.end };

  // Balances are read on the last day INSIDE the range (and, for the opening, the day
  // before it began) so that snapshot - opening == the movement below. `at` is the
  // real date the figure describes, which is also what the UI should label it with:
  // "as at 31 Aug", not "as at 1 Sep".
  const close = dayBefore(range.end);
  const preOpen = dayBefore(range.start);

  return {
    range,
    snapshot: { mrr: mrrAsAt(lines, close), clients: clientsAsAt(cal, close), at: close },
    opening: { mrr: mrrAsAt(lines, preOpen), clients: clientsAsAt(cal, preOpen), at: preOpen },
    movement: movement(lines, cal, range),
    series: monthlySeries(lines, cal, range, historyFrom),
    coverage: {
      historyFrom,
      // Both false before the cutover: churn was never recorded, and contraction
      // (a price cut on a surviving line) is unknowable in any period because
      // monthly_upcharge is edited in place with no history.
      churnTracked: historyFrom !== "",
      contractionTracked: false,
    },
  };
}
