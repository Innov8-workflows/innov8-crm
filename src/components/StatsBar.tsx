"use client";

import { useEffect, useState } from "react";

interface Stats {
  total: number;
  contacted: number;
  demoSent: number;
  responded: number;
  meetingsBooked: number;
  won: number;
  lost: number;
  overdue: number;
  dueToday: number;
  emailedThisWeek: number;
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/leads/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats) return null;

  const cards = [
    { label: "Total Leads", value: stats.total, color: "text-gray-700" },
    { label: "Contacted", value: stats.contacted, color: "text-blue-600" },
    { label: "Demos Sent", value: stats.demoSent, color: "text-purple-600" },
    { label: "Responded", value: stats.responded, color: "text-amber-600" },
    { label: "Meetings", value: stats.meetingsBooked, color: "text-green-600" },
    { label: "Won", value: stats.won, color: "text-emerald-600" },
    { label: "Emailed (7d)", value: stats.emailedThisWeek, color: "text-indigo-600" },
  ];

  const alerts = [];
  if (stats.overdue > 0) alerts.push({ text: `${stats.overdue} overdue follow-up${stats.overdue > 1 ? "s" : ""}`, color: "text-red-600 bg-red-50" });
  if (stats.dueToday > 0) alerts.push({ text: `${stats.dueToday} follow-up${stats.dueToday > 1 ? "s" : ""} due today`, color: "text-amber-600 bg-amber-50" });

  return (
    <div className="border-b border-gray-200 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-gray-50 text-xs text-gray-500"
      >
        <span className="flex items-center gap-2">
          Dashboard
          {alerts.map((a, i) => (
            <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.color}`}>
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
            <div key={card.label} className="text-center p-2 bg-gray-50 rounded-lg">
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
