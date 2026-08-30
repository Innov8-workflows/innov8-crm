// Pure date-range helpers, shared by the server aggregation (src/lib/revenuePeriods.ts)
// and the browser control (src/components/DateRangePicker.tsx).
//
// SEPARATE MODULE ON PURPOSE: revenuePeriods.ts imports @/lib/db, which pulls
// @libsql/client. A client component importing anything from there would drag the
// database driver into the browser bundle. Nothing in this file may import db,
// statsQueries or clientReporting.
//
// Every range is half-open [start, end) on DATE-ONLY 'YYYY-MM-DD' bounds — the
// convention documented at src/lib/clientReporting.ts:15-26, which exists because
// this database stores timestamps in two different shapes.

/** Half-open [start, end), both DATE-ONLY 'YYYY-MM-DD'. */
export interface DayRange { start: string; end: string }

export type RangePreset =
  | "this_month" | "last_month" | "last_3m" | "last_6m" | "last_12m" | "ytd" | "all" | "custom";

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Earlier than any plausible record — the "all time" floor. */
export const DAWN = "1970-01-01";

export function isValidDate(s: string): boolean {
  return DATE_ONLY.test(s);
}

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The day before `d`. Ranges are half-open, so the last day actually INSIDE one is
 * dayBefore(end) — and that, not `end`, is where a closing balance must be read.
 * Reading a close at the exclusive end books the next period's first-day business
 * into this period, which the reconciliation anchor catches immediately.
 */
export const dayBefore = (d: string): string => isoDay(new Date(Date.parse(d) - 86400000));

/** Exclusive end of a 'YYYY-MM' month: the first day of the next one. */
export const monthEnd = (period: string): string => {
  const [y, m] = period.split("-").map(Number);
  return isoDay(new Date(Date.UTC(y, m, 1)));
};

/** Resolve a preset to a concrete range. Shared so the API and the picker can never
 *  disagree about what "Last 3m" means. */
export function presetRange(preset: RangePreset, now = new Date()): DayRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const thisMonth = new Date(Date.UTC(y, m, 1));
  const nextMonth = new Date(Date.UTC(y, m + 1, 1));
  switch (preset) {
    case "this_month": return { start: isoDay(thisMonth), end: isoDay(nextMonth) };
    case "last_month": return { start: isoDay(new Date(Date.UTC(y, m - 1, 1))), end: isoDay(thisMonth) };
    case "last_3m":    return { start: isoDay(new Date(Date.UTC(y, m - 2, 1))),  end: isoDay(nextMonth) };
    case "last_6m":    return { start: isoDay(new Date(Date.UTC(y, m - 5, 1))),  end: isoDay(nextMonth) };
    case "ytd":        return { start: isoDay(new Date(Date.UTC(y, 0, 1))),      end: isoDay(nextMonth) };
    case "all":        return { start: DAWN, end: isoDay(nextMonth) };
    case "last_12m":
    default:           return { start: isoDay(new Date(Date.UTC(y, m - 11, 1))), end: isoDay(nextMonth) };
  }
}

/** Every month the range touches, as 'YYYY-MM'. Capped so a corrupt range can't ask
 *  for thousands of buckets. */
export function monthsBetween(r: DayRange, cap = 120): string[] {
  const out: string[] = [];
  const [sy, sm] = r.start.split("-").map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, 1));
  while (isoDay(cur) < r.end && out.length < cap) {
    out.push(isoDay(cur).slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/** "2026-07" → "July 2026". Same output as clientReporting.periodLabel, duplicated
 *  here only because that module can't be imported into the browser bundle. */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "31 Aug 2026" — for labelling a balance date. */
export function dayLabel(d: string): string {
  if (!isValidDate(d)) return d;
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Is this range exactly one calendar month? Drives whether the ‹ › stepper shows. */
export function isWholeMonth(r: DayRange): boolean {
  return /^\d{4}-\d{2}-01$/.test(r.start) && monthEnd(r.start.slice(0, 7)) === r.end;
}

/** Shift a whole-month range by n months. */
export function shiftMonthRange(r: DayRange, delta: number): DayRange {
  const [y, m] = r.start.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 + delta, 1));
  return { start: isoDay(start), end: isoDay(new Date(Date.UTC(y, m + delta, 1))) };
}

/** Human label for whatever the range currently is. */
export function rangeLabel(r: DayRange, preset: RangePreset): string {
  if (preset === "all") return "All time";
  if (isWholeMonth(r)) return periodLabel(r.start.slice(0, 7));
  return `${dayLabel(r.start)} – ${dayLabel(dayBefore(r.end))}`;
}
