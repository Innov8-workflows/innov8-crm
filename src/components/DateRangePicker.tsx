"use client";

import { isValidDate, isWholeMonth, presetRange, rangeLabel, shiftMonthRange,
         type DayRange, type RangePreset } from "@/lib/dateRange";

// One control for every period-scoped metric. Deliberately absorbs the TWO
// conventions this app already had rather than becoming a third:
//   - preset pills, styled after SiteAnalyticsModal's [7,30,90,365] row
//   - the ‹ › Today stepper from ClientDashboard, shown only when the range is
//     exactly one calendar month (stepping a 90-day window makes no sense)
//
// Fully controlled: no fetching, no localStorage. Persistence is the parent's job,
// mirroring how ownerFilter is owned by page.tsx.
//
// Imports from @/lib/dateRange, never @/lib/revenuePeriods — the latter pulls
// @libsql/client and would drag the database driver into the browser bundle.

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3m", label: "3 months" },
  { id: "last_6m", label: "6 months" },
  { id: "last_12m", label: "12 months" },
  { id: "ytd", label: "Year to date" },
  { id: "all", label: "All time" },
];

export default function DateRangePicker({ value, preset, onChange }: {
  value: DayRange;
  preset: RangePreset;
  onChange: (range: DayRange, preset: RangePreset) => void;
}) {
  const steppable = isWholeMonth(value);
  const today = new Date().toISOString().slice(0, 10);

  const pill = (active: boolean) => ({
    background: active ? "var(--accent)" : "var(--surface2)",
    color: active ? "#fff" : "var(--text-secondary)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
  });

  const stepBtn = {
    background: "var(--surface2)",
    border: "1px solid var(--border-light)",
    color: "var(--text-secondary)",
  };

  // colorScheme: "dark" is required or the native picker renders white-on-white.
  // ClientDashboard's fieldStyle omits it — don't copy that.
  const dateInput = {
    background: "var(--surface)", border: "1px solid var(--border-light)",
    color: "var(--text)", outline: "none", colorScheme: "dark" as const,
  };

  const setCustom = (patch: Partial<DayRange>) => {
    const next = { ...value, ...patch };
    if (!isValidDate(next.start) || !isValidDate(next.end) || next.end <= next.start) return;
    onChange(next, "custom");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => (
        <button key={p.id} onClick={() => onChange(presetRange(p.id), p.id)}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
          style={pill(preset === p.id)}>
          {p.label}
        </button>
      ))}

      <button onClick={() => onChange(value, "custom")}
        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
        style={pill(preset === "custom")}>
        Custom
      </button>

      {/* Month stepper — only meaningful when the range IS a single month. */}
      {steppable && (
        <div className="flex items-center gap-1 ml-1">
          <button onClick={() => onChange(shiftMonthRange(value, -1), "custom")}
            title="Previous month"
            className="px-2 py-1.5 rounded-md text-sm" style={stepBtn}>‹</button>
          <span className="text-xs font-semibold px-2 min-w-[110px] text-center" style={{ color: "var(--text)" }}>
            {rangeLabel(value, preset)}
          </span>
          <button onClick={() => onChange(shiftMonthRange(value, 1), "custom")}
            title="Next month"
            className="px-2 py-1.5 rounded-md text-sm" style={stepBtn}>›</button>
        </div>
      )}

      {!steppable && (
        <span className="text-xs px-2" style={{ color: "var(--text-muted)" }}>
          {rangeLabel(value, preset)}
        </span>
      )}

      {preset === "custom" && (
        <div className="flex items-center gap-1.5 ml-1">
          <input type="date" value={value.start} max={today}
            onChange={(e) => setCustom({ start: e.target.value })}
            className="px-2 py-1 text-xs rounded-md" style={dateInput} />
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>to</span>
          {/* The stored end is EXCLUSIVE; show the last day INSIDE the range, which
              is what a human means by "to", and convert back on change. */}
          <input type="date"
            value={new Date(Date.parse(value.end) - 86400000).toISOString().slice(0, 10)}
            max={today}
            onChange={(e) => {
              if (!isValidDate(e.target.value)) return;
              setCustom({ end: new Date(Date.parse(e.target.value) + 86400000).toISOString().slice(0, 10) });
            }}
            className="px-2 py-1 text-xs rounded-md" style={dateInput} />
        </div>
      )}
    </div>
  );
}
