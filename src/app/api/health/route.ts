import { NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import { liveClientExistsSql } from "@/lib/statsQueries";
import { CERT_WARN_DAYS, daysUntil } from "@/lib/siteHealth";

// GET /api/health — current status of every live client's site, plus the most
// recent incidents. Session-authenticated by the middleware (only
// /api/health/check is in PUBLIC_PATHS, and only because the GitHub Actions
// cron has no session).

export async function GET() {
  await initDb();
  const db = getClient();

  const [sitesRes, incidentsRes] = await Promise.all([
    db.execute(`
      SELECT p.id, p.domain, p.health_status, p.health_checked_at, p.health_status_code,
             p.health_response_ms, p.health_error, p.ssl_expires_at,
             l.business_name
      FROM projects p JOIN leads l ON p.lead_id = l.id
      WHERE p.domain != '' AND ${liveClientExistsSql("l")}
      ORDER BY
        CASE p.health_status WHEN 'down' THEN 0 WHEN 'slow' THEN 1 WHEN 'up' THEN 2 ELSE 3 END,
        l.business_name ASC
    `),
    // Transitions only — the daily heartbeat rows would drown the list.
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
  ]);

  const sites = all(sitesRes).map((r) => {
    const certDays = daysUntil(String(r.ssl_expires_at || ""));
    return {
      project_id: Number(r.id),
      business_name: String(r.business_name || ""),
      domain: String(r.domain || ""),
      status: String(r.health_status || ""),
      checked_at: String(r.health_checked_at || ""),
      http_status: Number(r.health_status_code) || 0,
      response_ms: Number(r.health_response_ms) || 0,
      error: String(r.health_error || ""),
      ssl_expires_at: String(r.ssl_expires_at || ""),
      cert_days: certDays,
      cert_warning: certDays !== null && certDays <= CERT_WARN_DAYS,
    };
  });

  return NextResponse.json({
    sites,
    incidents: all(incidentsRes),
    summary: {
      total: sites.length,
      up: sites.filter((s) => s.status === "up").length,
      slow: sites.filter((s) => s.status === "slow").length,
      down: sites.filter((s) => s.status === "down").length,
      unchecked: sites.filter((s) => !s.status).length,
      cert_warnings: sites.filter((s) => s.cert_warning).length,
    },
    cert_warn_days: CERT_WARN_DAYS,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
