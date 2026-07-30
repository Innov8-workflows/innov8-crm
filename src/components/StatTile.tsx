"use client";

import Icon, { type IconName } from "./Icon";

// Shared KPI tile — used by SiteAnalyticsModal and the Client Dashboard.
// `delta` renders a comparison against the previous period when supplied.
export default function StatTile({
  label, value, icon, color, suffix = "", delta,
}: {
  label: string;
  value: number | string;
  icon: IconName;
  color: string;
  suffix?: string;
  delta?: number | null;
}) {
  const showDelta = typeof delta === "number" && delta !== 0;
  const up = (delta || 0) > 0;
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{label}</span>
        <Icon name={icon} className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-2xl font-bold" style={{ color }}>
          {typeof value === "number" ? value.toLocaleString() : value}{suffix}
        </p>
        {showDelta && (
          <span className="text-xs font-semibold" style={{ color: up ? "#22c55e" : "#ef4444" }}>
            {up ? "↑" : "↓"}{Math.abs(delta!).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
