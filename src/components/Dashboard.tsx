"use client";

import { useState, useEffect, useCallback } from "react";
import LoadingAI from "./LoadingAI";

interface ProspectStats {
  total: number; emailed: number; messaged: number; called: number;
  meetingsBooked: number; maybe: number; won: number; lost: number;
  rejected: number; overdue: number; dueToday: number;
  totalCapex: number; totalMonthly: number;
}

interface ClientStats {
  mrr: number; capex: number; clientCount: number; overdueRenewals: number; lostClients: number;
}

export default function Dashboard({ ownerFilter = "" }: { ownerFilter?: string }) {
  const [prospects, setProspects] = useState<ProspectStats | null>(null);
  const [clients, setClients] = useState<ClientStats | null>(null);
  const [activeProjects, setActiveProjects] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const ownerParam = ownerFilter ? `?owner=${encodeURIComponent(ownerFilter)}` : "";
    const [pRes, cRes, projRes] = await Promise.all([
      fetch(`/api/leads/stats${ownerParam}`),
      fetch(`/api/clients/stats${ownerParam}`),
      fetch(`/api/projects?completed=false${ownerParam ? `&owner=${encodeURIComponent(ownerFilter)}` : ""}`),
    ]);
    const [pData, cData, projData] = await Promise.all([pRes.json(), cRes.json(), projRes.json()]);
    setProspects(pData);
    setClients(cData);
    setActiveProjects(projData.projects?.length || 0);
    setLoading(false);
  }, [ownerFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
      {/* Section 1: Revenue Overview */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>Revenue Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <RevenueCard label="Client MRR" value={`\u00A3${(clients?.mrr || 0).toFixed(2)}`} color="#22c55e"
            icon="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <RevenueCard label="Client CAPEX" value={`\u00A3${(clients?.capex || 0).toFixed(2)}`} color="#3b82f6"
            icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          <RevenueCard label="Prospect CAPEX" value={`\u00A3${(prospects?.totalCapex || 0).toFixed(2)}`} color="#8b5cf6"
            icon="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          <RevenueCard label="Prospect Monthly" value={`\u00A3${(prospects?.totalMonthly || 0).toFixed(2)}/mo`} color="#10b981"
            icon="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          <RevenueCard label="Live Clients" value={String(clients?.clientCount || 0)} color="#f59e0b"
            icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          <RevenueCard label="Active Projects" value={String(activeProjects)} color="#ea580c"
            icon="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-1.007.662-1.858 1.574-2.144z" />
        </div>
      </div>

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

function RevenueCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div className="rounded-xl p-5 flex items-center gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
        <svg className="w-6 h-6" fill="none" stroke={color} strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ color }}>{value}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>{label}</div>
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
