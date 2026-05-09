"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/types";

interface Analytics {
  tracking_id: string;
  period_days: number;
  total: number;
  unique_visitors: number;
  page_views: number;
  calls: number;
  whatsapps: number;
  messengers: number;
  emails: number;
  maps: number;
  socials: number;
  bookings: number;
  forms: number;
  daily: Array<{ day: string; total: number; page_views: number }>;
}

const TRACKER_BASE = "https://crm.innov8workflows.co.uk";

export default function SiteAnalyticsModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/projects/${project.id}/analytics?days=${days}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then(setData)
      .catch(() => setError("Failed to load analytics"));
  }, [project.id, days]);

  const snippet = data
    ? `<script defer src="${TRACKER_BASE}/track.js" data-id="${data.tracking_id}"></script>`
    : "";

  const copySnippet = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = snippet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const noData = data && data.total === 0;
  const maxDaily = data ? Math.max(1, ...data.daily.map((d) => d.page_views)) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl overflow-hidden flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)", maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Site Analytics</p>
            <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>{project.business_name}</h2>
          </div>
          <button onClick={onClose} className="text-sm px-2" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          {[7, 30, 90, 365].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: days === d ? "var(--accent)" : "var(--surface2)",
                color: days === d ? "#fff" : "var(--text-secondary)",
                border: `1px solid ${days === d ? "var(--accent)" : "var(--border)"}`,
              }}>
              {d === 7 ? "Last 7 days" : d === 30 ? "Last 30 days" : d === 90 ? "Last 90 days" : "Last year"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-5">
          {!data && !error && (
            <div className="text-center py-12" style={{ color: "var(--text-dim)" }}>Loading…</div>
          )}
          {error && (
            <div className="text-center py-12" style={{ color: "#ef4444" }}>{error}</div>
          )}

          {data && noData && (
            <div className="rounded-xl p-5 text-center" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent)" }}>
              <div className="text-3xl mb-2">📊</div>
              <h3 className="text-base font-bold mb-1" style={{ color: "var(--accent)" }}>No data yet</h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                The tracking snippet hasn&apos;t been added to this client&apos;s site yet, or no events have been recorded in the last {days} days.<br/>
                Copy the snippet below into their <span style={{ color: "var(--text)", fontWeight: 600 }}>index.html</span> just before <code>&lt;/body&gt;</code> and stats will start flowing within seconds.
              </p>
            </div>
          )}

          {data && !noData && (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Page Views" value={data.page_views} icon="👁" color="var(--text)" />
                <Stat label="Unique Visitors" value={data.unique_visitors} icon="👤" color="#3b82f6" />
                <Stat label="Calls" value={data.calls} icon="📞" color="#22c55e" />
                <Stat label="WhatsApps" value={data.whatsapps} icon="💬" color="#22c55e" />
                <Stat label="Messengers" value={data.messengers} icon="💌" color="#3b82f6" />
                <Stat label="Emails" value={data.emails} icon="📧" color="var(--accent)" />
                <Stat label="Maps Clicks" value={data.maps} icon="🗺" color="#8b5cf6" />
                <Stat label="Form Submits" value={data.forms} icon="📝" color="#facc15" />
              </div>

              {/* Conversion summary */}
              {data.page_views > 0 && (
                <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent)" }}>
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>Estimated Leads Generated</p>
                    <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>
                      {data.calls + data.whatsapps + data.messengers + data.emails + data.forms + data.bookings}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>Conversion Rate</p>
                    <p className="text-2xl font-bold" style={{ color: "#22c55e" }}>
                      {((data.calls + data.whatsapps + data.messengers + data.emails + data.forms + data.bookings) / data.page_views * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}

              {/* Sparkline */}
              {data.daily.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                  <p className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-dim)" }}>Daily Page Views</p>
                  <div className="flex items-end gap-1 h-24">
                    {data.daily.map((d) => (
                      <div key={d.day} className="flex-1 rounded-t transition-all" title={`${d.day}: ${d.page_views} views`}
                        style={{
                          height: `${(d.page_views / maxDaily) * 100}%`,
                          minHeight: d.page_views > 0 ? 4 : 1,
                          background: d.page_views > 0 ? "var(--accent)" : "var(--border)",
                        }} />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] mt-2" style={{ color: "var(--text-quaternary)" }}>
                    <span>{data.daily[0]?.day}</span>
                    <span>{data.daily[data.daily.length - 1]?.day}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Tracking snippet — always visible so Jay can copy for new sites or re-deploy */}
          {data && (
            <div className="rounded-xl p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Tracking Snippet</p>
                <button onClick={copySnippet}
                  className="text-xs font-semibold px-3 py-1 rounded-md transition-colors"
                  style={{
                    background: copied ? "#22c55e" : "var(--accent)",
                    color: "#fff",
                  }}>
                  {copied ? "✓ Copied" : "📋 Copy"}
                </button>
              </div>
              <code className="block text-xs p-2 rounded font-mono break-all" style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}>
                {snippet}
              </code>
              <p className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
                Paste into the client&apos;s <code style={{ color: "var(--text)" }}>index.html</code> just before <code style={{ color: "var(--text)" }}>&lt;/body&gt;</code>. Push to GitHub Pages and stats start flowing within seconds.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value.toLocaleString()}</p>
    </div>
  );
}
