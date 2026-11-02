import type { Client } from "@libsql/client";
import { all } from "@/lib/db";
import { EFFECTIVE_START } from "@/lib/revenuePeriods";
import { monthEnd } from "@/lib/dateRange";

// The monthly sales target: how much new business was sold in a calendar month,
// against what Jay set for it.
//
// DELIBERATELY NOT movement() from revenuePeriods.ts, which answers "how did MRR
// change?". Here the question is "what did I sell?", and three of its rules would
// misstate that:
//   - Its stage gate hides a deal until the project reaches 'build', then back-dates
//     it, so a finished month's score could change. Here a sale counts from the win.
//   - It has no status filter, so proposed and declined lines count. Here only
//     'sold' and 'delivered' do.
//   - It splits New from Expansion by the client's won date. Here both are new
//     recurring revenue sold; a product added to an existing client counts in full.
// So these figures can differ from the Dashboard's New MRR tile. Everything is gross:
// churn stays on the Dashboard, because revenuePeriods.ts can't support a net figure.
//
// Company-wide on purpose. leads.owner has one owner per lead, so one shared target
// measured against a single owner's sales would just read as a miss.

export const HISTORY_MONTHS = 12;

export interface TargetValues { new_mrr: number; setup_fees: number; new_clients: number }

export interface MonthResult {
  month: string;                    // 'YYYY-MM'
  target: TargetValues | null;      // null = before the first target was ever set
  new_mrr: number;
  setup_fees: number;
  new_clients: number;
  hit: boolean | null;              // null = no target, or the month isn't finished
}

export interface Win {
  project_id: number;
  business_name: string;
  monthly: number;
  setup: number;
  new_client: boolean;              // won this month, rather than an add-on sale
}

export interface SalesTargetResponse {
  month: string;
  today: string;
  day: number;
  days_in_month: number;
  current: MonthResult;
  wins: Win[];
  history: MonthResult[];           // oldest first, ending with the current month
  streak: number;                   // finished months in a row that hit the target
}

/** Today in the UK, as 'YYYY-MM-DD'. toISOString would be an hour out in BST. */
export function ukToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** A target stays in force until a later one replaces it, so it's set once. */
function targetFor(month: string, rows: (TargetValues & { month: string })[]): TargetValues | null {
  let found: TargetValues | null = null;
  for (const r of rows) {           // ordered oldest first
    if (r.month > month) break;
    found = { new_mrr: r.new_mrr, setup_fees: r.setup_fees, new_clients: r.new_clients };
  }
  return found;
}

export async function buildSalesTargets(db: Client, now = new Date()): Promise<SalesTargetResponse> {
  const today = ukToday(now);
  const month = today.slice(0, 7);
  const from = addMonths(month, -(HISTORY_MONTHS - 1));
  const to = monthEnd(month);

  const [targetRows, lineRows, clientRows] = await Promise.all([
    db.execute("SELECT month, new_mrr, setup_fees, new_clients FROM sales_targets ORDER BY month ASC"),
    db.execute({
      sql: `SELECT p.id AS project_id, l.business_name,
                   COALESCE(es.monthly_upcharge,0) AS monthly,
                   COALESCE(es.upfront_charged,0)  AS upfront,
                   COALESCE(p.won_at,'')           AS won_at,
                   ${EFFECTIVE_START} AS sold_on
            FROM entity_solutions es
            JOIN leads l ON es.entity_type = 'lead' AND es.entity_id = l.id
            JOIN projects p ON p.lead_id = l.id
            WHERE es.status IN ('sold','delivered')`,
      args: [],
    }),
    db.execute({
      sql: "SELECT won_at FROM projects WHERE won_at >= ? AND won_at < ?",
      args: [`${from}-01`, to],
    }),
  ]);

  const targets = all(targetRows).map((r) => ({
    month: String(r.month),
    new_mrr: Number(r.new_mrr) || 0,
    setup_fees: Number(r.setup_fees) || 0,
    new_clients: Number(r.new_clients) || 0,
  }));

  const lines = all(lineRows)
    .map((r) => ({
      project_id: Number(r.project_id),
      business_name: String(r.business_name || ""),
      monthly: Number(r.monthly) || 0,
      upfront: Number(r.upfront) || 0,
      won_at: String(r.won_at || ""),
      sold_on: String(r.sold_on || ""),
    }))
    .filter((l) => l.sold_on >= `${from}-01` && l.sold_on < to);

  const wonMonths = all(clientRows).map((r) => String(r.won_at).slice(0, 7));

  const history: MonthResult[] = [];
  for (let i = 0; i < HISTORY_MONTHS; i++) {
    const m = addMonths(from, i);
    const inMonth = lines.filter((l) => l.sold_on.slice(0, 7) === m);
    const new_mrr = inMonth.reduce((s, l) => s + l.monthly, 0);
    const target = targetFor(m, targets);
    history.push({
      month: m,
      target,
      new_mrr,
      setup_fees: inMonth.reduce((s, l) => s + l.upfront, 0),
      new_clients: wonMonths.filter((w) => w === m).length,
      // The main target decides the verdict. A month still running has no verdict yet.
      hit: target && m < month ? new_mrr >= target.new_mrr : null,
    });
  }

  let streak = 0;
  for (let i = history.length - 2; i >= 0 && history[i].hit === true; i--) streak++;

  const byClient = new Map<number, Win>();
  for (const l of lines) {
    if (l.sold_on.slice(0, 7) !== month || (!l.monthly && !l.upfront)) continue;
    const w = byClient.get(l.project_id) ?? {
      project_id: l.project_id, business_name: l.business_name, monthly: 0, setup: 0,
      new_client: l.won_at.slice(0, 7) === month,
    };
    w.monthly += l.monthly;
    w.setup += l.upfront;
    byClient.set(l.project_id, w);
  }

  const [y, m] = month.split("-").map(Number);
  return {
    month,
    today,
    day: Number(today.slice(8, 10)),
    days_in_month: new Date(Date.UTC(y, m, 0)).getUTCDate(),
    current: history[history.length - 1],
    wins: [...byClient.values()].sort((a, b) => b.monthly - a.monthly || b.setup - a.setup),
    history,
    streak,
  };
}
