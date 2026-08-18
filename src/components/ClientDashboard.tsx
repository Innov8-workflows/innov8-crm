"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Project, ClientLead, ClientObjective, ObjectiveMetric } from "@/types";
import { OBJECTIVE_METRICS } from "@/types";
import StatTile from "./StatTile";
import LoadingAI from "./LoadingAI";
import Icon from "./Icon";
import { useToast } from "./Toast";

// Per-client monthly view: what their website actually produced (enquiries from
// their own forms + first-party site metrics), how their SEO score is tracking,
// the objectives agreed for the month, and the report that gets emailed to them.

interface DashboardData {
  project: { id: number; lead_id: number; business_name: string; contact_name: string; email: string; domain: string; tracking_id: string; location: string };
  period: string;
  range: { start: string; end: string };
  leads: {
    total: number; prev_total: number; unique_contacts: number;
    by_source: { source: string; count: number }[];
    daily: { day: string; count: number }[];
    recent: ClientLead[];
  };
  site: {
    page_views: number; unique_visitors: number; calls: number; whatsapps: number;
    messengers: number; emails: number; maps: number; socials: number;
    bookings: number; forms: number; interactions: number;
    prev: { page_views: number; unique_visitors: number; interactions: number };
  };
  seo: { score: number | null; prev_score: number | null; report_date: string; last_seo_date: string };
  objectives: ClientObjective[];
  report: { id: number; status: string; recipient: string; sent_at: string; send_count: number; error: string } | null;
}

const seoColor = (s: number | null) => (s === null ? "var(--text-dim)" : s >= 7 ? "#22c55e" : s >= 4 ? "#f59e0b" : "#ef4444");

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
function shiftPeriod(period: string, delta: number) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
/** Default to LAST month during the first few days — that's when you report. */
function defaultPeriod() {
  const now = new Date();
  const cur = now.toISOString().slice(0, 7);
  return now.getUTCDate() <= 5 ? shiftPeriod(cur, -1) : cur;
}

