import type { Client } from "@libsql/client";
import crypto from "crypto";
import { all, first } from "@/lib/db";
import { OBJECTIVE_METRICS, type ClientObjective, type ObjectiveMetric } from "@/types";
import type { ReportSnapshot } from "@/lib/reportTemplate";

// Shared per-project, per-period aggregates behind the Client Dashboard and the
// monthly client report.
//
// Deliberately NOT in statsQueries.ts: that module's implicit contract is
// "global aggregates cheap enough to sit inside /api/bootstrap's Promise.all".
// Everything here is scoped to one project and one calendar month. The single
// exception is getClientLeadRollup(), which IS global and IS used by bootstrap.
//
// DATE HANDLING — read before adding a query. site_events.created_at and
// client_leads.received_at are written by SQLite datetime('now') as
// "YYYY-MM-DD HH:MM:SS", while other tables store JS toISOString()
// ("YYYY-MM-DDTHH:MM:SS.sssZ"). Comparing the two formats directly is a bug (a
// space sorts before 'T', silently dropping the boundary day — this shipped in
// the analytics route for months). Every range here is half-open on a DATE-ONLY
// bound: created_at >= '2026-07-01' AND created_at < '2026-08-01'. That is
// correct for both formats AND stays sargable, unlike date(created_at) BETWEEN.
//
// Timezone: datetime('now') is UTC and we're UK, so a lead at 00:30 BST on the
// 1st lands in the previous month. Deliberate — a one-hour edge on a monthly
// count is noise next to the complexity of per-row timezone conversion.

export interface MonthRange { start: string; end: string } // half-open [start, end)

