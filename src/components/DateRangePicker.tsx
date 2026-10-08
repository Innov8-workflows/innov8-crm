"use client";

import { dayBefore, isValidDate, isWholeMonth, monthEnd, presetRange, rangeLabel, shiftMonthRange,
         type DayRange, type RangePreset } from "@/lib/dateRange";

// One control for every period-scoped metric: a segmented row of presets, the
// period in words, a ‹ › month stepper and a custom range.
//
// The stepper is always there: on a single month it steps that month; on any
// other range it jumps to the month before / after the one the range ends in,
// so "go back a month" is one click from anywhere.
//
// Fully controlled: no fetching, no localStorage. Persistence is the parent's job,
// mirroring how ownerFilter is owned by page.tsx.
//
// Imports from @/lib/dateRange, never @/lib/revenuePeriods — the latter pulls
// @libsql/client and would drag the database driver into the browser bundle.

const PRESETS: { id: RangePreset; label: string; title: string }[] = [
  { id: "this_month", label: "This month", title: "This calendar month" },
  { id: "last_month", label: "Last month", title: "Last calendar month" },
  { id: "last_3m", label: "3M", title: "Last 3 months, including this one" },
  { id: "last_6m", label: "6M", title: "Last 6 months, including this one" },
  { id: "last_12m", label: "12M", title: "Last 12 months, including this one" },
  { id: "ytd", label: "YTD", title: "Year to date" },
  { id: "all", label: "All", title: "All time" },
];

export default function DateRangePicker({ value, preset, onChange }: {
  value: DayRange;
  preset: RangePreset;
  onChange: (range: DayRange, preset: RangePreset) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  // The month the stepper moves from: the range itself if it is one month,
  // otherwise the month the range ends in.
  const lastMonth = dayBefore(value.end).slice(0, 7);
  const anchor: DayRange = isWholeMonth(value) ? value : { start: `${lastMonth}-01`, end: monthEnd(lastMonth) };
  const step = (d: number) => {
    // On a single month: step it. On a longer range: ‹ = the month before the one
    // the range ends in, › = that month itself.
    const next = isWholeMonth(value) ? shiftMonthRange(anchor, d) : d < 0 ? shiftMonthRange(anchor, -1) : anchor;
    const thisM = presetRange("this_month"), lastM = presetRange("last_month");
    onChange(next, next.start === thisM.start ? "this_month" : next.start === lastM.start ? "last_month" : "custom");
  };
  const atLatest = isWholeMonth(value) && value.start >= presetRange("this_month").start;

  const dateInput = {
    background: "var(--surface)", border: "1px solid var(--border-light)",
    color: "var(--text)", outline: "none", colorScheme: "dark" as const,
  };

  const setCustom = (patch: Partial<DayRange>) => {
    const next = { ...value, ...patch };
    if (!isValidDate(next.start) || !isValidDate(next.end) || next.end <= next.start) return;
    onChange(next, "custom");
  };

  const seg = (active: boolean, first: boolean, last: boolean) => ({
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--text-secondary)",
    borderRadius: `${first ? 8 : 0}px ${last ? 8 : 0}px ${last ? 8 : 0}px ${first ? 8 : 0}px`,
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center" style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 9 }}>
        {PRESETS.map((p, i) => (
          <button key={p.id} title={p.title} onClick={() => onChange(presetRange(p.id), p.id)}
            className="text-xs font-semibold px-2.5 py-1.5 transition-colors"
            style={seg(preset === p.id, i === 0, false)}>
            {p.label}
          </button>
        ))}
        <button onClick={() => onChange(value, "custom")} title="Pick exact dates"
          className="text-xs font-semibold px-2.5 py-1.5 transition-colors"
          style={seg(preset === "custom", false, true)}>
          Custom
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button onClick={() => step(-1)} title="Previous month"
          className="w-7 h-7 rounded-md text-sm font-bold"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>‹</button>
        <span className="text-sm font-bold px-1.5 min-w-[130px] text-center" style={{ color: "var(--text)" }}>
          {rangeLabel(value, preset)}
        </span>
        <button onClick={() => step(1)} title="Next month" disabled={atLatest}
          className="w-7 h-7 rounded-md text-sm font-bold"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)", opacity: atLatest ? 0.35 : 1 }}>›</button>
      </div>

      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
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
