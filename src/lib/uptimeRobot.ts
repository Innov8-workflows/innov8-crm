// UptimeRobot integration — the uptime half of Site Health.
//
// UptimeRobot checks every site every 5 minutes from multiple locations, which
// is strictly better at "is it up?" than our own single-runner poll — so it
// owns status, response time and uptime history. Our checker (siteHealth.ts)
// keeps the one job UptimeRobot's free tier can't do: TLS certificate expiry
// (sslExpiryDateTime is null on free monitors — verified on Jay's account).
//
// Uses ONLY the read-only-safe endpoint (getMonitors), so the key in Vercel can
// be a Read-Only API Key — the CRM never needs the ability to edit or delete
// monitors, so it shouldn't hold it. Same failure discipline as geocode.ts:
// explicit timeout, and any failure returns null rather than throwing — the
// Site Health page degrading to DB-backed rows must never become a 500.

export type UrStatus = "up" | "down" | "seems_down" | "paused" | "pending";

export interface UrMonitor {
  id: number;
  name: string;
  url: string;
  hostname: string;      // normalised for matching, e.g. "jgslimited.co.uk"
  status: UrStatus;
  responseMs: number | null; // latest response time, if requested
  uptime7: number | null;    // % over last 7 days
  uptime30: number | null;   // % over last 30 days
  intervalSec: number;
  logs: UrLogEvent[];
}

export interface UrLogEvent {
  type: "down" | "up" | "started" | "paused";
  at: string;          // ISO timestamp
  durationSec: number; // how long the state lasted (0 if ongoing/unknown)
  reason: string;
}

const API_URL = "https://api.uptimerobot.com/v2/getMonitors";
const TIMEOUT_MS = 8_000;

// https://uptimerobot.com/api/ — monitor `status` field.
const STATUS_MAP: Record<number, UrStatus> = {
  0: "paused",
  1: "pending",
  2: "up",
  8: "seems_down",
  9: "down",
};

const LOG_TYPE_MAP: Record<number, UrLogEvent["type"]> = {
  1: "down",
  2: "up",
  98: "started",
  99: "paused",
};

/**
 * Bare lowercase hostname for matching a monitor URL against projects.domain.
 * Handles every real variant in Jay's account: bare domains, full URLs,
 * leading www., paths ("innov8workflows.co.uk/index.html"), trailing slashes.
 */
export function bareHostname(input: string): string {
  const trimmed = (input || "").trim().toLowerCase();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** "99.98-100.000" (custom_uptime_ratio for 7-30) → [99.98, 100] */
function parseRatios(s: unknown): [number | null, number | null] {
  const parts = String(s ?? "").split("-").map((p) => parseFloat(p));
  const val = (n: number | undefined) => (n !== undefined && isFinite(n) ? n : null);
  return [val(parts[0]), val(parts[1])];
}

/**
 * All monitors on the account, or null on ANY failure (no key, network error,
 * bad key, malformed response). Callers treat null as "UptimeRobot unavailable"
 * and fall back to the DB-backed status.
 */
export async function fetchMonitors(): Promise<UrMonitor[] | null> {
  const apiKey = process.env.UPTIMEROBOT_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        api_key: apiKey,
        format: "json",
        limit: "50",
        custom_uptime_ratios: "7-30",
        response_times: "1",
        response_times_limit: "1",
        logs: "1",
        logs_limit: "10",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      stat?: string;
      monitors?: Array<{
        id: number; friendly_name?: string; url?: string; status?: number;
        interval?: number; custom_uptime_ratio?: string;
        response_times?: Array<{ value?: number }>;
        logs?: Array<{ type?: number; datetime?: number; duration?: number; reason?: { detail?: string } }>;
      }>;
    };
    // stat:"fail" is how a bad key comes back — with HTTP 200.
    if (data.stat !== "ok" || !Array.isArray(data.monitors)) return null;

    return data.monitors.map((m) => {
      const [uptime7, uptime30] = parseRatios(m.custom_uptime_ratio);
      const rt = m.response_times?.[0]?.value;
      return {
        id: Number(m.id),
        name: String(m.friendly_name || ""),
        url: String(m.url || ""),
        hostname: bareHostname(String(m.url || "")),
        status: STATUS_MAP[Number(m.status)] ?? "pending",
        responseMs: typeof rt === "number" && isFinite(rt) ? rt : null,
        uptime7,
        uptime30,
        intervalSec: Number(m.interval) || 0,
        logs: (m.logs || [])
          .filter((l) => LOG_TYPE_MAP[Number(l.type)])
          .map((l) => ({
            type: LOG_TYPE_MAP[Number(l.type)],
            at: new Date(Number(l.datetime || 0) * 1000).toISOString(),
            durationSec: Number(l.duration) || 0,
            reason: String(l.reason?.detail || ""),
          })),
      };
    });
  } catch {
    return null;
  }
}
