import { NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import { liveClientExistsSql } from "@/lib/statsQueries";
import { CERT_WARN_DAYS, daysUntil } from "@/lib/siteHealth";
import { fetchMonitors, bareHostname, type UrMonitor } from "@/lib/uptimeRobot";

// GET /api/health — current status of every live client's site, plus recent
// incidents. Session-authenticated by the middleware (only /api/health/check is
// in PUBLIC_PATHS, and only because the cron has no session).
//
// Split of responsibilities: UptimeRobot owns uptime (status, response time,
// 7/30-day history — it checks every 5 min from multiple locations), our own
// checker owns TLS expiry (a free UptimeRobot monitor can't see certificates).
// If UptimeRobot is unreachable or the key is missing, rows fall back to the
// DB-backed health_status and the UI shows a quiet notice — a monitoring page
// that 500s because a third party hiccuped would be the wrong kind of irony.

const SLOW_MS = 3000;

export async function GET() {
  await initDb();
  const db = getClient();

  const [sitesRes, incidentsRes, monitors] = await Promise.all([
    db.execute(`
      SELECT p.id, p.domain, p.health_status, p.health_checked_at, p.health_status_code,
             p.health_response_ms, p.health_error, p.ssl_expires_at,
             l.business_name
      FROM projects p JOIN leads l ON p.lead_id = l.id
      WHERE p.domain != '' AND ${liveClientExistsSql("l")}
      ORDER BY l.business_name ASC
    `),
    // Our own transition log — the fallback incident source.
    db.execute(`
      SELECT c.project_id, c.checked_at, c.status, c.http_status, c.response_ms, c.error,
             l.business_name
      FROM site_checks c
      JOIN projects p ON c.project_id = p.id
      JOIN leads l ON p.lead_id = l.id
      WHERE c.is_transition = 1
      ORDER BY c.checked_at DESC
      LIMIT 50
    `),
    fetchMonitors(),
  ]);

  const byHost = new Map<string, UrMonitor>();
  for (const m of monitors || []) if (m.hostname) byHost.set(m.hostname, m);

  const matchedHosts = new Set<string>();
  const sites = all(sitesRes).map((r) => {
    const certDays = daysUntil(String(r.ssl_expires_at || ""));
    const host = bareHostname(String(r.domain || ""));
    const mon = host ? byHost.get(host) : undefined;
    if (mon) matchedHosts.add(mon.hostname);

    // UptimeRobot's verdict when we have one; our stored check otherwise.
    let status = String(r.health_status || "");
    let responseMs = Number(r.health_response_ms) || 0;
    let checkedAt = String(r.health_checked_at || "");
    let error = String(r.health_error || "");
    if (mon) {
      status = mon.status === "up"
        ? ((mon.responseMs ?? 0) > SLOW_MS ? "slow" : "up")
        : mon.status === "seems_down" || mon.status === "down" ? "down"
        : ""; // paused/pending — treat as unchecked rather than inventing health
      responseMs = mon.responseMs ?? 0;
      checkedAt = new Date().toISOString(); // fetched live just now
      error = mon.status === "down" || mon.status === "seems_down"
        ? (mon.logs.find((lg) => lg.type === "down")?.reason || "Not responding")
        : "";
    }

    return {
      project_id: Number(r.id),
      business_name: String(r.business_name || ""),
      domain: String(r.domain || ""),
      status,
      checked_at: checkedAt,
      http_status: mon ? 0 : Number(r.health_status_code) || 0,
      response_ms: responseMs,
      error,
      ssl_expires_at: String(r.ssl_expires_at || ""),
      cert_days: certDays,
      cert_warning: certDays !== null && certDays <= CERT_WARN_DAYS,
      monitored: !!mon,
      uptime7: mon?.uptime7 ?? null,
      uptime30: mon?.uptime30 ?? null,
    };
  });

  // Sort worst-first now statuses are final (down > slow > up > unchecked).
  const rank = (s: string) => (s === "down" ? 0 : s === "slow" ? 1 : s === "up" ? 2 : 3);
  sites.sort((a, b) => rank(a.status) - rank(b.status) || a.business_name.localeCompare(b.business_name));

  // Monitors that aren't a client site (Jay's own site, anything ad-hoc).
  const otherMonitors = (monitors || [])
    .filter((m) => !matchedHosts.has(m.hostname))
    .map((m) => ({
      name: m.name,
      url: m.url,
      hostname: m.hostname,
      status: m.status,
      response_ms: m.responseMs ?? 0,
      uptime7: m.uptime7,
      uptime30: m.uptime30,
    }));

  // Incidents: UptimeRobot's real event log when available (it knows the
  // duration of each outage), else our own transition rows.
  let incidents: Array<Record<string, unknown>>;
  if (monitors) {
    incidents = monitors
      .flatMap((m) => m.logs
        .filter((lg) => lg.type === "down" || lg.type === "up")
        .map((lg) => ({
          business_name: sites.find((s) => bareHostname(s.domain) === m.hostname)?.business_name || m.name,
          status: lg.type,
          checked_at: lg.at,
          duration_sec: lg.durationSec,
          error: lg.reason,
        })))
      .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))
      .slice(0, 50);
  } else {
    incidents = all(incidentsRes);
  }

  return NextResponse.json({
    sites,
    other_monitors: otherMonitors,
    incidents,
    // Distinguish "no key configured" from "key set but fetch failed" so the UI
    // can say the right thing.
    uptimerobot: monitors ? "ok" : (process.env.UPTIMEROBOT_API_KEY ? "error" : "unconfigured"),
    summary: {
      total: sites.length,
      up: sites.filter((s) => s.status === "up").length,
      slow: sites.filter((s) => s.status === "slow").length,
      down: sites.filter((s) => s.status === "down").length,
      unchecked: sites.filter((s) => !s.status).length,
      unmonitored: sites.filter((s) => !s.monitored).length,
      cert_warnings: sites.filter((s) => s.cert_warning).length,
    },
    cert_warn_days: CERT_WARN_DAYS,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