export default function ClientDashboard({
  projectId, onSelectClient, active = true,
}: {
  projectId: number | null;
  onSelectClient: (id: number) => void;
  active?: boolean;
}) {
  const { toast } = useToast();
  const [clients, setClients] = useState<Project[]>([]);
  const [rollup, setRollup] = useState<Record<string, { month: number; prev: number; unseen: number; last_at: string }>>({});
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState(defaultPeriod);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  // Client list — same call LiveClients makes, so its sessionStorage cache is warm.
  const fetchClients = useCallback(async () => {
    const [projRes, rollRes] = await Promise.all([
      fetch("/api/projects?paying=true&client_status=active").then((r) => r.json()).catch(() => ({})),
      fetch("/api/client-leads/rollup").then((r) => r.json()).catch(() => ({})),
    ]);
    const list: Project[] = projRes.projects || [];
    setClients(list);
    setRollup(rollRes.rollup || {});
    if (!projectId && list.length > 0) onSelectClient(list[0].id);
  }, [projectId, onSelectClient]);

  useEffect(() => { if (active) fetchClients(); }, [active, fetchClients]);

  const fetchDashboard = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/client-dashboard?period=${period}`);
      if (!res.ok) { setData(null); return; }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [projectId, period]);

  useEffect(() => { if (active) fetchDashboard(); }, [active, fetchDashboard]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => (c.business_name || "").toLowerCase().includes(q));
  }, [clients, search]);

  const leadDelta = data ? data.leads.total - data.leads.prev_total : 0;
  const maxDaily = data ? Math.max(1, ...data.leads.daily.map((d) => d.count)) : 1;

  return (
    <div className="flex-1 flex min-h-0" style={{ background: "var(--bg)" }}>
      {/* Client rail */}
      <div className="w-60 flex-shrink-0 flex flex-col min-h-0" style={{ borderRight: "1px solid var(--border)", background: "var(--stats-bg)" }}>
        <div className="p-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients…"
            className="w-full px-2.5 py-1.5 text-sm rounded-md"
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }} />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredClients.map((c) => {
            const r = rollup[String(c.id)];
            const isActive = c.id === projectId;
            const delta = r ? r.month - r.prev : 0;
            return (
              <button key={c.id} onClick={() => onSelectClient(c.id)}
                className="w-full text-left px-2.5 py-2 rounded-lg transition-colors"
                style={{
                  background: isActive ? "var(--accent-subtle)" : "transparent",
                  border: `1px solid ${isActive ? "var(--accent)" : "transparent"}`,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--surface2)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                <div className="flex items-center gap-1.5">
                  {r && r.unseen > 0 && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />}
                  <span className="text-sm font-semibold truncate cf-name" style={{ color: isActive ? "var(--accent)" : "var(--text)" }}>
                    {c.business_name}
                  </span>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-dim)" }}>
                  {r ? `${r.month} lead${r.month === 1 ? "" : "s"} this month` : "No leads yet"}
                  {delta !== 0 && (
                    <span style={{ color: delta > 0 ? "#22c55e" : "#ef4444" }}> {delta > 0 ? "↑" : "↓"}{Math.abs(delta)}</span>
                  )}
                </div>
              </button>
            );
          })}
          {filteredClients.length === 0 && (
            <p className="text-xs text-center py-6" style={{ color: "var(--text-quaternary)" }}>No clients found</p>
          )}
        </div>
      </div>

      {/* Detail pane */}
      <div className="flex-1 overflow-auto min-w-0">
        {!projectId ? (
          <p className="text-sm text-center py-16" style={{ color: "var(--text-dim)" }}>Select a client</p>
        ) : loading && !data ? (
          <div className="flex justify-center py-16"><LoadingAI message="Loading client data" /></div>
        ) : !data ? (
          <p className="text-sm text-center py-16" style={{ color: "var(--text-dim)" }}>Couldn&apos;t load this client</p>
        ) : (
          <div className="p-5 space-y-5">
            {/* Header + period stepper */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-xl font-bold truncate cf-name" style={{ color: "var(--text)" }}>{data.project.business_name}</h1>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {[data.project.contact_name, data.project.location].filter(Boolean).join(" · ")}
                  {data.project.domain && (
                    <> · <a href={data.project.domain.startsWith("http") ? data.project.domain : `https://${data.project.domain}`}
                      target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{data.project.domain}</a></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setPeriod((p) => shiftPeriod(p, -1))} className="px-2 py-1.5 rounded-md text-sm"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>‹</button>
                <span className="text-sm font-semibold px-2 min-w-[120px] text-center" style={{ color: "var(--text)" }}>{periodLabel(data.period)}</span>
                <button onClick={() => setPeriod((p) => shiftPeriod(p, 1))} className="px-2 py-1.5 rounded-md text-sm"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>›</button>
                <button onClick={() => setPeriod(defaultPeriod())} className="ml-1 px-2.5 py-1.5 rounded-md text-xs font-semibold"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>Today</button>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatTile label="Leads" value={data.leads.total} icon="paper-plane" color="var(--accent)" delta={leadDelta} />
              <StatTile label="Enquirers" value={data.leads.unique_contacts} icon="user" color="#8b5cf6" />
              <StatTile label="Page Views" value={data.site.page_views} icon="eye" color="#3b82f6"
                delta={data.site.page_views - data.site.prev.page_views} />
              <StatTile label="Visitors" value={data.site.unique_visitors} icon="user" color="#06b6d4"
                delta={data.site.unique_visitors - data.site.prev.unique_visitors} />
              <StatTile label="Calls" value={data.site.calls} icon="phone" color="#22c55e" />
              <StatTile label="SEO Score" value={data.seo.score === null ? "—" : data.seo.score} suffix={data.seo.score === null ? "" : "/10"}
                icon="chart-bar" color={seoColor(data.seo.score)}
                delta={data.seo.score !== null && data.seo.prev_score !== null ? Number((data.seo.score - data.seo.prev_score).toFixed(1)) : null} />
            </div>

            {/* Daily leads + sources */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>Leads by day</p>
                {data.leads.daily.length === 0 ? (
                  <p className="text-xs py-8 text-center" style={{ color: "var(--text-quaternary)" }}>No leads this month</p>
                ) : (
                  <>
                    <div className="flex items-end gap-1 h-24">
                      {data.leads.daily.map((d) => (
                        <div key={d.day} className="flex-1 rounded-t transition-all" title={`${d.day}: ${d.count} lead${d.count === 1 ? "" : "s"}`}
                          style={{ height: `${(d.count / maxDaily) * 100}%`, minHeight: d.count > 0 ? 4 : 1, background: d.count > 0 ? "var(--accent)" : "var(--border)" }} />
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] mt-2" style={{ color: "var(--text-quaternary)" }}>
                      <span>{data.leads.daily[0]?.day}</span>
                      <span>{data.leads.daily[data.leads.daily.length - 1]?.day}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>Where they came from</p>
                {data.leads.by_source.length === 0 ? (
                  <p className="text-xs py-8 text-center" style={{ color: "var(--text-quaternary)" }}>—</p>
                ) : (
                  <div className="space-y-2">
                    {data.leads.by_source.map((s) => (
                      <div key={s.source} className="flex items-center gap-2">
                        <span className="text-xs w-20 truncate capitalize" style={{ color: "var(--text-secondary)" }}>{s.source}</span>
                        <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: "var(--surface2)" }}>
                          <div className="h-full" style={{ width: `${(s.count / data.leads.total) * 100}%`, background: "var(--accent)", opacity: 0.35, borderLeft: "3px solid var(--accent)" }} />
                        </div>
                        <span className="text-xs font-bold w-6 text-right" style={{ color: "var(--text)" }}>{s.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <ObjectivesPanel projectId={data.project.id} period={data.period} objectives={data.objectives} onChanged={fetchDashboard} />

            <ReportPanel projectId={data.project.id} period={data.period} periodName={periodLabel(data.period)}
              clientName={data.project.business_name} report={data.report} onChanged={fetchDashboard} toast={toast} />

            <LeadsTable projectId={data.project.id} leads={data.leads.recent} total={data.leads.total}
              onChanged={fetchDashboard} onGoToPeriod={setPeriod} toast={toast} />

            {/* Lead capture setup */}
            <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <button onClick={() => setShowSetup((s) => !s)} className="w-full flex items-center justify-between px-4 py-3">
                <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Lead capture setup</span>
                <svg className={`w-4 h-4 transition-transform ${showSetup ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: "var(--text-dim)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showSetup && <SetupPanel projectId={data.project.id} trackingId={data.project.tracking_id} toast={toast} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Objectives -------------------------------------------------------------

function ObjectivesPanel({ projectId, period, objectives, onChanged }: {
  projectId: number; period: string; objectives: ClientObjective[]; onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<ObjectiveMetric>("leads");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/projects/${projectId}/objectives`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, title: title.trim(), metric, target: Number(target) || 0 }),
      });
      setTitle(""); setTarget(""); setAdding(false);
      onChanged();
    } finally { setBusy(false); }
  };

  const update = async (id: number, patch: Record<string, unknown>) => {
    await fetch(`/api/projects/${projectId}/objectives`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    onChanged();
  };

  const remove = async (id: number) => {
    await fetch(`/api/projects/${projectId}/objectives?objective_id=${id}`, { method: "DELETE" });
    onChanged();
  };

  const carryForward = async () => {
    const res = await fetch(`/api/projects/${projectId}/objectives`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: period }),
    }).then((r) => r.json());
    if (res.copied === 0) alert("Nothing open to carry forward from last month.");
    onChanged();
  };

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Objectives this month</p>
        <div className="flex gap-1.5">
          <button onClick={carryForward} className="text-xs px-2.5 py-1 rounded-md"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>Carry forward</button>
          <button onClick={() => setAdding((a) => !a)} className="text-xs font-semibold px-2.5 py-1 rounded-md"
            style={{ background: "var(--accent)", color: "#fff" }}>+ Add</button>
        </div>
      </div>

      {adding && (
        <div className="flex flex-wrap gap-2 mb-3 p-2.5 rounded-lg" style={{ background: "var(--surface2)" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Objective, e.g. 20 leads this month" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="flex-1 min-w-[200px] px-2 py-1.5 text-xs rounded-md"
            style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
          <select value={metric} onChange={(e) => setMetric(e.target.value as ObjectiveMetric)}
            className="px-2 py-1.5 text-xs rounded-md"
            style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }}>
            {OBJECTIVE_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target" type="number"
            className="w-20 px-2 py-1.5 text-xs rounded-md"
            style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
          <button onClick={add} disabled={busy} className="px-3 py-1.5 text-xs font-semibold rounded-md" style={{ background: "var(--accent)", color: "#fff" }}>Save</button>
        </div>
      )}

      {objectives.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: "var(--text-quaternary)" }}>No objectives set for this month</p>
      ) : (
        <div className="space-y-2">
          {objectives.map((o) => {
            const done = o.status === "done" || (o.target > 0 && (o.actual || 0) >= o.target);
            const unit = OBJECTIVE_METRICS.find((m) => m.value === o.metric)?.unit || "";
            return (
              <div key={o.id} className="group flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--surface2)" }}>
                <button onClick={() => update(o.id, { status: o.status === "done" ? "open" : "done" })}
                  className="flex-shrink-0 rounded-full flex items-center justify-center"
                  style={{ width: 16, height: 16, background: done ? "#22c55e" : "transparent", border: done ? "none" : "1px solid var(--text-quaternary)" }}>
                  {done && <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} style={{ width: 10, height: 10 }}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate" style={{ color: "var(--text)", textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>
                      {o.title}{o.period === "" && <span className="ml-1.5 text-[10px]" style={{ color: "var(--text-quaternary)" }}>standing</span>}
                    </span>
                    {o.target > 0 && (
                      <span className="text-[11px] font-bold flex-shrink-0" style={{ color: done ? "#22c55e" : "var(--text-secondary)" }}>
                        {o.actual ?? 0} / {o.target} {unit}
                      </span>
                    )}
                  </div>
                  {o.target > 0 && (
                    <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--border)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${o.pct ?? 0}%`, background: done ? "#22c55e" : "var(--accent)" }} />
                    </div>
                  )}
                </div>
                <button onClick={() => remove(o.id)} title="Delete objective"
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: "var(--text-dim)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Monthly report ---------------------------------------------------------

function ReportPanel({ projectId, period, periodName, clientName, report, onChanged, toast }: {
  projectId: number; period: string; periodName: string; clientName: string;
  report: DashboardData["report"]; onChanged: () => void;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ html: string; subject: string; recipient: string; cc: string; email_configured: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [subject, setSubject] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "test" | "send">("");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Re-render the preview server-side — never rebuild it client-side, or the
  // preview silently drifts from what actually gets sent.
  const loadPreview = useCallback(async (withNote?: string) => {
    setBusy("preview");
    try {
      const q = new URLSearchParams({ period });
      if (withNote !== undefined) q.set("note", withNote);
      const d = await fetch(`/api/projects/${projectId}/report?${q}`).then((r) => r.json());
      setPreview(d);
      if (withNote === undefined) setNote(d.snapshot?.note || "");
      setSubject(d.subject || "");
      setTo(d.recipient || "");
      setCc(d.cc || "");
    } finally { setBusy(""); }
  }, [projectId, period]);

  useEffect(() => { setPreview(null); setResult(null); setOpen(false); }, [period, projectId]);

  const openPanel = async () => {
    setOpen(true);
    if (!preview) await loadPreview();
  };

  const post = async (payload: Record<string, unknown>, kind: "test" | "send") => {
    setBusy(kind);
    setResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, subject, note, cc, to, ...payload }),
      });
      const d = await res.json();
      if (d.ok) {
        setResult({ ok: true, msg: kind === "test" ? `Test sent to ${d.recipient}` : `Sent to ${d.recipient}` });
        toast(kind === "test" ? "Test email sent" : "Report sent", "success");
        if (kind === "send") onChanged();
      } else {
        setResult({ ok: false, msg: d.error || "Send failed" });
      }
    } catch (err) {
      setResult({ ok: false, msg: String(err) });
    } finally { setBusy(""); }
  };

  const send = () => {
    if (!confirm(`Send the ${periodName} report to ${to}?\n\nThis emails ${clientName} directly.`)) return;
    post({}, "send");
  };

  const sent = report?.status === "sent";

  return (
    <div className="rounded-xl" style={{ background: "var(--surface)", border: `1px solid ${sent ? "#22c55e40" : "var(--border)"}` }}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="paper-plane" className="w-4 h-4 flex-shrink-0" style={{ color: sent ? "#22c55e" : "var(--accent)" }} />
          <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{periodName} report</span>
          {sent && (
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e55" }}>
              Sent{report?.send_count && report.send_count > 1 ? ` ×${report.send_count}` : ""}
            </span>
          )}
          {report?.status === "failed" && (
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#ef444422", color: "#ef4444", border: "1px solid #ef444455" }}>Failed</span>
          )}
        </div>
        <button onClick={() => (open ? setOpen(false) : openPanel())}
          className="text-xs font-semibold px-3 py-1.5 rounded-md"
          style={{ background: open ? "var(--surface2)" : "var(--accent)", color: open ? "var(--text-muted)" : "#fff", border: open ? "1px solid var(--border-light)" : "none" }}>
          {open ? "Close" : sent ? "View / resend" : "Generate report"}
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
          {busy === "preview" && !preview ? (
            <div className="py-8 flex justify-center"><LoadingAI message="Building report" /></div>
          ) : preview ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
                <label className="text-xs" style={{ color: "var(--text-dim)" }}>
                  To
                  <input value={to} onChange={(e) => setTo(e.target.value)}
                    className="w-full mt-1 px-2 py-1.5 text-xs rounded-md cf-name"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
                </label>
                <label className="text-xs" style={{ color: "var(--text-dim)" }}>
                  CC (optional)
                  <input value={cc} onChange={(e) => setCc(e.target.value)}
                    className="w-full mt-1 px-2 py-1.5 text-xs rounded-md"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
                </label>
              </div>
              <label className="text-xs block" style={{ color: "var(--text-dim)" }}>
                Subject
                <input value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="w-full mt-1 px-2 py-1.5 text-xs rounded-md"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
              </label>
              <label className="text-xs block" style={{ color: "var(--text-dim)" }}>
                What we did this month (appears in the report)
                <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                  onBlur={() => loadPreview(note)}
                  placeholder="e.g. Published two new service pages, refreshed the gallery, submitted the updated sitemap…"
                  className="w-full mt-1 px-2 py-1.5 text-xs rounded-md resize-none"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
              </label>

              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <iframe title="Report preview" srcDoc={preview.html} sandbox="" style={{ width: "100%", height: 620, background: "#fff", border: "none" }} />
              </div>

              {!preview.email_configured && (
                <p className="text-xs px-3 py-2 rounded-md" style={{ background: "#f59e0b18", border: "1px solid #f59e0b55", color: "#f59e0b" }}>
                  Email isn&apos;t configured yet — add RESEND_API_KEY and RESEND_FROM in Vercel (and verify the domain) before sending.
                </p>
              )}
              {result && (
                <p className="text-xs px-3 py-2 rounded-md" style={{
                  background: result.ok ? "#22c55e18" : "#ef444418",
                  border: `1px solid ${result.ok ? "#22c55e55" : "#ef444455"}`,
                  color: result.ok ? "#22c55e" : "#ef4444",
                }}>{result.msg}</p>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => post({ test: true }, "test")} disabled={busy !== ""}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)", opacity: busy ? 0.6 : 1 }}>
                  {busy === "test" ? "Sending…" : "Send test to me"}
                </button>
                <button onClick={send} disabled={busy !== "" || !to}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md"
                  style={{ background: "var(--accent)", color: "#fff", opacity: busy || !to ? 0.6 : 1 }}>
                  {busy === "send" ? "Sending…" : sent ? `Resend to ${clientName}` : `Send to ${clientName}`}
                </button>
                <button onClick={() => { fetch(`/api/projects/${projectId}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, subject, note, cc, to, draft: true }) }); toast("Draft saved", "info"); }}
                  className="text-xs px-3 py-1.5 rounded-md"
                  style={{ background: "transparent", border: "1px solid var(--border-light)", color: "var(--text-dim)" }}>
                  Save draft
                </button>
                {report?.sent_at && (
                  <span className="text-[11px] ml-auto" style={{ color: "var(--text-quaternary)" }}>
                    Last sent {new Date(report.sent_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} to {report.recipient}
                  </span>
                )}
              </div>
              {report?.error && (
                <p className="text-[11px]" style={{ color: "#ef4444" }}>Last error: {report.error}</p>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// --- Leads table ------------------------------------------------------------

interface ImportSummary {
  dry_run: boolean; file: string; total_rows: number; ready: number; inserted: number;
  skipped: Record<string, number>;
  date_range: { first: string; last: string };
  by_month: { period: string; count: number }[];
  by_type: { type: string; count: number }[];
  earliest_live: string;
  samples: Record<string, string>[];
  problems: { row: number; reason: string; value: string }[];
  id_range: { from: number; to: number } | null;
}

const SKIP_LABELS: Record<string, string> = {
  bad_timestamp: "unreadable date",
  click_event: "click events",
  no_contact: "no contact details",
  after_cutoff: "after the cutoff",
  duplicate_in_file: "duplicated in the file",
  already_in_crm: "already in the CRM",
};

const MANUAL_SOURCES = ["Phone call", "Email", "Walk-in", "Referral", "Other"];

// Matches the inline-form inputs in ObjectivesPanel above.
const fieldStyle = {
  background: "var(--surface)", border: "1px solid var(--border-light)",
  color: "var(--text)", outline: "none",
};

// What the dry run found. Shown before anything is written, because the two ways
// an import goes wrong — a misread date column and a mis-mapped header — are both
// silent, and only surface months later inside a report Jay bills against.
function ImportPreview({ s }: { s: ImportSummary }) {
  const skips = Object.entries(s.skipped).filter(([, n]) => n > 0);
  return (
    <div className="rounded-lg p-2.5 text-xs space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
      <div style={{ color: "var(--text)" }}>
        <strong>{s.ready}</strong> of {s.total_rows} rows ready to import
        {s.date_range.first && (
          <span style={{ color: "var(--text-quaternary)" }}>
            {" "}· {s.date_range.first.slice(0, 10)} to {s.date_range.last.slice(0, 10)}
          </span>
        )}
      </div>

      {skips.length > 0 && (
        <div style={{ color: "var(--text-muted)" }}>
          Skipping: {skips.map(([k, n]) => `${n} ${SKIP_LABELS[k] || k}`).join(" · ")}
        </div>
      )}

      {s.by_month.length > 0 && (
        <div>
          <p className="mb-1" style={{ color: "var(--text-dim)" }}>By month</p>
          <div className="flex flex-wrap gap-1">
            {s.by_month.map((m) => (
              <span key={m.period} className="px-1.5 py-0.5 rounded"
                style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
                {m.period} · {m.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {s.samples.length > 0 && (
        <div>
          {/* The eyeball check: a US-locale export or a shifted header row shows up
              here instantly, and nowhere else until it is too late. */}
          <p className="mb-1" style={{ color: "var(--text-dim)" }}>First rows as they will be saved</p>
          <div className="space-y-0.5" style={{ color: "var(--text-secondary)" }}>
            {s.samples.map((r, i) => (
              <div key={i} className="truncate">
                {r.received_at} · {r.name || "(no name)"} · {r.phone || "—"} · {r.source}
                {r.message ? ` · ${r.message}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {s.problems.length > 0 && (
        <div style={{ color: "#f59e0b" }}>
          Unreadable dates on {s.problems.length === 20 ? "20+" : s.problems.length} row(s):{" "}
          {s.problems.slice(0, 3).map((p) => `row ${p.row} "${p.value}"`).join(", ")}
        </div>
      )}
    </div>
  );
}

function LeadsTable({ projectId, leads, total, onChanged, onGoToPeriod, toast }: {
  projectId: number; leads: ClientLead[]; total: number; onChanged: () => void;
  onGoToPeriod: (period: string) => void;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);

  // Manual entry
  const today = new Date().toISOString().slice(0, 10);
  const [mName, setMName] = useState("");
  const [mPhone, setMPhone] = useState("");
  const [mEmail, setMEmail] = useState("");
  const [mMessage, setMMessage] = useState("");
  const [mDate, setMDate] = useState(today);
  const [mSource, setMSource] = useState(MANUAL_SOURCES[0]);

  // Import
  const [file, setFile] = useState<File | null>(null);
  const [includeClicks, setIncludeClicks] = useState(false);
  const [cutoff, setCutoff] = useState("");
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);

  const resetManual = () => {
    setMName(""); setMPhone(""); setMEmail(""); setMMessage("");
    setMDate(today); setMSource(MANUAL_SOURCES[0]);
  };

  const addManual = async () => {
    if (!mName.trim() && !mPhone.trim() && !mEmail.trim()) {
      toast("Give it a name, phone or email", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/client-leads`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mName, phone: mPhone, email: mEmail, message: mMessage,
          received_at: mDate, source: mSource, form_name: "Added by hand",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Could not add that enquiry", "error");
        return;
      }
      resetManual();
      setAdding(false);
      // The list only shows the selected month, so say where it went.
      const month = new Date(mDate + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      toast(`Enquiry added to ${month}`, "success");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("include_clicks", String(includeClicks));
      fd.append("dry_run", String(dryRun));
      if (cutoff) fd.append("before", cutoff);
      // No Content-Type header — the browser sets the multipart boundary.
      const res = await fetch(`/api/projects/${projectId}/client-leads/import`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Import failed", "error");
        return;
      }
      if (dryRun) {
        setPreview(data);
        // The route knows when the live sync started; Jay has no other way to find it.
        if (!cutoff && data.earliest_live) setCutoff(data.earliest_live);
      } else {
        setPreview(null);
        setLastImport(data);
        setFile(null);
        const months = data.by_month.length;
        toast(`Imported ${data.inserted} enquiries across ${months} month${months === 1 ? "" : "s"}`, "success");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const undoImport = async () => {
    const r = lastImport?.id_range;
    if (!r) return;
    if (!confirm(`Remove the ${lastImport?.inserted} enquiries from that import?`)) return;
    const res = await fetch(
      `/api/projects/${projectId}/client-leads?from_id=${r.from}&to_id=${r.to}`, { method: "DELETE" });
    const data = await res.json();
    setLastImport(null);
    toast(`Removed ${data.deleted || 0} imported enquiries`, "info");
    onChanged();
  };

  const markSeen = async () => {
    const ids = leads.filter((l) => l.status === "new").map((l) => l.id);
    if (ids.length === 0) return;
    await fetch(`/api/projects/${projectId}/client-leads`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: "seen" }),
    });
    onChanged();
  };

  const del = async (id: number) => {
    if (!confirm("Delete this enquiry? This can't be undone.")) return;
    await fetch(`/api/projects/${projectId}/client-leads?lead_id=${id}`, { method: "DELETE" });
    toast("Enquiry deleted", "info");
    onChanged();
  };

  const unseen = leads.filter((l) => l.status === "new").length;

  return (
    <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
          Enquiries {total > leads.length && <span style={{ color: "var(--text-quaternary)" }}>(showing {leads.length} of {total})</span>}
        </p>
        <div className="flex gap-1.5">
          {unseen > 0 && (
            <button onClick={markSeen} className="text-xs px-2.5 py-1 rounded-md"
              style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
              Mark {unseen} as seen
            </button>
          )}
          <button onClick={() => { setImporting((v) => !v); setAdding(false); }} className="text-xs px-2.5 py-1 rounded-md"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
            Import history
          </button>
          <button onClick={() => { setAdding((v) => !v); setImporting(false); }} className="text-xs font-semibold px-2.5 py-1 rounded-md"
            style={{ background: "var(--accent)", color: "#fff" }}>+ Add</button>
        </div>
      </div>

      {adding && (
        <div className="flex flex-wrap gap-2 px-4 py-3" style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
          <input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Name" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") addManual(); }}
            className="px-2 py-1.5 text-xs rounded-md" style={fieldStyle} />
          <input value={mPhone} onChange={(e) => setMPhone(e.target.value)} placeholder="Phone"
            onKeyDown={(e) => { if (e.key === "Enter") addManual(); }}
            className="px-2 py-1.5 text-xs rounded-md" style={fieldStyle} />
          <input value={mEmail} onChange={(e) => setMEmail(e.target.value)} placeholder="Email"
            onKeyDown={(e) => { if (e.key === "Enter") addManual(); }}
            className="px-2 py-1.5 text-xs rounded-md" style={fieldStyle} />
          <input value={mMessage} onChange={(e) => setMMessage(e.target.value)} placeholder="What did they want?"
            onKeyDown={(e) => { if (e.key === "Enter") addManual(); }}
            className="flex-1 min-w-[200px] px-2 py-1.5 text-xs rounded-md" style={fieldStyle} />
          <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} max={today}
            className="px-2 py-1.5 text-xs rounded-md" style={fieldStyle} />
          <select value={mSource} onChange={(e) => setMSource(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-md" style={fieldStyle}>
            {MANUAL_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={addManual} disabled={busy} className="px-3 py-1.5 text-xs font-semibold rounded-md"
            style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {importing && (
        <div className="px-4 py-3 space-y-2.5" style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Export the client&apos;s lead sheet (File → Download → CSV) and drop it here. Nothing is
            written until you&apos;ve seen the preview.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".csv,.xlsx,.xls,.tsv"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }}
              className="text-xs rounded-md px-2 py-1.5" style={{ ...fieldStyle, cursor: "pointer" }} />
            <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              <span style={{ color: "var(--text-dim)" }}>Only rows before</span>
              <input type="date" value={cutoff} onChange={(e) => { setCutoff(e.target.value); setPreview(null); }}
                className="px-2 py-1.5 text-xs rounded-md" style={fieldStyle} />
            </label>
          </div>

          <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" checked={includeClicks}
              onChange={(e) => { setIncludeClicks(e.target.checked); setPreview(null); }} className="mt-0.5" />
            <span>
              Include click events (Call / WhatsApp / Text taps)
              <span className="block" style={{ color: "var(--text-quaternary)" }}>
                Off = form submissions only. Turning this on raises the enquiry count in every
                historical report for this client.
              </span>
            </span>
          </label>

          <div className="flex gap-1.5">
            <button onClick={() => runImport(true)} disabled={!file || busy}
              className="px-3 py-1.5 text-xs font-semibold rounded-md"
              style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text-muted)", opacity: !file || busy ? 0.5 : 1 }}>
              {busy && !preview ? "Reading…" : "Preview"}
            </button>
            {preview && preview.ready > 0 && (
              <button onClick={() => runImport(false)} disabled={busy}
                className="px-3 py-1.5 text-xs font-semibold rounded-md"
                style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
                {busy ? "Importing…" : `Import ${preview.ready} enquiries`}
              </button>
            )}
          </div>

          {preview && <ImportPreview s={preview} />}

          {lastImport?.id_range && (
            <div className="flex items-center gap-2 text-xs pt-1" style={{ color: "var(--text-muted)" }}>
              <span>Imported {lastImport.inserted} enquiries.</span>
              <button onClick={undoImport} className="px-2 py-1 rounded-md"
                style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "#ef4444" }}>
                Undo this import
              </button>
              {lastImport.by_month[0] && (
                <button onClick={() => onGoToPeriod(lastImport.by_month[0].period)} className="px-2 py-1 rounded-md"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
                  View {lastImport.by_month[0].period}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {leads.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: "var(--text-quaternary)" }}>
          No enquiries this month. If their form should be logging here, check the Lead capture setup below.
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {leads.map((l) => (
            <div key={l.id} className="group px-4 py-2.5 cursor-pointer" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
              <div className="flex items-center gap-3">
                {l.status === "new" && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />}
                <span className="text-xs font-semibold truncate cf-name" style={{ color: "var(--text)", minWidth: 110 }}>{l.name || "(no name)"}</span>
                <span className="text-xs truncate flex-1 hidden sm:block" style={{ color: "var(--text-dim)" }}>{l.message}</span>
                {/* Guarded on truthiness: a sessionStorage payload cached before this
                    column existed must render nothing, not an empty chip. */}
                {l.entry_mode && l.entry_mode !== "live" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: "var(--surface2)", color: "var(--text-quaternary)" }}>
                    {l.entry_mode === "import" ? "imported" : "manual"}
                  </span>
                )}
                <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-quaternary)" }}>
                  {new Date(l.received_at.replace(" ", "T") + "Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                <button onClick={(e) => { e.stopPropagation(); del(l.id); }} title="Delete"
                  className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: "var(--text-dim)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              {expanded === l.id && (
                <div className="mt-2 pl-4 space-y-1 text-xs" style={{ color: "var(--text-secondary)", borderLeft: "2px solid var(--border-light)" }}>
                  {l.email && <div><a href={`mailto:${l.email}`} style={{ color: "var(--accent)" }} className="cf-name">{l.email}</a></div>}
                  {l.phone && <div><a href={`tel:${l.phone}`} style={{ color: "var(--accent)" }} className="cf-name">{l.phone}</a></div>}
                  {l.message && <div className="whitespace-pre-wrap">{l.message}</div>}
                  <div style={{ color: "var(--text-quaternary)" }}>
                    {[l.form_name, l.page_url, l.source].filter(Boolean).join(" · ")}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Lead capture setup -----------------------------------------------------

function SetupPanel({ projectId, trackingId, toast }: { projectId: number; trackingId: string; toast: (m: string, t?: "success" | "error" | "info") => void }) {
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch(`/api/projects/${projectId}/lead-key`).then((r) => r.json()).then((d) => setKey(d.lead_ingest_key || "")).catch(() => {});
  }, [projectId]);

  const copy = async (text: string, which: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopied(which);
    setTimeout(() => setCopied(""), 2000);
  };

  const rotate = async () => {
    if (!confirm("Rotate this client's key?\n\nTheir current Apps Script will stop sending leads immediately — you'll need to paste the new key into it.")) return;
    const d = await fetch(`/api/projects/${projectId}/lead-key`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rotate: true }),
    }).then((r) => r.json());
    setKey(d.lead_ingest_key || "");
    toast("Key rotated — update their Apps Script", "info");
  };

  const trackSnippet = `<script defer src="https://crm.innov8workflows.co.uk/track.js" data-id="${trackingId}"></script>`;
  const appsScript = `// ─── innov8 CRM lead sync ───────────────────────────────────────────
// 1. Paste this whole block at the BOTTOM of the Apps Script.
// 2. In doPost(e), directly under the line that writes the row
//    (sheet.appendRow([...])), add this ONE line:
//
//        innov8Forward(e);
//
// Nothing else changes. It reads the same data your script just received,
// so there are no field names to map. Click events (call/WhatsApp taps)
// are skipped — only real enquiries become CRM leads.
var INNOV8_CRM_URL = 'https://crm.innov8workflows.co.uk/api/webhook/client-leads';
var INNOV8_KEY     = '${key}';   // unique to this client — do not reuse

function innov8Forward(e) {
  try {
    var d = {};
    try { d = JSON.parse(e.postData.contents); } catch (err) { d = (e && e.parameter) || {}; }

    // Skip call/WhatsApp click pings — they carry no contact details and are
    // already counted by the tracking script.
    var type = String(d.type || d.event || 'form').toLowerCase();
    if (type.indexOf('click') !== -1) return;

    var pick = function () {
      for (var i = 0; i < arguments.length; i++) {
        var v = d[arguments[i]];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    };

    // Fold any extra qualifying fields into the message so nothing is lost.
    var message = pick('msg', 'message', 'enquiry', 'details', 'comments', 'notes');
    var extras = [];
    ['service', 'area', 'postcode', 'budget', 'timeframe', 'make', 'model', 'year', 'condition']
      .forEach(function (k) { if (pick(k)) extras.push(k + ': ' + pick(k)); });
    if (extras.length) message = (message ? message + '\\n' : '') + extras.join(' · ');

    var lead = {
      name: pick('name', 'fullname', 'full_name', 'fname', 'contact'),
      email: pick('email', 'emailAddress', 'e-mail'),
      phone: pick('phone', 'tel', 'telephone', 'mobile', 'number'),
      message: message,
      source: type,
      form_name: pick('form', 'formName', 'where', 'location'),
      page_url: pick('page', 'page_url', 'url'),
      submitted_at: new Date().toISOString(),
      event_id: ''
    };

    // No way to contact them = not a lead.
    if (!lead.name && !lead.email && !lead.phone) return;

    // Idempotency: the row just written pins this submission exactly, so a
    // retry or a double-fire can never create a duplicate.
    try {
      var sh = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
      if (sh) lead.event_id = sh.getName() + '!' + sh.getLastRow();
    } catch (err2) {}

    var res = UrlFetchApp.fetch(INNOV8_CRM_URL, {
      method: 'post', contentType: 'application/json',
      headers: { 'x-innov8-key': INNOV8_KEY },
      payload: JSON.stringify(lead), muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) console.error('innov8 CRM sync: ' + res.getContentText());
  } catch (err) {
    console.error('innov8 CRM sync error: ' + err);   // never break the client's form
  }
}

// ── Run this ONCE from the editor before going live ──
// Select "innov8Test" in the function dropdown and press Run. It asks for
// permission to reach the CRM (required — the script has never made an external
// request before), then sends one obvious test lead you can delete afterwards.
// Expected in the log: 200 {"ok":true,"inserted":1,...}
function innov8Test() {
  var res = UrlFetchApp.fetch(INNOV8_CRM_URL, {
    method: 'post', contentType: 'application/json',
    headers: { 'x-innov8-key': INNOV8_KEY },
    payload: JSON.stringify({
      name: 'TEST - connection check',
      phone: '00000 000000',
      message: 'If this shows in the CRM the lead sync works. Safe to delete.',
      source: 'form', form_name: 'Setup test',
      event_id: 'innov8-setup-test'
    }),
    muteHttpExceptions: true
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}`;

  const block = (label: string, code: string, which: string, note: string) => (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
        <button onClick={() => copy(code, which)} className="text-xs font-semibold px-2.5 py-1 rounded-md"
          style={{ background: copied === which ? "#22c55e" : "var(--accent)", color: "#fff" }}>
          <span className="inline-flex items-center gap-1.5">
            <Icon name={copied === which ? "check" : "clipboard-copy"} className="w-3.5 h-3.5" />{copied === which ? "Copied" : "Copy"}
          </span>
        </button>
      </div>
      <pre className="text-[10px] p-2 rounded font-mono overflow-x-auto max-h-40" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>{code}</pre>
      <p className="text-[11px] mt-1" style={{ color: "var(--text-dim)" }}>{note}</p>
    </div>
  );

  return (
    <div className="px-4 pb-4 space-y-4">
      {block("1. Site tracking (page views, calls, WhatsApp)", trackSnippet, "track",
        "Paste into the site's HTML just before </body>, then push.")}
      {key
        ? block("2. Lead sync (name, phone, what they asked for)", appsScript, "apps",
            "Paste at the bottom of this client's Apps Script, then add innov8Forward(e); under the appendRow line in doPost. This key is unique to them — don't reuse it elsewhere.")
        : <p className="text-xs" style={{ color: "var(--text-dim)" }}>Loading key…</p>}
      <button onClick={rotate} className="text-[11px] px-2.5 py-1 rounded-md"
        style={{ background: "transparent", border: "1px solid var(--border-light)", color: "var(--text-dim)" }}>
        Rotate key
      </button>
    </div>
  );
}