export function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function monthRange(period: string): MonthRange {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

export function isValidPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

/** Format a period for humans: "2026-07" → "July 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// --- Ingest key -------------------------------------------------------------

/**
 * The per-project write key used by that client's Apps Script. 128 bits because
 * it authorises writes (tracking_id, which only identifies, is 48). Minted
 * lazily on first read — same pattern as tracking_id in the analytics route.
 */
export async function mintLeadKey(db: Client, projectId: number): Promise<string> {
  const key = "lk_" + crypto.randomBytes(16).toString("hex");
  await db.execute({ sql: "UPDATE projects SET lead_ingest_key = ? WHERE id = ?", args: [key, projectId] });
  return key;
}

export async function getOrCreateLeadKey(db: Client, projectId: number): Promise<string | null> {
  const row = first(await db.execute({ sql: "SELECT lead_ingest_key FROM projects WHERE id = ?", args: [projectId] }));
  if (!row) return null;
  const existing = String(row.lead_ingest_key || "");
  return existing || (await mintLeadKey(db, projectId));
}

// --- Leads ------------------------------------------------------------------

export interface LeadCounts {
  total: number;
  unique_contacts: number;
  by_source: { source: string; count: number }[];
  daily: { day: string; count: number }[];
}

export async function getLeadCounts(db: Client, projectId: number, r: MonthRange): Promise<LeadCounts> {
  const [totals, bySource, daily] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) AS total,
                   COUNT(DISTINCT CASE WHEN email != '' THEN lower(email)
                                       WHEN phone != '' THEN phone END) AS uniq
            FROM client_leads
            WHERE project_id = ? AND received_at >= ? AND received_at < ?`,
      args: [projectId, r.start, r.end],
    }).then(first),
    db.execute({
      sql: `SELECT CASE WHEN source = '' THEN 'form' ELSE source END AS source, COUNT(*) AS count
            FROM client_leads
            WHERE project_id = ? AND received_at >= ? AND received_at < ?
            GROUP BY 1 ORDER BY count DESC`,
      args: [projectId, r.start, r.end],
    }).then(all),
    db.execute({
      sql: `SELECT date(received_at) AS day, COUNT(*) AS count
            FROM client_leads
            WHERE project_id = ? AND received_at >= ? AND received_at < ?
            GROUP BY date(received_at) ORDER BY day ASC LIMIT 31`,
      args: [projectId, r.start, r.end],
    }).then(all),
  ]);

  return {
    total: Number(totals?.total) || 0,
    unique_contacts: Number(totals?.uniq) || 0,
    by_source: bySource.map((s) => ({ source: String(s.source), count: Number(s.count) })),
    daily: daily.map((d) => ({ day: String(d.day), count: Number(d.count) })),
  };
}

export async function getLeadTotal(db: Client, projectId: number, r: MonthRange): Promise<number> {
  const row = first(await db.execute({
    sql: "SELECT COUNT(*) AS total FROM client_leads WHERE project_id = ? AND received_at >= ? AND received_at < ?",
    args: [projectId, r.start, r.end],
  }));
  return Number(row?.total) || 0;
}

/**
 * Per-project lead summary for the client cards. ONE bounded aggregate for every
 * project at once — never a per-project fan-out (that shape caused the ~30s
 * /api/projects incident). Bounded at the previous month's start so it never
 * scans full history.
 */
export type ClientLeadRollup = Record<string, { month: number; prev: number; unseen: number; last_at: string }>;

export async function getClientLeadRollup(db: Client, now = new Date()): Promise<ClientLeadRollup> {
  const period = currentPeriod(now);
  const cur = monthRange(period);
  const prev = monthRange(prevPeriod(period));

  const rows = all(await db.execute({
    sql: `SELECT project_id,
                 SUM(CASE WHEN received_at >= ? THEN 1 ELSE 0 END) AS month_count,
                 SUM(CASE WHEN received_at >= ? AND received_at < ? THEN 1 ELSE 0 END) AS prev_count,
                 SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS unseen,
                 MAX(received_at) AS last_at
          FROM client_leads
          WHERE received_at >= ?
          GROUP BY project_id`,
    args: [cur.start, prev.start, cur.start, prev.start],
  }));

  const rollup: ClientLeadRollup = {};
  for (const r of rows) {
    rollup[String(r.project_id)] = {
      month: Number(r.month_count) || 0,
      prev: Number(r.prev_count) || 0,
      unseen: Number(r.unseen) || 0,
      last_at: String(r.last_at || ""),
    };
  }
  return rollup;
}

// --- Site metrics (first-party tracker) -------------------------------------

export interface SiteMetrics {
  page_views: number; unique_visitors: number; calls: number; whatsapps: number;
  messengers: number; emails: number; maps: number; socials: number;
  bookings: number; forms: number; interactions: number;
}

const EMPTY_SITE: SiteMetrics = {
  page_views: 0, unique_visitors: 0, calls: 0, whatsapps: 0, messengers: 0,
  emails: 0, maps: 0, socials: 0, bookings: 0, forms: 0, interactions: 0,
};

export async function getSiteMetrics(db: Client, projectId: number, r: MonthRange): Promise<SiteMetrics> {
  const s = first(await db.execute({
    sql: `SELECT
        SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
        SUM(CASE WHEN event_type = 'call_click' THEN 1 ELSE 0 END) AS calls,
        SUM(CASE WHEN event_type = 'whatsapp_click' THEN 1 ELSE 0 END) AS whatsapps,
        SUM(CASE WHEN event_type = 'messenger_click' THEN 1 ELSE 0 END) AS messengers,
        SUM(CASE WHEN event_type = 'email_click' THEN 1 ELSE 0 END) AS emails,
        SUM(CASE WHEN event_type = 'map_click' THEN 1 ELSE 0 END) AS maps,
        SUM(CASE WHEN event_type = 'social_click' THEN 1 ELSE 0 END) AS socials,
        SUM(CASE WHEN event_type = 'booking_click' THEN 1 ELSE 0 END) AS bookings,
        SUM(CASE WHEN event_type = 'form_submit' THEN 1 ELSE 0 END) AS forms,
        COUNT(DISTINCT ip_hash) AS unique_visitors
      FROM site_events
      WHERE project_id = ? AND created_at >= ? AND created_at < ?`,
    args: [projectId, r.start, r.end],
  }));
  if (!s) return { ...EMPTY_SITE };

  const m: SiteMetrics = {
    page_views: Number(s.page_views) || 0,
    unique_visitors: Number(s.unique_visitors) || 0,
    calls: Number(s.calls) || 0,
    whatsapps: Number(s.whatsapps) || 0,
    messengers: Number(s.messengers) || 0,
    emails: Number(s.emails) || 0,
    maps: Number(s.maps) || 0,
    socials: Number(s.socials) || 0,
    bookings: Number(s.bookings) || 0,
    forms: Number(s.forms) || 0,
    interactions: 0,
  };
  // "Interactions" = the contact-intent clicks, matching the Estimated Leads
  // figure SiteAnalyticsModal already shows.
  m.interactions = m.calls + m.whatsapps + m.messengers + m.emails + m.forms + m.bookings;
  return m;
}

// --- SEO --------------------------------------------------------------------

export interface SeoSnapshot { score: number | null; prev: number | null; date: string }

/**
 * Period-bounded on purpose: July's report must show the score as it stood at
 * the end of July, not today's. (projects.seo_cache is always-latest — that's
 * what the client card and the live KPI tile use.)
 */
export async function getSeoSnapshot(db: Client, projectId: number, r: MonthRange): Promise<SeoSnapshot> {
  const rows = all(await db.execute({
    sql: `SELECT score, logged_at FROM seo_reports
          WHERE project_id = ? AND logged_at < ?
          ORDER BY logged_at DESC, id DESC LIMIT 2`,
    args: [projectId, r.end],
  }));
  if (rows.length === 0) return { score: null, prev: null, date: "" };
  return {
    score: Number(rows[0].score),
    prev: rows[1] ? Number(rows[1].score) : null,
    date: String(rows[0].logged_at || ""),
  };
}

// --- Objectives -------------------------------------------------------------

export interface ObjectiveActuals { leads: LeadCounts; site: SiteMetrics; seo: number | null }

function resolveActual(metric: ObjectiveMetric, manualValue: number, a: ObjectiveActuals): number {
  switch (metric) {
    case "leads": return a.leads.total;
    case "unique_contacts": return a.leads.unique_contacts;
    case "page_views": return a.site.page_views;
    case "unique_visitors": return a.site.unique_visitors;
    case "calls": return a.site.calls;
    case "form_submits": return a.site.forms;
    case "seo_score": return a.seo ?? 0;
    default: return manualValue;
  }
}

/**
 * Objectives for a period = that month's own objectives PLUS standing ones
 * (period = ''), each with its actual resolved from the period's real numbers.
 */
export async function getObjectivesWithActuals(
  db: Client, projectId: number, period: string, actuals: ObjectiveActuals
): Promise<ClientObjective[]> {
  const rows = all(await db.execute({
    sql: `SELECT * FROM client_objectives
          WHERE project_id = ? AND (period = ? OR period = '')
          ORDER BY sort_order ASC, id ASC`,
    args: [projectId, period],
  }));

  return rows.map((r) => {
    const metric = String(r.metric || "manual") as ObjectiveMetric;
    const target = Number(r.target) || 0;
    const status = String(r.status || "open") as ClientObjective["status"];
    const actual = resolveActual(metric, Number(r.manual_value) || 0, actuals);
    const pct = target > 0
      ? Math.min(100, Math.round((actual / target) * 100))
      : (status === "done" ? 100 : 0);
    return {
      id: Number(r.id),
      project_id: Number(r.project_id),
      period: String(r.period || ""),
      title: String(r.title || ""),
      detail: String(r.detail || ""),
      metric,
      target,
      manual_value: Number(r.manual_value) || 0,
      status,
      sort_order: Number(r.sort_order) || 0,
      completed_at: String(r.completed_at || ""),
      actual,
      pct,
    };
  });
}

// --- Report snapshot --------------------------------------------------------

const AGENCY = {
  name: "innov8 Workflows",
  url: "https://innov8workflows.co.uk",
  reply_to: process.env.RESEND_REPLY_TO || "",
};

/**
 * Everything the client-facing report renders, resolved for one project+period.
 * Explicit column list on purpose — this leaves the building, so monthly_fee,
 * login_details and project_notes must not be able to ride along.
 */
export async function buildReportSnapshot(
  db: Client, projectId: number, period: string, note = ""
): Promise<ReportSnapshot | null> {
  const range = monthRange(period);
  const prev = monthRange(prevPeriod(period));

  const project = first(await db.execute({
    sql: `SELECT p.id, p.domain, l.business_name, l.contact_name
          FROM projects p JOIN leads l ON p.lead_id = l.id WHERE p.id = ?`,
    args: [projectId],
  }));
  if (!project) return null;

  const [leads, prevLeads, site, prevSite, seo] = await Promise.all([
    getLeadCounts(db, projectId, range),
    getLeadTotal(db, projectId, prev),
    getSiteMetrics(db, projectId, range),
    getSiteMetrics(db, projectId, prev),
    getSeoSnapshot(db, projectId, range),
  ]);

  const objectives = await getObjectivesWithActuals(db, projectId, period, { leads, site, seo: seo.score });

  return {
    business_name: String(project.business_name || ""),
    contact_name: String(project.contact_name || ""),
    period,
    period_label: periodLabel(period),
    domain: String(project.domain || ""),
    leads: {
      total: leads.total,
      prev_total: prevLeads,
      unique_contacts: leads.unique_contacts,
      by_source: leads.by_source,
    },
    site: {
      page_views: site.page_views,
      unique_visitors: site.unique_visitors,
      calls: site.calls,
      forms: site.forms,
      interactions: site.interactions,
      prev_page_views: prevSite.page_views,
    },
    seo: { score: seo.score, prev_score: seo.prev },
    objectives: objectives
      .filter((o) => o.status !== "dropped")
      .map((o) => ({
        title: o.title,
        target: o.target,
        actual: o.actual ?? 0,
        pct: o.pct ?? 0,
        status: o.status,
        unit: OBJECTIVE_METRICS.find((m) => m.value === o.metric)?.unit || "",
      })),
    note,
    agency: AGENCY,
  };
}
