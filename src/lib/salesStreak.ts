import type { Client } from "@libsql/client";
import { all } from "@/lib/db";
import { ukToday } from "@/lib/dateRange";

// The daily sales streak on the Today page: DAILY_GOAL outreach actions keeps the
// flame going. Weekends can't break it, but a weekend that reaches the goal adds to it.
//
// One action is one lead contacted one way on one day, so ten calls to the same lead
// count once. The sources:
//   - call_logs and email_logs, which are dated, so they count back through history.
//   - outreach_events, because the Emailed, Messaged and Called ticks on a lead have no
//     date of their own. Those only count from 2026-11-02, when this table arrived.
// UNION removes the overlap, as logging a call also ticks Called.
//
// Calls and emails to a lead after they became a client aren't outreach. It's tested
// against won_at rather than current status, so winning a client can't rewrite past days.
// Company-wide, like the sales target.

export const DAILY_GOAL = 5;
const HISTORY_DAYS = 400;
const STRIP_DAYS = 14;

export type OutreachKind = "call" | "email" | "message";

export interface StreakDay { day: string; count: number; met: boolean; weekend: boolean }

export interface StreakResponse {
  goal: number;
  today: { count: number; calls: number; emails: number; messages: number };
  streak: number;                   // includes today once today's goal is met
  best: number;
  days: StreakDay[];                // oldest first, ending today
}

const shiftDay = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const isWeekend = (day: string) => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());

/** Records or clears a tick. Never throws: a streak must not be able to fail a lead save. */
export async function recordOutreach(db: Client, kind: OutreachKind, leadIds: number[], done: boolean) {
  const day = ukToday();
  try {
    await db.batch(leadIds.map((id) => (done
      ? { sql: "INSERT OR IGNORE INTO outreach_events (day, kind, lead_id) VALUES (?, ?, ?)", args: [day, kind, id] }
      : { sql: "DELETE FROM outreach_events WHERE day = ? AND kind = ? AND lead_id = ?", args: [day, kind, id] })), "write");
  } catch (e) {
    console.error("[streak] couldn't record outreach", e);
  }
}

export async function buildStreak(db: Client, now = new Date()): Promise<StreakResponse> {
  const today = ukToday(now);
  const from = shiftDay(today, -HISTORY_DAYS);
  const rows = all(await db.execute({
    sql: `SELECT day, kind, COUNT(*) AS n FROM (
            SELECT day, kind, lead_id FROM outreach_events WHERE day >= ?
            UNION
            SELECT substr(c.called_at, 1, 10), 'call', c.lead_id
              FROM call_logs c LEFT JOIN projects p ON p.lead_id = c.lead_id
             WHERE c.called_at >= ? AND (p.id IS NULL OR substr(c.called_at, 1, 10) < COALESCE(NULLIF(p.won_at, ''), '9999'))
            UNION
            SELECT substr(e.sent_at, 1, 10), 'email', e.lead_id
              FROM email_logs e LEFT JOIN projects p ON p.lead_id = e.lead_id
             WHERE e.matched = 1 AND e.sent_at >= ? AND e.sent_at GLOB '[0-9][0-9][0-9][0-9]-*'
               AND (p.id IS NULL OR substr(e.sent_at, 1, 10) < COALESCE(NULLIF(p.won_at, ''), '9999'))
          ) GROUP BY day, kind`,
    args: [from, from, from],
  }));

  const counts = new Map<string, number>();
  const todayKinds: Record<string, number> = {};
  for (const r of rows) {
    const day = String(r.day), n = Number(r.n) || 0;
    counts.set(day, (counts.get(day) || 0) + n);
    if (day === today) todayKinds[String(r.kind)] = n;
  }
  const met = (day: string) => (counts.get(day) || 0) >= DAILY_GOAL;

  // Oldest to newest, so the same walk gives the best run and the one still going.
  let run = 0, best = 0;
  for (let d = from; d < today; d = shiftDay(d, 1)) {
    if (met(d)) { run++; best = Math.max(best, run); }
    else if (!isWeekend(d)) run = 0;
  }
  // Today can only add to the streak. It can't break it until the day is over.
  const streak = run + (met(today) ? 1 : 0);

  return {
    goal: DAILY_GOAL,
    today: {
      count: counts.get(today) || 0,
      calls: todayKinds.call || 0,
      emails: todayKinds.email || 0,
      messages: todayKinds.message || 0,
    },
    streak,
    best: Math.max(best, streak),
    days: Array.from({ length: STRIP_DAYS }, (_, i) => {
      const day = shiftDay(today, i - STRIP_DAYS + 1);
      return { day, count: counts.get(day) || 0, met: met(day), weekend: isWeekend(day) };
    }),
  };
}
