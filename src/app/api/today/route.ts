import { NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import { getClientStats, liveClientExistsSql } from "@/lib/statsQueries";
import { CERT_WARN_DAYS, daysUntil } from "@/lib/siteHealth";
import { fetchMonitors, bareHostname } from "@/lib/uptimeRobot";
import { listOutstanding, byImportance } from "@/lib/tasks";

// GET /api/today — the live half of the "Today" view: one screen of what needs
// Jay this morning, computed from data the CRM already holds. No AI and no
// guessing — every number here is the same number another view shows (money
// from getClientStats like the Live Clients board, site status the way Site
// Health decides it, outstanding items from src/lib/tasks.ts), so the two can
// never disagree. Session-guarded by the middleware.

const ENQUIRY_WINDOW_HOURS = 24;
const LIST_MAX = 12;

const sqlTime = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

export async function GET() {
  await initDb();
  const db = getClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const since = sqlTime(new Date(now.getTime() - ENQUIRY_WINDOW_HOURS * 3600_000));

  const [money, enquiriesRes, followRes, sitesRes, onboardingRes, outstanding, monitors] = await Promise.all([
    getClientStats(db, null),
    db.execute({
      sql: `SELECT c.project_id, COALESCE(l.business_name, '') AS business_name,
                   COUNT(*) AS count, MAX(c.received_at) AS last_at
              FROM client_leads c
              JOIN projects p ON p.id = c.project_id
              JOIN leads l ON l.id = p.lead_id
             WHERE c.received_at >= ? AND c.entry_mode = 'live'
             GROUP BY c.project_id
             ORDER BY count DESC, last_at DESC`,
      args: [since],
    }),
    // Same definition as the Prospects stats bar (statsQueries getLeadStats).
    db.execute({
      sql: `SELECT id, business_name, follow_up_date, status
              FROM leads
             WHERE follow_up_date != '' AND follow_up_date <= ?
               AND status NOT IN ('won','lost','completed','rejected')
             ORDER BY follow_up_date ASC, id ASC`,
      args: [today],
    }),
    db.execute(`
      SELECT p.id, p.domain, p.health_status, p.ssl_expires_at, l.business_name
        FROM projects p JOIN leads l ON p.lead_id = l.id
       WHERE p.domain != '' AND ${liveClientExistsSql("l")}`),
    // Waiting on Jay: sent in but not yet accepted, or accepted but not built.
    // LEFT JOINs: a shared-link submission can exist before it has a project.
    db.execute(`
      SELECT s.id, s.kind, s.status, s.submitted_at, s.queued_at,
             COALESCE(NULLIF(l.business_name, ''), s.label, '') AS business_name
        FROM onboarding_submissions s
        LEFT JOIN projects p ON p.id = s.project_id
        LEFT JOIN leads l ON l.id = p.lead_id
       WHERE s.archived = 0
         AND (s.status = 'submitted' OR (s.status = 'accepted' AND s.kind = 'website'))
       ORDER BY s.submitted_at ASC`),
    listOutstanding(db),
    fetchMonitors(),
  ]);

  // ── Sites: UptimeRobot's verdict when we have it, the stored daily check otherwise
  const byHost = new Map((monitors || []).map((m) => [m.hostname, m]));
  const down: { project_id: number; business_name: string; domain: string }[] = [];
  const ssl: { project_id: number; business_name: string; domain: string; days: number }[] = [];
  for (const r of all(sitesRes)) {
    const site = { project_id: Number(r.id), business_name: String(r.business_name || ""), domain: String(r.domain || "") };
    const mon = byHost.get(bareHostname(site.domain));
    const isDown = mon ? (mon.status === "down" || mon.status === "seems_down") : r.health_status === "down";
    if (isDown) down.push(site);
    const days = daysUntil(String(r.ssl_expires_at || ""));
    if (days !== null && days <= CERT_WARN_DAYS) ssl.push({ ...site, days });
  }
  ssl.sort((a, b) => a.days - b.days);

  // ── Outstanding: the real items (not the generic build checklist), split by
  // who they wait on. "On me" = waiting on nobody and not blocked, i.e. things
  // Jay can actually do today.
  const real = outstanding.filter((t) => !t.template);
  const onMe = real.filter((t) => !t.waiting_on && !t.blocked).sort(byImportance);
  const waiting: Record<string, number> = { client: 0, google: 0, other: 0 };
  for (const t of real) if (t.waiting_on in waiting) waiting[t.waiting_on]++;

  const enquiries = all(enquiriesRes).map((r) => ({
    project_id: Number(r.project_id), business_name: String(r.business_name),
    count: Number(r.count), last_at: String(r.last_at || ""),
  }));
  const follow = all(followRes).map((r) => ({
    id: Number(r.id), business_name: String(r.business_name || ""),
    follow_up_date: String(r.follow_up_date), status: String(r.status || ""),
  }));
  const onboarding = all(onboardingRes).map((r) => ({
    id: Number(r.id), kind: String(r.kind), status: String(r.status),
    business_name: String(r.business_name || ""), submitted_at: String(r.submitted_at || ""),
    queued: String(r.queued_at || "") !== "",
  }));

  return NextResponse.json({
    generated_at: now.toISOString(),
    money: { mrr: money.mrr, clients: money.clientCount, overdue_renewals: money.overdueRenewals },
    enquiries: {
      window_hours: ENQUIRY_WINDOW_HOURS,
      total: enquiries.reduce((n, e) => n + e.count, 0),
      by_client: enquiries,
    },
    follow_ups: {
      overdue: follow.filter((f) => f.follow_up_date < today).length,
      due_today: follow.filter((f) => f.follow_up_date === today).length,
      items: follow.slice(0, LIST_MAX),
    },
    sites: {
      source: monitors ? "uptimerobot" : "daily-check",
      down, ssl, cert_warn_days: CERT_WARN_DAYS,
    },
    onboarding: {
      to_review: onboarding.filter((o) => o.status === "submitted"),
      to_build: onboarding.filter((o) => o.status === "accepted"),
    },
    outstanding: {
      on_me: onMe.length,
      waiting,
      blocked: real.filter((t) => t.blocked).length,
      items: onMe.slice(0, LIST_MAX).map((t) => ({
        id: t.id, project_id: t.project_id, business_name: t.business_name,
        title: t.title, detail: t.detail,
      })),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
