"use client";

import { useState, useEffect, useCallback } from "react";
import Icon from "./Icon";
import LoadingAI from "./LoadingAI";
import { useToast } from "./Toast";
import { healthMeta } from "./HealthBadge";

interface Site {
  project_id: number;
  business_name: string;
  domain: string;
  status: string;
  checked_at: string;
  http_status: number;
  response_ms: number;
  error: string;
  ssl_expires_at: string;
  cert_days: number | null;
  cert_warning: boolean;
  monitored: boolean;
  uptime7: number | null;
  uptime30: number | null;
}

interface OtherMonitor {
  name: string;
  url: string;
  hostname: string;
  status: string;
  response_ms: number;
  uptime7: number | null;
  uptime30: number | null;
}

interface Incident {
  business_name: string;
  checked_at: string;
  status: string;
  duration_sec?: number;
  error: string;
}

interface Summary {
  total: number; up: number; slow: number; down: number; unchecked: number;
  unmonitored: number; cert_warnings: number;
}

const href = (d: string) => (/^https?:\/\//i.test(d) ? d : `https://${d}`);

function when(iso: string): string {
  if (!iso) return "never";
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "never";
  return t.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// 99.995 → "100%", 99.2 → "99.2%", null → "—". One decimal is plenty here.
function pct(v: number | null): string {
  if (v === null) return "—";
  const rounded = Math.round(v * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function uptimeColour(v: number | null): string {
  if (v === null) return "var(--text-quaternary)";
  if (v >= 99.9) return "#22c55e";
  if (v >= 99) return "#f59e0b";
  return "#ef4444";
}

function fmtDuration(sec?: number): string {
  if (!sec || sec <= 0) return "";
  if (sec < 90) return `${sec}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

export default function SiteHealth() {
  const { toast } = useToast();
  const [sites, setSites] = useState<Site[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [others, setOthers] = useState<OtherMonitor[]>([]);
  const [urState, setUrState] = useState<"ok" | "error" | "unconfigured">("ok");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/health").then((r) => r.json());
      setSites(d.sites || []);
      setIncidents(d.incidents || []);
      setOthers(d.other_monitors || []);
      setUrState(d.uptimerobot || "unconfigured");
      setSummary(d.summary || null);
    } catch {
      toast("Couldn't load site health", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Runs the same worker the scheduled job calls — here it authenticates by
  // session rather than the cron token.
  const checkNow = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/health/check", { method: "POST" });
      if (!res.ok) throw new Error();
      const d = await res.json();
      toast(`Checked ${d.checked} site${d.checked === 1 ? "" : "s"}${d.down ? ` — ${d.down} down` : ""}`,
        d.down ? "error" : "success");
      await load();
    } catch {
      toast("Check failed — try again", "error");
    } finally {
      setChecking(false);
    }
  };

  if (loading) return <LoadingAI message="Checking sites" />;

  return (
    <div className="flex-1 overflow-auto">
      {/* Header + summary */}
      <div className="px-5 pt-4 pb-3 sticky top-0 z-10" style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 gap-y-1.5 flex-wrap mb-2.5">
          <Icon name="shield-check" className="w-5 h-5 flex-shrink-0" style={{ color: "var(--accent)" }} />
          <h1 className="text-lg font-bold flex-shrink-0" style={{ color: "var(--text)" }}>Site Health</h1>
          <span className="text-xs truncate hidden md:block" style={{ color: "var(--text-dim)" }}>
            Uptime via UptimeRobot (every 5 min) · certificates checked by the CRM.
          </span>
          <button onClick={checkNow} disabled={checking}
            className="ml-auto text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ background: checking ? "var(--surface3)" : "var(--accent)", color: "#fff", cursor: checking ? "wait" : "pointer" }}>
            {checking ? "Checking…" : <span className="inline-flex items-center gap-1.5"><Icon name="refresh" className="w-4 h-4" /> Check now</span>}
          </button>
        </div>
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            <Stat label="Client sites" value={summary.total} color="var(--text)" />
            <Stat label="Up" value={summary.up} color="#22c55e" />
            <Stat label="Slow" value={summary.slow} color="#f59e0b" />
            <Stat label="Down" value={summary.down} color={summary.down > 0 ? "#ef4444" : "var(--text-dim)"} />
            <Stat label="Not monitored" value={summary.unmonitored} color={summary.unmonitored > 0 ? "#f59e0b" : "var(--text-dim)"} />
            <Stat label="Certs expiring" value={summary.cert_warnings} color={summary.cert_warnings > 0 ? "#f59e0b" : "var(--text-dim)"} />
          </div>
        )}
        {urState !== "ok" && (
          <div className="mt-2 text-[11px] px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b" }}>
            {urState === "unconfigured"
              ? "UptimeRobot isn't connected — add UPTIMEROBOT_API_KEY (a read-only key) in Vercel and redeploy. Showing the CRM's own last-known checks."
              : "UptimeRobot didn't respond — showing the CRM's own last-known checks."}
          </div>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {sites.length === 0 ? (
          <EmptyState text="No live client sites with a domain set. Add a domain on a client's project to start monitoring it." />
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface)" }}>
                    {["Status", "Client", "Domain", "Response", "Uptime 7d / 30d", "Certificate", "Last checked"].map((h) => (
                      <th key={h} className="text-left text-[11px] font-bold uppercase tracking-wider px-3 py-2 whitespace-nowrap"
                        style={{ color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => {
                    const meta = healthMeta({
                      health_status: s.status, health_checked_at: s.checked_at,
                      health_status_code: s.http_status, health_response_ms: s.response_ms,
                      health_error: s.error, ssl_expires_at: s.ssl_expires_at,
                    });
                    return (
                      <tr key={s.project_id} style={{ background: "var(--surface2)", borderTop: "1px solid var(--border)" }}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: meta.color }} title={meta.title}>
                            <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />{meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>
                          {s.business_name}
                          {!s.monitored && (
                            <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle"
                              title="No UptimeRobot monitor covers this domain — add one so an outage isn't invisible"
                              style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", color: "#f59e0b" }}>
                              Not monitored
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <a href={href(s.domain)} target="_blank" rel="noreferrer"
                            className="hover:underline" style={{ color: "var(--accent)" }}>{s.domain}</a>
                          {s.error && <div className="text-[11px] mt-0.5" style={{ color: "#ef4444" }}>{s.error}</div>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {s.status ? `${s.response_ms}ms` : "—"}
                          {s.http_status > 0 && <span className="text-[11px] ml-1" style={{ color: "var(--text-quaternary)" }}>({s.http_status})</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                          <span style={{ color: uptimeColour(s.uptime7) }}>{pct(s.uptime7)}</span>
                          <span className="mx-1" style={{ color: "var(--text-quaternary)" }}>/</span>
                          <span style={{ color: uptimeColour(s.uptime30) }}>{pct(s.uptime30)}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {s.cert_days === null ? (
                            <span style={{ color: "var(--text-quaternary)" }}>—</span>
                          ) : (
                            <span style={{ color: s.cert_days < 0 ? "#ef4444" : s.cert_warning ? "#f59e0b" : "var(--text-secondary)" }}>
                              {s.cert_days < 0 ? `Expired ${Math.abs(s.cert_days)}d ago` : `${s.cert_days}d`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: "var(--text-dim)" }}>{when(s.checked_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Monitored sites that aren't a client (Jay's own site, ad-hoc monitors) */}
        {others.length > 0 && (
          <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Other monitored sites</h2>
              <p className="text-xs" style={{ color: "var(--text-quaternary)" }}>On UptimeRobot but not matched to a live client.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {others.map((m) => {
                const colour = m.status === "up" ? "#22c55e" : m.status === "down" || m.status === "seems_down" ? "#ef4444" : "var(--text-quaternary)";
                return (
                  <div key={m.hostname} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px]"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderLeft: `3px solid ${colour}` }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colour }} />
                    <a href={m.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate hover:underline"
                      style={{ color: "var(--accent)" }}>{m.hostname}</a>
                    <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{m.response_ms}ms</span>
                    <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: uptimeColour(m.uptime30) }}>{pct(m.uptime30)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Incident log — status changes only, so this stays readable */}
        <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Recent changes</h2>
            <p className="text-xs" style={{ color: "var(--text-quaternary)" }}>Only status changes are logged — a site staying up doesn&apos;t fill this list.</p>
          </div>
          {incidents.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "var(--text-dim)" }}>Nothing has changed state yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5">
              {incidents.map((i, idx) => {
                const colour = i.status === "down" ? "#ef4444" : i.status === "slow" ? "#f59e0b" : "#22c55e";
                const dur = fmtDuration(i.duration_sec);
                return (
                  <div key={`${i.business_name}-${i.checked_at}-${idx}`}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px]"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderLeft: `3px solid ${colour}` }}>
                    <span className="font-semibold flex-shrink-0" style={{ color: colour }}>
                      {i.status === "down" ? "Went down" : i.status === "slow" ? "Slowed" : "Recovered"}
                    </span>
                    <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text)" }}>{i.business_name}</span>
                    {dur && <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-dim)" }} title="How long the state lasted">{dur}</span>}
                    {i.error && <span className="text-[11px] truncate hidden sm:block" style={{ color: "var(--text-dim)" }}>{i.error}</span>}
                    <span className="text-[11px] whitespace-nowrap flex-shrink-0" style={{ color: "var(--text-quaternary)" }}>{when(i.checked_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-12" style={{ color: "var(--text-dim)" }}>
      <div className="flex justify-center mb-2" style={{ color: "var(--text-quaternary)" }}><Icon name="shield-check" className="w-9 h-9" /></div>
      <p className="text-sm">{text}</p>
    </div>
  );
}
