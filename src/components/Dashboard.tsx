"use client";

import { useState, useEffect, useCallback } from "react";
import LoadingAI from "./LoadingAI";
import Icon from "./Icon";
import RevenueOverview, { gbp, type RevenuePeriod, type SeriesPoint } from "./RevenueOverview";
import WonDatesModal from "./WonDatesModal";
import { dayBefore, monthEnd, presetRange, type DayRange, type RangePreset } from "@/lib/dateRange";

interface TypeBreakdown {
  type: string; total: number; won: number; rejected: number; lost: number;
}

interface ProspectStats {
  total: number; emailed: number; messaged: number; called: number;
  meetingsBooked: number; maybe: number; won: number; lost: number;
  rejected: number; overdue: number; dueToday: number;
  totalCapex: number; totalMonthly: number;
  byType: TypeBreakdown[];
}

interface ClientStats {
  mrr: number; capex: number; clientCount: number; overdueRenewals: number; lostClients: number;
}

interface SolutionsStats {
  total: number; proposed: number; sold: number; delivered: number; declined: number;
  mrr: number; one_off_revenue: number;
  per_solution: Array<{
    id: number; name: string; sold: number; delivered: number; proposed: number; total: number; conversion_pct: number;
    buyers?: Array<{ id: number; entity_type: string; entity_id: number; business_name: string; status: string }>;
  }>;
}

