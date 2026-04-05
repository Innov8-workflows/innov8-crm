"use client";

import { useEffect, useState } from "react";

interface Stats {
  total: number; contacted: number; demoSent: number; responded: number;
  meetingsBooked: number; won: number; lost: number; overdue: number;
  dueToday: number; emailedThisWeek: number;
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetch("/api/leads/stats").then((r) => r.json()).then(setStats);
  }, []);

  if (!stats) return null;

  const cards = [
    { label: "Total Leads", value: stats.total, color: "#f0f0f0" },
    { label: "Contacted", value: stats.contacted, color: "#3b82f6" },
    { label: "Demos Sent", value: stats.demoSent, color: "#a855f7" },
    { label: "Responded", value: stats.responded, color: "#eab308" },
    { label: "Meetings", value: stats.meetingsBooked, color: "#22c55e" },
    { label: "Won", value: stats.won, color: "#059669" },
    { label: "Emailed (7d)", value: stats.emailedThisWeek, color: "#f97316" },
  ];

  const alerts = [];
  if (stats.overdue > 0) alerts.push({ text: `${stats.overdue} overdue`, bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", color: "#ef4444" });
  if (stats.dueToday > 0) alerts.push({ text: `${stats.dueToday} due today`, bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.2)", color: "#eab308" });

  return (
    <div style={{ borderBottom: "1px solid #2a2a2a", background: "#131313" }}>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-1.5 text-xs transition-colors"
        style={{ color: "#666" }}
        onMouseEnter={(e) => e.currentTarget.style.background = "#1a1a1a"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
        <span className="flex items-center gap-2">
          Dashboard
          {alerts.map((a, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: a.bg, border: `1px solid ${a.border}`, color: a.color }}>
              {a.text}
            </span>
          ))}
        </span>
        <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="grid grid-cols-7 gap-2 px-4 pb-3">
          {cards.map((card) => (
            <div key={card.label} className="text-center p-2.5 rounded-lg" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
              <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
              <div className="text-xs mt-0.5" style={{ color: "#666" }}>{card.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
