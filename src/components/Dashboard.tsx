"use client";

import { useState, useEffect, useCallback } from "react";
import LoadingAI from "./LoadingAI";
import Icon from "./Icon";
import DateRangePicker from "./DateRangePicker";
import WonDatesModal from "./WonDatesModal";
import { dayLabel, periodLabel, presetRange, type DayRange, type RangePreset } from "@/lib/dateRange";

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

interface RevenuePeriod {
  range: DayRange;
  snapshot: { mrr: number; clients: number; at: string };
  opening: { mrr: number; clients: number; at: string };
  movement: {
    newMrr: number; expansionMrr: number; churnedMrr: number;
    newClients: number; churnedClients: number; capex: number; reconciles: boolean;
  };
  series: { period: string; mrr: number; newMrr: number; expansionMrr: number; churnedMrr: number; clients: number; estimated: boolean }[];
  coverage: { historyFrom: string; churnTracked: boolean; contractionTracked: boolean };
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
  const [loading, setLoading] = useState(true);
  const [showWonDates, setShowWonDates] = useState(false);

  // Fall back to a local default so the component still renders standalone if a
  // caller doesn't pass a range.
  const range = revenueRange || presetRange("last_12m");

  const fetchAll = useCallback(async () => {
    const ownerParam = ownerFilter ? `?owner=${encodeURIComponent(ownerFilter)}` : "";
    const revQs = new URLSearchParams({ start: range.start, end: range.end });
    if (ownerFilter) revQs.set("owner", ownerFilter);
    const [pRes, cRes, projRes, solRes, revRes] = await Promise.all([
      fetch(`/api/leads/stats${ownerParam}`),
      fetch(`/api/clients/stats${ownerParam}`),
      fetch(`/api/projects?completed=false${ownerParam ? `&owner=${encodeURIComponent(ownerFilter)}` : ""}`),
      fetch(`/api/solutions/stats`),
      fetch(`/api/revenue/period?${revQs.toString()}`),
    ]);
    const [pData, cData, projData, solData] = await Promise.all([pRes.json(), cRes.json(), projRes.json(), solRes.json()]);
    setProspects(pData);
    setClients(cData);
    setActiveProjects(projData.projects?.length || 0);
    setSolutions(solData);
    // A bad range 400s; keep the rest of the dashboard usable rather than blanking it.
    setRevenue(revRes.ok ? await revRes.json() : null);
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
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Section 1: Revenue — everything in here is scoped to the date range. */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Revenue</h2>
          <div className="flex flex-wrap items-center gap-2">
            {onRevenueRangeChange && (
              <DateRangePicker value={range} preset={revenuePreset} onChange={onRevenueRangeChange} />
            )}
            <button onClick={() => setShowWonDates(true)}
              title="Every historical figure is dated from each client's won date"
              className="text-xs px-2.5 py-1.5 rounded-lg"
              style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
              Fix won dates
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <RevenueCard label="Client MRR" value={`£${(revenue?.snapshot.mrr ?? clients?.mrr ?? 0).toFixed(2)}`} color="#22c55e"
            sub={revenue ? `as at ${dayLabel(revenue.snapshot.at)}` : undefined}
            delta={revenue ? revenue.snapshot.mrr - revenue.opening.mrr : null}
            icon="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <RevenueCard label="Client ARR" value={`£${((revenue?.snapshot.mrr ?? clients?.mrr ?? 0) * 12).toFixed(2)}`} color="#facc15"
            sub={revenue ? `as at ${dayLabel(revenue.snapshot.at)}` : undefined}
            icon="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
          <RevenueCard label="Live Clients" value={String(revenue?.snapshot.clients ?? clients?.clientCount ?? 0)} color="#f59e0b"
            sub={revenue ? `as at ${dayLabel(revenue.snapshot.at)}` : undefined}
            delta={revenue ? revenue.snapshot.clients - revenue.opening.clients : null}
            icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          <RevenueCard label="New MRR" value={`£${(revenue?.movement.newMrr || 0).toFixed(2)}`} color="#22c55e"
            sub={revenue ? `${revenue.movement.newClients} new client${revenue.movement.newClients === 1 ? "" : "s"}` : "in period"}
            icon="M12 4.5v15m7.5-7.5h-15" />
          <RevenueCard label="Expansion MRR" value={`£${(revenue?.movement.expansionMrr || 0).toFixed(2)}`} color="#8b5cf6"
            sub="upsells to existing clients"
            icon="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
          {/* Churn was never recorded before the cutover, so a 0 here would be a claim
              about the past rather than a fact. Show a dash and say why. */}
          <RevenueCard label="Churned MRR"
            value={revenue && revenue.coverage.historyFrom && range.start < revenue.coverage.historyFrom ? "—" : `£${(revenue?.movement.churnedMrr || 0).toFixed(2)}`}
            color="#ef4444"
            sub={revenue && revenue.coverage.historyFrom && range.start < revenue.coverage.historyFrom
              ? `only tracked from ${dayLabel(revenue.coverage.historyFrom)}`
              : revenue ? `${revenue.movement.churnedClients} client${revenue.movement.churnedClients === 1 ? "" : "s"} lost` : "in period"}
            icon="M19.5 12h-15" />
          <RevenueCard label="CAPEX won" value={`£${(revenue?.movement.capex ?? clients?.capex ?? 0).toFixed(2)}`} color="#3b82f6"
            sub="one-off fees, in period"
            icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </div>

        {revenue && revenue.series.length > 1 && (
          <MrrChart series={revenue.series} historyFrom={revenue.coverage.historyFrom} />
        )}
      </div>

      {/* Section 1b: Pipeline — deliberately SEPARATE from the block above. These are
          forward-looking figures about deals not yet won; they have no historical
          meaning and the date range does NOT govern them. Merging the two is the most
          likely way to make a number look wrong. */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>
          Pipeline <span className="normal-case tracking-normal" style={{ color: "var(--text-quaternary)" }}>&middot; current, not date-filtered</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <RevenueCard label="Prospect ARR" value={`£${((prospects?.totalMonthly || 0) * 12).toFixed(2)}`} color="#22c55e"
            icon="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
          <RevenueCard label="Prospect CAPEX" value={`£${(prospects?.totalCapex || 0).toFixed(2)}`} color="#8b5cf6"
            icon="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          <RevenueCard label="Prospect Monthly" value={`£${(prospects?.totalMonthly || 0).toFixed(2)}/mo`} color="#10b981"
            icon="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          <RevenueCard label="Active Projects" value={String(activeProjects)} color="#ea580c"
            icon="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-1.007.662-1.858 1.574-2.144z" />
          <RevenueCard label="Upsell MRR" value={`£${(solutions?.mrr || 0).toFixed(2)}`} color="#8b5cf6"
            icon="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
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
            <MetricRow label="Avg Revenue / Client" value={`\u00A3${avgRevenue}`} color="#3b82f6" />
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

// `delta` and `sub` added for the period-scoped tiles. Extending this rather than
// switching to StatTile: StatTile has no icon circle, so swapping would restyle the
// whole section — but the up/down colours and glyphs below are copied from
// StatTile.tsx verbatim so the two stay consistent.
function RevenueCard({ label, value, color, icon, delta, sub }: {
  label: string; value: string; color: string; icon: string;
  delta?: number | null; sub?: string;
}) {
  const showDelta = delta !== null && delta !== undefined && Math.abs(delta) > 0.005;
  return (
    <div className="rounded-xl p-5 flex items-center gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
        <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <div className="text-2xl font-bold" style={{ color }}>{value}</div>
          {/* +/- rather than the ↑/↓ StatTile uses: the arrow glyphs don't render in
              this font stack, so "↑2770" came out looking like the number 12770 wedged
              onto the end of the value. A sign can't be misread as a digit. */}
          {showDelta && (
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: delta! > 0 ? "#22c55e" : "#ef4444" }}>
              {delta! > 0 ? "+" : "−"}
              {value.trim().startsWith("£") ? "£" : ""}
              {Math.abs(delta!) % 1 === 0 ? Math.abs(delta!).toLocaleString() : Math.abs(delta!).toFixed(2)}
            </span>
          )}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>{label}</div>
        {sub && <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-quaternary)" }}>{sub}</div>}
      </div>
    </div>
  );
}

/**
 * MRR over time. Hand-rolled CSS flex bars, the same shape as the leads-by-day chart
 * in ClientDashboard — package.json carries no chart library and 12 bars don't
 * justify adding one.
 *
 * Bars before the cutover are dimmed: those months are RECONSTRUCTED from won dates
 * rather than recorded as they happened, and drawing a guess at the same weight as a
 * fact is how a chart quietly starts lying.
 */
function MrrChart({ series, historyFrom }: {
  series: { period: string; mrr: number; estimated: boolean }[];
  historyFrom: string;
}) {
  const max = Math.max(...series.map((p) => p.mrr), 1);
  const anyEstimated = series.some((p) => p.estimated);
  return (
    <div className="rounded-xl p-4 mt-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>MRR over time</p>
        {anyEstimated && (
          <span className="text-[11px]" style={{ color: "var(--text-quaternary)" }}>
            faded = reconstructed from won dates{historyFrom ? ` (before ${historyFrom})` : ""}
          </span>
        )}
      </div>
      <div className="flex items-end gap-1 h-24">
        {series.map((p) => (
          <div key={p.period} className="flex-1 rounded-t transition-all"
            title={`${periodLabel(p.period)}: £${p.mrr.toFixed(0)} MRR${p.estimated ? " (estimated)" : ""}`}
            style={{
              height: `${(p.mrr / max) * 100}%`,
              minHeight: p.mrr > 0 ? 4 : 1,
              background: p.mrr > 0 ? "var(--accent)" : "var(--border)",
              opacity: p.estimated ? 0.45 : 1,
            }} />
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px]" style={{ color: "var(--text-quaternary)" }}>
        <span>{periodLabel(series[0].period)}</span>
        <span>{periodLabel(series[series.length - 1].period)}</span>
      </div>
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