export default function Dashboard({
  ownerFilter = "", active = true,
  revenueRange, revenuePreset = "last_12m", onRevenueRangeChange,
}: {
  ownerFilter?: string; active?: boolean;
  revenueRange?: DayRange; revenuePreset?: RangePreset;
  onRevenueRangeChange?: (r: DayRange, p: RangePreset) => void;
}) {
  const [prospects, setProspects] = useState<ProspectStats | null>(null);
  const [clients, setClients] = useState<ClientStats | null>(null);
  const [activeProjects, setActiveProjects] = useState(0);
  const [solutions, setSolutions] = useState<SolutionsStats | null>(null);
  const [revenue, setRevenue] = useState<RevenuePeriod | null>(null);
  // ~12 months ending where the range ends, so a one-month view still shows a trend.
  const [context, setContext] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWonDates, setShowWonDates] = useState(false);

  // Fall back to a local default so the component still renders standalone if a
  // caller doesn't pass a range.
  const range = revenueRange || presetRange("last_12m");

  const fetchAll = useCallback(async () => {
    const ownerParam = ownerFilter ? `?owner=${encodeURIComponent(ownerFilter)}` : "";
    const revQs = new URLSearchParams({ start: range.start, end: range.end });
    if (ownerFilter) revQs.set("owner", ownerFilter);
    const lastMonth = dayBefore(range.end).slice(0, 7);
    const [ly, lm] = lastMonth.split("-").map(Number);
    const ctxStart = new Date(Date.UTC(ly, lm - 12, 1)).toISOString().slice(0, 10);
    const ctxQs = new URLSearchParams({ start: ctxStart < range.start ? ctxStart : range.start, end: monthEnd(lastMonth) });
    if (ownerFilter) ctxQs.set("owner", ownerFilter);
    const [pRes, cRes, projRes, solRes, revRes, ctxRes] = await Promise.all([
      fetch(`/api/leads/stats${ownerParam}`),
      fetch(`/api/clients/stats${ownerParam}`),
      fetch(`/api/projects?completed=false${ownerParam ? `&owner=${encodeURIComponent(ownerFilter)}` : ""}`),
      fetch(`/api/solutions/stats`),
      fetch(`/api/revenue/period?${revQs.toString()}`),
      fetch(`/api/revenue/period?${ctxQs.toString()}`),
    ]);
    const [pData, cData, projData, solData] = await Promise.all([pRes.json(), cRes.json(), projRes.json(), solRes.json()]);
    setProspects(pData);
    setClients(cData);
    setActiveProjects(projData.projects?.length || 0);
    setSolutions(solData);
    // A bad range 400s; keep the rest of the dashboard usable rather than blanking it.
    setRevenue(revRes.ok ? await revRes.json() : null);
    setContext(ctxRes.ok ? ((await ctxRes.json()).series || []) : []);
    setLoading(false);
  }, [ownerFilter, range.start, range.end]);

  // Re-fetch whenever the Dashboard becomes the active view (it stays mounted via
  // the mount-once pattern, so without this it would show stale numbers after
  // products are changed elsewhere). Stats endpoints are no-store, so this is fresh.
  useEffect(() => { if (active) fetchAll(); }, [active, fetchAll]);

  if (loading) return <LoadingAI message="Loading dashboard" />;

  const conversionRate = prospects && prospects.total > 0 ? ((prospects.won / prospects.total) * 100).toFixed(1) : "0";
  const avgRevenue = clients && clients.clientCount > 0 ? (clients.mrr / clients.clientCount).toFixed(0) : "0";

  // Pipeline funnel data
  const funnelData = [
    { label: "Emailed", value: prospects?.emailed || 0, color: "#3b82f6" },
    { label: "Messaged", value: prospects?.messaged || 0, color: "#8b5cf6" },
    { label: "Called", value: prospects?.called || 0, color: "#f59e0b" },
    { label: "Meetings", value: prospects?.meetingsBooked || 0, color: "#10b981" },
    { label: "Maybe", value: prospects?.maybe || 0, color: "#ea580c" },
    { label: "Won", value: prospects?.won || 0, color: "#059669" },
  ];
  const funnelMax = Math.max(...funnelData.map((d) => d.value), 1);

  // Stage distribution for donut chart
  const stageData = [
    { label: "New", value: (prospects?.total || 0) - (prospects?.emailed || 0) - (prospects?.messaged || 0) - (prospects?.called || 0) - (prospects?.meetingsBooked || 0) - (prospects?.maybe || 0) - (prospects?.won || 0) - (prospects?.lost || 0) - (prospects?.rejected || 0), color: "#6B7280" },
    { label: "Emailed", value: prospects?.emailed || 0, color: "#3b82f6" },
    { label: "Messaged", value: prospects?.messaged || 0, color: "#8b5cf6" },
    { label: "Called", value: prospects?.called || 0, color: "#f59e0b" },
    { label: "Meetings", value: prospects?.meetingsBooked || 0, color: "#10b981" },
    { label: "Maybe", value: prospects?.maybe || 0, color: "#ea580c" },
    { label: "Won", value: prospects?.won || 0, color: "#059669" },
    { label: "Lost", value: prospects?.lost || 0, color: "#ef4444" },
    { label: "Rejected", value: prospects?.rejected || 0, color: "#9CA3AF" },
  ].filter((d) => d.value > 0);

  // Outcome donut data
  const outcomeData = [
    { label: "Active", value: (prospects?.total || 0) - (prospects?.won || 0) - (prospects?.lost || 0) - (prospects?.rejected || 0), color: "#ea580c" },
    { label: "Won", value: prospects?.won || 0, color: "#059669" },
    { label: "Lost", value: prospects?.lost || 0, color: "#ef4444" },
    { label: "Rejected", value: prospects?.rejected || 0, color: "#9CA3AF" },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex-1 overflow-auto px-5 pb-5 space-y-5">
      {revenue ? (
        <RevenueOverview revenue={revenue} context={context.length ? context : revenue.series}
          range={range} preset={revenuePreset} onRangeChange={onRevenueRangeChange}
          onFixWonDates={() => setShowWonDates(true)} />
      ) : (
        <div className="pt-4 text-sm" style={{ color: "var(--text-dim)" }}>
          Revenue couldn&apos;t load for that range. Client MRR now: {gbp(clients?.mrr || 0)} · CAPEX {gbp(clients?.capex || 0)}
        </div>
      )}

      {/* Pipeline — deliberately SEPARATE from revenue: forward-looking figures about
          deals not yet won, which the date range does NOT govern. */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
          Pipeline <span className="normal-case tracking-normal" style={{ color: "var(--text-quaternary)" }}>&middot; deals not yet won, not date-filtered</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MiniStat label="Prospect MRR" value={`${gbp(prospects?.totalMonthly || 0)}/mo`} color="#10b981" />
          <MiniStat label="Prospect ARR" value={gbp((prospects?.totalMonthly || 0) * 12)} color="#22c55e" />
          <MiniStat label="Prospect CAPEX" value={gbp(prospects?.totalCapex || 0)} color="#8b5cf6" />
          <MiniStat label="Upsell MRR" value={gbp(solutions?.mrr || 0)} color="#a855f7" />
          <MiniStat label="Active projects" value={String(activeProjects)} color="#ea580c" />
        </div>
      </div>

      {showWonDates && (
        <WonDatesModal onClose={() => setShowWonDates(false)} onSaved={fetchAll} />
      )}

      {/* Section: Top AI Solutions (only shows if any sold) */}
      {solutions && (solutions.sold + solutions.delivered) > 0 && (
        <TopAISolutionsPanel solutions={solutions} onRefresh={fetchAll} />
      )}

      {/* Section 2: Sales Pipeline Cards */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>Sales Pipeline</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
          <PipelineCard label="Total Leads" value={prospects?.total || 0} color="#f0f0f0" />
          <PipelineCard label="Emailed" value={prospects?.emailed || 0} color="#3b82f6" />
          <PipelineCard label="Messaged" value={prospects?.messaged || 0} color="#8b5cf6" />
          <PipelineCard label="Called" value={prospects?.called || 0} color="#f59e0b" />
          <PipelineCard label="Meetings" value={prospects?.meetingsBooked || 0} color="#10b981" />
          <PipelineCard label="Maybe" value={prospects?.maybe || 0} color="#ea580c" />
          <PipelineCard label="Won" value={prospects?.won || 0} color="#059669" />
          <PipelineCard label="Lost" value={prospects?.lost || 0} color="#ef4444" />
          <PipelineCard label="Rejected" value={prospects?.rejected || 0} color="#9CA3AF" />
        </div>
      </div>

      {/* Section 3: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline Funnel Bar Chart */}
        <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Pipeline Funnel</h3>
          <div className="space-y-3">
            {funnelData.map((d) => (
              <div key={d.label} className="flex items-center gap-3">
                <span className="text-xs w-16 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>{d.label}</span>
                <div className="flex-1 h-7 rounded-md overflow-hidden" style={{ background: "var(--surface2)" }}>
                  <div className="h-full rounded-md flex items-center pl-2 transition-all duration-500"
                    style={{ width: `${Math.max((d.value / funnelMax) * 100, d.value > 0 ? 8 : 0)}%`, background: `${d.color}30`, borderLeft: `3px solid ${d.color}` }}>
                    <span className="text-xs font-bold" style={{ color: d.color }}>{d.value}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stage Distribution Donut */}
        <div className="rounded-xl p-5 flex flex-col items-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4 self-start" style={{ color: "var(--text-dim)" }}>Stage Distribution</h3>
          <DonutChart data={stageData} total={prospects?.total || 0} centerLabel="Leads" />
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4">
            {stageData.map((d) => (
              <div key={d.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{d.label} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Outcome Donut */}
        <div className="rounded-xl p-5 flex flex-col items-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4 self-start" style={{ color: "var(--text-dim)" }}>Outcomes</h3>
          <DonutChart data={outcomeData} total={prospects?.total || 0} centerLabel="Total" />
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4">
            {outcomeData.map((d) => (
              <div key={d.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{d.label} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 4: Key Metrics & Alerts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Key Metrics</h3>
          <div className="space-y-4">
            <MetricRow label="Conversion Rate" value={`${conversionRate}%`} color="#22c55e" />
            <MetricRow label="Avg Revenue / Client" value={gbp(Number(avgRevenue))} color="#3b82f6" />
            <MetricRow label="Pipeline (Active Projects)" value={String(activeProjects)} color="#ea580c" />
            <MetricRow label="Won / Lost Ratio" value={
              prospects && prospects.lost > 0 ? `${(prospects.won / prospects.lost).toFixed(1)}:1` : prospects?.won ? `${prospects.won}:0` : "0:0"
            } color="#f59e0b" />
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Alerts</h3>
          <div className="space-y-3">
            <AlertRow label="Overdue Follow-ups" value={prospects?.overdue || 0} danger={true} />
            <AlertRow label="Due Today" value={prospects?.dueToday || 0} danger={false} />
            <AlertRow label="Overdue Renewals" value={clients?.overdueRenewals || 0} danger={true} />
            <AlertRow label="Lost Clients" value={clients?.lostClients || 0} danger={true} />
          </div>
        </div>
      </div>

      {/* Section 5: Win & Rejection Rate by Business Type */}
      {prospects?.byType && prospects.byType.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Win Rate */}
          <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Win Rate by Business Type</h3>
            <div className="space-y-3">
              {prospects.byType
                .map((t) => ({ ...t, winPct: t.total > 0 ? (t.won / t.total) * 100 : 0 }))
                .sort((a, b) => b.winPct - a.winPct)
                .map((t) => (
                <div key={`win-${t.type}`} className="flex items-center gap-3">
                  <span className="text-xs w-24 text-right flex-shrink-0 truncate" style={{ color: "var(--text-muted)" }} title={t.type}>{t.type}</span>
                  <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: "var(--surface2)" }}>
                    <div className="h-full rounded-md flex items-center px-2 transition-all duration-500"
                      style={{ width: `${Math.max(t.winPct, t.won > 0 ? 8 : 0)}%`, background: "#05966930", borderLeft: t.won > 0 ? "3px solid #059669" : "none" }}>
                      {t.won > 0 && <span className="text-xs font-bold" style={{ color: "#059669" }}>{t.won}</span>}
                    </div>
                  </div>
                  <span className="text-xs font-bold w-12 text-right" style={{ color: t.winPct > 0 ? "#059669" : "var(--text-quaternary)" }}>{t.winPct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rejection Rate */}
          <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Rejection Rate by Business Type</h3>
            <div className="space-y-3">
              {prospects.byType
                .map((t) => ({ ...t, rejPct: t.total > 0 ? ((t.rejected + t.lost) / t.total) * 100 : 0 }))
                .sort((a, b) => b.rejPct - a.rejPct)
                .map((t) => (
                <div key={`rej-${t.type}`} className="flex items-center gap-3">
                  <span className="text-xs w-24 text-right flex-shrink-0 truncate" style={{ color: "var(--text-muted)" }} title={t.type}>{t.type}</span>
                  <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: "var(--surface2)" }}>
                    <div className="h-full rounded-md flex items-center px-2 transition-all duration-500"
                      style={{ width: `${Math.max(t.rejPct, (t.rejected + t.lost) > 0 ? 8 : 0)}%`, background: "#ef444430", borderLeft: (t.rejected + t.lost) > 0 ? "3px solid #ef4444" : "none" }}>
                      {(t.rejected + t.lost) > 0 && <span className="text-xs font-bold" style={{ color: "#ef4444" }}>{t.rejected + t.lost}</span>}
                    </div>
                  </div>
                  <span className="text-xs font-bold w-12 text-right" style={{ color: t.rejPct > 0 ? "#ef4444" : "var(--text-quaternary)" }}>{t.rejPct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
  );
}

/* ── Chart Components ── */

function DonutChart({ data, total, centerLabel }: { data: { label: string; value: number; color: string }[]; total: number; centerLabel: string }) {
  const size = 180;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;
  const segments = data.map((d) => {
    const pct = total > 0 ? d.value / total : 0;
    const offset = accumulated;
    accumulated += pct;
    return { ...d, pct, offset };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring */}
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e1e1e" strokeWidth={strokeWidth} />
      {/* Data segments */}
      {segments.map((seg) => (
        <circle key={seg.label} cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={seg.color} strokeWidth={strokeWidth}
          strokeDasharray={`${seg.pct * circumference} ${circumference}`}
          strokeDashoffset={-seg.offset * circumference}
          strokeLinecap="butt"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
      ))}
      {/* Center text */}
      <text x={size / 2} y={size / 2 - 8} textAnchor="middle" fill="#f0f0f0" fontSize="28" fontWeight="700">{total}</text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill="#666" fontSize="11" fontWeight="500">{centerLabel}</text>
    </svg>
  );
}

/* ── Card Components ── */

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function PipelineCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="text-2xl font-bold" style={{ color: value > 0 ? color : "var(--text-quaternary)" }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="text-lg font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function AlertRow({ label, value, danger }: { label: string; value: number; danger: boolean }) {
  const isActive = value > 0;
  const color = isActive && danger ? "#ef4444" : isActive ? "#f59e0b" : "var(--border-light)";
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{
      background: isActive && danger ? "#ef444410" : isActive ? "#f59e0b10" : "transparent",
      border: isActive ? `1px solid ${color}30` : "1px solid transparent",
    }}>
      <span className="text-sm" style={{ color: isActive ? "var(--text-secondary)" : "var(--text-tertiary)" }}>{label}</span>
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

// Top AI Solutions panel — bars now expandable to show *which* business has each sale.
// Click the chevron to drill in and remove accidental status toggles right from here.
function TopAISolutionsPanel({ solutions, onRefresh }: { solutions: SolutionsStats; onRefresh: () => void }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  const top = [...solutions.per_solution].sort((a, b) => (b.sold + b.delivered) - (a.sold + a.delivered)).slice(0, 5);
  const max = Math.max(1, ...top.map((s) => s.sold + s.delivered));

  const removeEntry = async (entryId: number, businessName: string, solutionName: string) => {
    if (!confirm(`Reset "${solutionName}" status for ${businessName}? This removes the sold/delivered mark — useful if it was clicked by accident.`)) return;
    setRemoving(entryId);
    try {
      await fetch(`/api/entity-solutions?id=${entryId}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>Top AI Solutions</h2>
      <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="space-y-2">
          {top.map((s) => {
            const won = s.sold + s.delivered;
            const expanded = expandedId === s.id;
            const buyers = s.buyers || [];
            const clickable = won > 0;
            return (
              <div key={s.id} className="rounded-lg transition-colors" style={{
                background: expanded ? "var(--surface2)" : "transparent",
                border: expanded ? "1px solid var(--accent)" : "1px solid transparent",
              }}>
                <button
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                  disabled={!clickable}
                  className="w-full flex items-center gap-3 p-2 transition-colors text-left rounded-lg"
                  style={{ cursor: clickable ? "pointer" : "default", opacity: clickable ? 1 : 0.55 }}
                  onMouseEnter={(e) => { if (clickable && !expanded) e.currentTarget.style.background = "var(--surface2)"; }}
                  onMouseLeave={(e) => { if (clickable && !expanded) e.currentTarget.style.background = "transparent"; }}>
                  <div className="w-48 text-sm truncate flex items-center gap-2" style={{ color: "var(--text)" }}>
                    {clickable ? (
                      <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-transform"
                        style={{ background: expanded ? "var(--accent)" : "var(--accent-subtle)", color: expanded ? "#fff" : "var(--accent)", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    ) : (
                      <span className="w-5 h-5 flex-shrink-0" />
                    )}
                    <span className="truncate">{s.name}</span>
                  </div>
                  <div className="flex-1 h-6 rounded-lg overflow-hidden flex items-center" style={{ background: "var(--surface3)" }}>
                    <div className="h-full transition-all" style={{ width: `${(won / max) * 100}%`, background: "linear-gradient(90deg, #8b5cf6, #a855f7)" }} />
                  </div>
                  <div className="w-28 text-right text-sm flex items-center justify-end gap-1.5" style={{ color: won > 0 ? "#a855f7" : "var(--text-dim)", fontWeight: 700 }}>
                    {won} sold
                    {clickable && <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--accent)" }}>view →</span>}
                  </div>
                </button>

                {expanded && (
                  <div className="px-3 pb-3 pt-1 space-y-1">
                    {buyers.length === 0 ? (
                      <p className="text-xs text-center py-2" style={{ color: "var(--text-dim)" }}>
                        Loading buyers… hard-refresh (Ctrl+Shift+R) if this stays empty.
                      </p>
                    ) : buyers.map((b) => (
                      <div key={b.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm" style={{ background: "var(--surface)" }}>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{
                            background: b.entity_type === "project" ? "#22c55e25" : "var(--surface2)",
                            color: b.entity_type === "project" ? "#22c55e" : "var(--text-dim)",
                          }}>{b.entity_type === "project" ? "Client" : "Lead"}</span>
                        <span className="flex-1 truncate cf-name" style={{ color: "var(--text)" }}>{b.business_name}</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ background: b.status === "delivered" ? "#05966925" : "#22c55e25", color: b.status === "delivered" ? "#059669" : "#22c55e" }}>
                          {b.status}
                        </span>
                        <button
                          onClick={() => removeEntry(b.id, b.business_name, s.name)}
                          disabled={removing === b.id}
                          className="text-xs font-semibold px-2 py-0.5 rounded transition-colors flex-shrink-0"
                          style={{ color: "#ef4444", border: "1px solid #ef444430", opacity: removing === b.id ? 0.5 : 1 }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#ef444420"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          title="Reset status — removes the sold/delivered mark">
                          {removing === b.id ? "..." : <span className="inline-flex items-center gap-1"><Icon name="trash" className="w-3 h-3" /> Reset</span>}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-quaternary)" }}>Click a row to see which business has it sold. Reset removes an accidental status toggle.</p>
      </div>
    </div>
  );
}
