import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { liveClientExistsSql } from "@/lib/statsQueries";
import { checkSite, getCertExpiry, hostnameOf, daysUntil, type HealthStatus } from "@/lib/siteHealth";
import { isEmailConfigured, sendEmail } from "@/lib/email";

// Runs one health pass over every live client's site. Triggered every 15
// minutes by .github/workflows/site-health.yml (Vercel Hobby crons only fire
// once a day, which would leave a site down for up to 24h before we noticed),
// and on demand from the Site Health view's "Check now" button.
//
// Auth is EITHER a logged-in session (the button) OR the cron bearer token.
// Unlike the old invoices/auto — which did `if (cronSecret && ...)` and was
// therefore wide open whenever the env var was missing — this fails CLOSED:
// no CRON_SECRET configured means the token path is simply unavailable. That
// endpoint was only reachable by Vercel's own scheduler; this one is called
// from the public internet by GitHub Actions, so an unset variable must not
// silently turn it into an open endpoint.

export const maxDuration = 60; // Vercel Hobby ceiling

// Re-read the certificate at most this often. Expiry dates don't move, so
// doing it on every 15-minute pass would be ~96 pointless TLS handshakes per
// site per day.
const CERT_RECHECK_HOURS = 20;
// A site must fail twice in a row before it counts as down. Single blips
// (a CDN hiccup, a slow DNS response) shouldn't paint a red dot or send mail.
const FAILURES_BEFORE_DOWN = 2;

interface ProjectRow {
  id: number;
  domain: string;
  business_name: string;
  health_status: string;
  health_fail_count: number;
  ssl_expires_at: string;
  ssl_checked_at: string;
}

export async function POST(request: NextRequest) {
  const authorised = await isAuthorised(request);
  if (!authorised) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const db = getClient();

  const rows = all(await db.execute(`
    SELECT p.id, p.domain, l.business_name, p.health_status, p.health_fail_count,
           p.ssl_expires_at, p.ssl_checked_at
    FROM projects p JOIN leads l ON p.lead_id = l.id
    WHERE p.domain != '' AND ${liveClientExistsSql("l")}
  `)) as unknown as ProjectRow[];

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, results: [] });
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // All sites in parallel: each has its own 10s ceiling, so the whole pass is
  // bounded by the slowest single site rather than their sum.
  const results = await Promise.all(rows.map((p) => checkOne(db, p, now, today)));

  const newlyDown = results.filter((r) => r.becameDown);
  if (newlyDown.length > 0) await alertIfPossible(newlyDown);

  return NextResponse.json({
    ok: true,
    checked: results.length,
    down: results.filter((r) => r.status === "down").length,
    newly_down: newlyDown.map((r) => r.business_name),
    results: results.map(({ business_name, domain, status, httpStatus, responseMs, error, certDays }) =>
      ({ business_name, domain, status, http_status: httpStatus, response_ms: responseMs, error, cert_days: certDays })),
  });
}

// GitHub Actions posts; keep GET working so the endpoint can be poked from a
// browser or curl during setup.
export { POST as GET };

async function isAuthorised(request: NextRequest): Promise<boolean> {
  const session = await getSession();
  if (session) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — see header comment
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type CheckOutcome = {
  project_id: number;
  business_name: string;
  domain: string;
  status: HealthStatus;
  httpStatus: number;
  responseMs: number;
  error: string;
  certDays: number | null;
  becameDown: boolean;
};

async function checkOne(
  db: ReturnType<typeof getClient>, p: ProjectRow, now: string, today: string
): Promise<CheckOutcome> {
  const result = await checkSite(p.domain);

  // Flap guard: count consecutive failures, and only report "down" once we've
  // seen FAILURES_BEFORE_DOWN of them. Until then the previous status stands.
  const failing = result.status === "down";
  const failCount = failing ? (Number(p.health_fail_count) || 0) + 1 : 0;
  const confirmedDown = failing && failCount >= FAILURES_BEFORE_DOWN;
  const status: HealthStatus = failing
    ? (confirmedDown ? "down" : ((p.health_status as HealthStatus) || "up"))
    : result.status;

  // Certificate: only when we don't have one yet or the last read is stale.
  let sslExpires = p.ssl_expires_at || "";
  let sslChecked = p.ssl_checked_at || "";
  const certStale = !sslChecked || (Date.now() - new Date(sslChecked).getTime()) > CERT_RECHECK_HOURS * 3600_000;
  if (certStale) {
    const host = hostnameOf(p.domain);
    if (host) {
      const expiry = await getCertExpiry(host);
      if (expiry) sslExpires = expiry;
      sslChecked = now;
    }
  }

  await db.execute({
    sql: `UPDATE projects SET health_status = ?, health_checked_at = ?, health_status_code = ?,
            health_response_ms = ?, health_fail_count = ?, health_error = ?,
            ssl_expires_at = ?, ssl_checked_at = ?
          WHERE id = ?`,
    args: [status, now, result.httpStatus, result.responseMs, failCount,
           result.error.slice(0, 200), sslExpires, sslChecked, p.id],
  });

  // History: only on a status change, or once a day as a heartbeat. This is
  // what keeps site_checks small enough to stay useful.
  const changed = status !== (p.health_status || "");
  let shouldLog = changed;
  if (!shouldLog) {
    const seenToday = first(await db.execute({
      sql: "SELECT 1 as v FROM site_checks WHERE project_id = ? AND checked_at >= ? LIMIT 1",
      args: [p.id, `${today} 00:00:00`],
    }));
    shouldLog = !seenToday;
  }
  if (shouldLog) {
    await db.execute({
      sql: `INSERT INTO site_checks (project_id, checked_at, status, http_status, response_ms, error, is_transition)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [p.id, now, status, result.httpStatus, result.responseMs, result.error.slice(0, 200), changed ? 1 : 0],
    });
  }

  return {
    project_id: p.id,
    business_name: p.business_name,
    domain: p.domain,
    status,
    httpStatus: result.httpStatus,
    responseMs: result.responseMs,
    error: result.error,
    certDays: sslExpires ? daysUntil(sslExpires) : null,
    becameDown: changed && status === "down",
  };
}

// Inert until RESEND_API_KEY / RESEND_FROM are set in Vercel, so this ships
// safely today and starts working the moment email is configured.
async function alertIfPossible(down: CheckOutcome[]) {
  if (!isEmailConfigured()) return;
  const to = process.env.RESEND_REPLY_TO || process.env.RESEND_FROM;
  if (!to) return;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const detail = (d: CheckOutcome) => `${d.business_name} — ${d.domain}: ${d.error || `HTTP ${d.httpStatus}`}`;
  const when = new Date().toISOString();
  try {
    await sendEmail({
      to,
      subject: `Site down: ${down.map((d) => d.business_name).join(", ")}`,
      html: `<p>The following client site${down.length === 1 ? " is" : "s are"} not responding:</p>
<ul>${down.map((d) => `<li>${esc(detail(d))}</li>`).join("")}</ul>
<p style="color:#6b7280;font-size:12px">Checked ${esc(when)}</p>`,
      text: `The following client site${down.length === 1 ? " is" : "s are"} not responding:\n\n${down.map(detail).join("\n")}\n\nChecked ${when}`,
    });
  } catch {
    // Never let a mail failure fail the health pass — the CRM already has the
    // status recorded, which is the part that matters.
  }
}
