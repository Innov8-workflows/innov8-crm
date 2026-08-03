// Client-site health checking — reachability, response time and TLS expiry.
//
// Structured after src/lib/geocode.ts, the other hand-rolled outbound call:
// explicit timeout via AbortSignal, and failure modes kept distinct rather than
// collapsed into a boolean. The distinction that matters here is "the site
// answered with an error" (a real problem, e.g. a Pages custom-domain misconfig
// returning 404) versus "we couldn't reach it" (could be the site, could be us)
// — both count as down, but only the first carries an HTTP status worth showing.
//
// No third-party monitoring service: one GET and one TLS handshake per site is
// the entire job, and a dependency would mean lockfile changes in both the
// source tree and the build clone for no gain.

import tls from "node:tls";

export type HealthStatus = "up" | "slow" | "down";

export interface SiteCheckResult {
  status: HealthStatus;
  httpStatus: number;
  responseMs: number;
  error: string;
}

// Fewer days than this left on the certificate and it's worth acting on —
// long enough to be notice rather than an emergency.
export const CERT_WARN_DAYS = 30;

// Above this a site is up but worth flagging — a client's customer on 4G has
// long since hit the back button.
const SLOW_MS = 3000;
const REQUEST_TIMEOUT_MS = 10_000;
const TLS_TIMEOUT_MS = 8_000;

/**
 * projects.domain is stored inconsistently — some rows are bare
 * ("jgslimited.co.uk"), others carry the protocol. LiveClients.tsx already
 * regex-tests for one before building an href; same test here.
 */
export function normaliseUrl(domain: string): string | null {
  const trimmed = (domain || "").trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProtocol);
    if (!u.hostname.includes(".")) return null; // "localhost", typos, placeholder text
    return u.toString();
  } catch {
    return null;
  }
}

export function hostnameOf(domain: string): string | null {
  const url = normaliseUrl(domain);
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * One GET against the site's root. GET rather than HEAD deliberately: some
 * static hosts answer HEAD with 405 while serving GET perfectly well, which
 * would read as an outage that isn't one.
 */
export async function checkSite(domain: string): Promise<SiteCheckResult> {
  const url = normaliseUrl(domain);
  if (!url) {
    return { status: "down", httpStatus: 0, responseMs: 0, error: "No valid domain set" };
  }

  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        // Some hosts/CDNs serve a challenge page to unknown agents.
        "User-Agent": "innov8-crm-monitor/1.0 (+https://crm.innov8workflows.co.uk)",
        "Accept": "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    const responseMs = Date.now() - started;

    if (res.status >= 400) {
      return { status: "down", httpStatus: res.status, responseMs, error: `HTTP ${res.status}` };
    }
    return {
      status: responseMs > SLOW_MS ? "slow" : "up",
      httpStatus: res.status,
      responseMs,
      error: "",
    };
  } catch (err) {
    const responseMs = Date.now() - started;
    let error = "Unreachable";
    if (err instanceof DOMException && err.name === "TimeoutError") {
      error = `No response within ${REQUEST_TIMEOUT_MS / 1000}s`;
    } else if (err instanceof Error && err.message) {
      // undici nests the useful part ("ENOTFOUND", "CERT_HAS_EXPIRED") in .cause
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      error = cause?.code || cause?.message || err.message;
    }
    return { status: "down", httpStatus: 0, responseMs, error: String(error).slice(0, 200) };
  }
}

/**
 * TLS certificate expiry, as an ISO date (YYYY-MM-DD), or null if it can't be
 * read. Needs a raw TLS socket: fetch/undici never exposes the peer
 * certificate, so there is no way to get this from the check above.
 *
 * rejectUnauthorized is false on purpose — an already-expired or mismatched
 * certificate is exactly the condition worth reporting, and refusing the
 * handshake would leave us unable to say why.
 */
export function getCertExpiry(hostname: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(value);
    };

    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: TLS_TIMEOUT_MS },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || !cert.valid_to) return done(null);
        const expiry = new Date(cert.valid_to); // e.g. "Aug 10 12:00:00 2026 GMT"
        done(isNaN(expiry.getTime()) ? null : expiry.toISOString().split("T")[0]);
      }
    );

    socket.on("error", () => done(null));
    socket.on("timeout", () => done(null));
  });
}

/** Whole days from today until `isoDate`; negative once expired. */
export function daysUntil(isoDate: string): number | null {
  if (!isoDate) return null;
  const then = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (isNaN(then)) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((then - todayUtc) / 86_400_000);
}
