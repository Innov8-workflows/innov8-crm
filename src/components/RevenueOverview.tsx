"use client";

import { useEffect, useRef, useState } from "react";
import DateRangePicker from "./DateRangePicker";
import { dayLabel, periodLabel, rangeLabel, type DayRange, type RangePreset } from "@/lib/dateRange";

// The top of the Dashboard: MRR, ARR and CAPEX for the chosen period, how MRR
// moved inside it, and the months around it. Every figure comes from
// /api/revenue/period (src/lib/revenuePeriods.ts); this file only draws.

export interface SeriesPoint {
  period: string; mrr: number; newMrr: number; expansionMrr: number; churnedMrr: number;
  clients: number; estimated: boolean; capex?: number;
}
export interface RevenuePeriod {
  range: DayRange;
  snapshot: { mrr: number; clients: number; at: string };
  opening: { mrr: number; clients: number; at: string };
  movement: {
    newMrr: number; expansionMrr: number; churnedMrr: number;
    newClients: number; churnedClients: number; capex: number; reconciles: boolean;
  };
  series: SeriesPoint[];
  /** Day by day for ranges up to ~4 months, else []. */
  daily?: { date: string; mrr: number; clients: number; capex: number }[];
  coverage: { historyFrom: string; churnTracked: boolean; contractionTracked: boolean };
}

/** £1,234 — pence only when there are any (£1,234.50). */
export function gbp(n: number): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}
/** £4.2k for chart axes. */
const gbpShort = (n: number) => (n >= 1000 ? `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : `£${Math.round(n)}`);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${gbp(Math.abs(n))}`;
const dayShort = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const monthYearShort = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const monthShort = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

const C = { mrr: "#22c55e", arr: "#facc15", capex: "#3b82f6", churn: "#ef4444", exp: "#a855f7" };

export default function RevenueOverview({ revenue, context, range, preset, onRangeChange, onFixWonDates }: {
  revenue: RevenuePeriod;
  /** At least ~12 months ending where the range ends, for the trend lines and chart. */
  context: SeriesPoint[];
  range: DayRange; preset: RangePreset;
  onRangeChange?: (r: DayRange, p: RangePreset) => void;
  onFixWonDates: () => void;
}) {
  const { snapshot, opening, movement: mv } = revenue;
  const inRange = (p: string) => p >= revenue.range.start.slice(0, 7) && `${p}-01` < revenue.range.end;
  const churnUnknown = !!revenue.coverage.historyFrom && revenue.range.start < revenue.coverage.historyFrom;
  const mrrDelta = snapshot.mrr - opening.mrr;
  const avg = snapshot.clients ? snapshot.mrr / snapshot.clients : 0;
  const periodWords = rangeLabel(revenue.range, preset);
  const byDay = (revenue.daily || []).length >= 2;
  const pts: ChartPoint[] = byDay
    ? revenue.daily!.map((d) => ({ tick: dayShort(d.date), label: dayLabel(d.date), mrr: d.mrr, capex: d.capex, est: false }))
    : revenue.series.map((q) => ({ tick: monthYearShort(q.period), label: periodLabel(q.period), mrr: q.mrr, capex: q.capex || 0, est: q.estimated }));

  return (
    <section className="space-y-3">
      {/* Period bar — always visible at the top while scrolling */}
      <div className="sticky top-0 z-10 -mx-5 px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2"
        style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>Revenue</h2>
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>for</span>
        </div>
        {onRangeChange && <DateRangePicker value={range} preset={preset} onChange={onRangeChange} />}
        <button onClick={onFixWonDates} title="Every historical figure is dated from each client's won date"
          className="ml-auto text-[11px] px-2 py-1 rounded-md"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
          Fix won dates
        </button>
      </div>

      {/* The three that matter, each charted over the chosen period */}
      <div className="grid gap-3 lg:grid-cols-3">
        <HeroTile label="MRR" color={C.mrr} value={gbp(snapshot.mrr)}
          delta={mrrDelta} deltaNote={`since ${dayLabel(opening.at)}`}
          sub={`as at ${dayLabel(snapshot.at)} · ${snapshot.clients} clients · ${gbp(Math.round(avg))} avg`}
          chart={<Chart points={pts.map((q) => ({ ...q, v: q.mrr }))} color={C.mrr} kind="line" />} />
        <HeroTile label="ARR" color={C.arr} value={gbp(snapshot.mrr * 12)}
          delta={mrrDelta * 12} deltaNote={`since ${dayLabel(opening.at)}`}
          sub="MRR × 12, the yearly run rate"
          chart={<Chart points={pts.map((q) => ({ ...q, v: q.mrr * 12 }))} color={C.arr} kind="line" />} />
        <HeroTile label="CAPEX won" color={C.capex} value={gbp(mv.capex)}
          sub={`one-off fees in ${periodWords} · ${mv.newClients} new client${mv.newClients === 1 ? "" : "s"}`}
          chart={<Chart points={pts.map((q) => ({ ...q, v: q.capex }))} color={C.capex} kind="bars" />} />
      </div>

      {/* Movement inside the period */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <SmallTile label="New MRR" value={gbp(mv.newMrr)} color={C.mrr} sub={`${mv.newClients} new client${mv.newClients === 1 ? "" : "s"}`} />
        <SmallTile label="Expansion MRR" value={gbp(mv.expansionMrr)} color={C.exp} sub="upsells to existing clients" />
        <SmallTile label="Churned MRR" value={churnUnknown ? "—" : gbp(mv.churnedMrr)} color={C.churn}
          sub={churnUnknown ? `only tracked from ${dayLabel(revenue.coverage.historyFrom)}` : `${mv.churnedClients} client${mv.churnedClients === 1 ? "" : "s"} lost`} />
        <SmallTile label="Net MRR change" value={signed(mrrDelta)} color={mrrDelta >= 0 ? C.mrr : C.churn} sub={periodWords} />
        <SmallTile label="Live clients" value={String(snapshot.clients)} color="#f59e0b"
          sub={snapshot.clients - opening.clients ? `${snapshot.clients - opening.clients > 0 ? "+" : ""}${snapshot.clients - opening.clients} in period` : "no change in period"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <MonthChart series={context} inRange={inRange} />
        <Bridge opening={opening.mrr} openingAt={opening.at} closing={snapshot.mrr} closingAt={snapshot.at}
          newMrr={mv.newMrr} expansion={mv.expansionMrr} churned={mv.churnedMrr}
          churnUnknown={churnUnknown} reconciles={mv.reconciles} />
      </div>
    </section>
  );
}

// ── Tiles ──────────────────────────────────────────────────────────────────────

interface ChartPoint { tick: string; label: string; mrr: number; capex: number; est: boolean }

function HeroTile({ label, value, color, delta, deltaNote, sub, chart }: {
  label: string; value: string; color: string; delta?: number; deltaNote?: string; sub: string; chart: React.ReactNode;
}) {
  const showDelta = delta !== undefined && Math.abs(delta) >= 0.005;
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1.5" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: `3px solid ${color}` }}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{label}</span>
        {showDelta && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" title={deltaNote}
            style={{ background: delta! > 0 ? "#22c55e1f" : "#ef44441f", color: delta! > 0 ? "#22c55e" : "#ef4444" }}>
            {signed(delta!)}
          </span>
        )}
        {showDelta && deltaNote && <span className="text-[11px]" style={{ color: "var(--text-quaternary)" }}>{deltaNote}</span>}
      </div>
      <div className="text-3xl font-bold leading-none" style={{ color }}>{value}</div>
      <div className="text-[11px] truncate" style={{ color: "var(--text-dim)" }} title={sub}>{sub}</div>
      <div className="mt-1">{chart}</div>
    </div>
  );
}

/**
 * Stripe-style chart for a hero tile: area + line (or bars), three gridlines with
 * their values, first and last date along the bottom, and a hover line that reads
 * out the exact figure for the day or month under the cursor.
 *
 * The scale does NOT start at zero for lines: a £710 rise on £3,710 would be a
 * flat line otherwise. The gridline labels keep it honest. Bars start at zero.
 */
function Chart({ points, color, kind }: { points: (ChartPoint & { v: number })[]; color: string; kind: "line" | "bars" }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at its real pixel width (not stretched), so text and the hover dot keep their shape.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(400);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el); setW(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, [points.length >= 2]);
  const H = 150, PR = 40, PT = 8, PB = 18;
  if (points.length < 2) {
    return <div ref={box} className="h-[150px] flex items-center justify-center text-[11px]" style={{ color: "var(--text-quaternary)" }}>Not enough data for this period</div>;
  }
  const vals = points.map((q) => q.v);
  let lo = kind === "bars" ? 0 : Math.min(...vals), hi = Math.max(...vals);
  if (kind === "line") {
    const span = hi - lo || Math.max(hi * 0.05, 1);
    lo = Math.max(0, lo - span * 0.25); hi = hi + span * 0.15;
  } else hi = Math.max(hi, 1);
  const iw = W - PR, ih = H - PT - PB;
  const x = (i: number) => kind === "bars" ? ((i + 0.5) / points.length) * iw : (i / (points.length - 1)) * iw;
  const y = (v: number) => PT + ih * (1 - (v - lo) / (hi - lo || 1));
  const grid = [lo, lo + (hi - lo) / 2, hi];
  const line = points.map((q, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(q.v).toFixed(1)}`).join(" ");
  const gid = `g${color.slice(1)}`;
  const h = hover !== null ? points[hover] : null;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - box.left) / box.width) * iw;
    const i = kind === "bars" ? Math.floor((fx / iw) * points.length) : Math.round((fx / iw) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <div ref={box} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block">
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={0} x2={iw} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray={i === 0 ? "" : "3 4"} vectorEffect="non-scaling-stroke" />
            <text x={W - 2} y={y(g) + 3} textAnchor="end" fontSize={10} fill="var(--text-quaternary)">{gbpShort(g)}</text>
          </g>
        ))}
        {kind === "line" ? (
          <>
            <path d={`${line} L${iw},${PT + ih} L0,${PT + ih} Z`} fill={`url(#${gid})`} />
            <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </>
        ) : points.map((q, i) => {
          const bw = (iw / points.length) * 0.62;
          return <rect key={i} x={x(i) - bw / 2} y={y(q.v)} width={bw} height={Math.max(PT + ih - y(q.v), q.v > 0 ? 2 : 0)}
            rx={1.5} fill={color} opacity={hover === null || hover === i ? (q.est ? 0.5 : 0.9) : 0.35} />;
        })}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PT} y2={PT + ih} stroke="var(--text-dim)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            {kind === "line" && <circle cx={x(hover)} cy={y(h.v)} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
          </g>
        )}
        <text x={0} y={H - 4} fontSize={10} fill="var(--text-quaternary)">{points[0].tick}</text>
        <text x={iw} y={H - 4} fontSize={10} textAnchor="end" fill="var(--text-quaternary)">{points[points.length - 1].tick}</text>
        <rect x={0} y={0} width={iw} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {h && hover !== null && (
        <div className="absolute top-0 pointer-events-none rounded-md px-2 py-1 text-[11px] whitespace-nowrap shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`, transform: `translateX(${x(hover) / iw > 0.6 ? "-105%" : "5%"})`,
            background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)",
          }}>
          <div style={{ color: "var(--text-dim)" }}>{h.label}{h.est ? " (rebuilt)" : ""}</div>
          <div className="font-bold" style={{ color }}>{gbp(h.v)}</div>
        </div>
      )}
    </div>
  );
}

function SmallTile({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      <div className="text-[11px] truncate" style={{ color: "var(--text-quaternary)" }} title={sub}>{sub}</div>
    </div>
  );
}

// ── Month chart: MRR and CAPEX side by side ─────────────────────────────────────

function MonthChart({ series, inRange }: { series: SeriesPoint[]; inRange: (p: string) => boolean }) {
  const W = 640, H = 210, L = 44, B = 22, T = 10;
  const max = Math.max(...series.map((p) => Math.max(p.mrr, p.capex || 0)), 1);
  const nice = (() => { const step = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / step) * step; })();
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);
  const slot = (W - L) / Math.max(series.length, 1);
  const bw = Math.min(16, slot * 0.32);
  const anyEst = series.some((p) => p.estimated);
  return (
    <div className="rounded-xl p-4 lg:col-span-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>By month</span>
        <Legend color={C.mrr} label="MRR (end of month)" />
        <Legend color={C.capex} label="CAPEX won" />
        <span className="ml-auto text-[11px]" style={{ color: "var(--text-quaternary)" }}>
          bright = your chosen period{anyEst ? " · faded = rebuilt from won dates" : ""}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 210 }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 6} y={y(nice * f) + 3} textAnchor="end" fontSize={10} fill="var(--text-quaternary)">{gbpShort(nice * f)}</text>
          </g>
        ))}
        {series.map((p, i) => {
          const cx = L + slot * i + slot / 2;
          const on = inRange(p.period);
          const op = (on ? 1 : 0.3) * (p.estimated ? 0.55 : 1);
          const cap = p.capex || 0;
          return (
            <g key={p.period}>
              <rect x={cx - bw - 1} y={y(p.mrr)} width={bw} height={Math.max(y(0) - y(p.mrr), p.mrr > 0 ? 1.5 : 0)} rx={2} fill={C.mrr} opacity={op}>
                <title>{`${periodLabel(p.period)} — MRR ${gbp(p.mrr)} · ${p.clients} clients`}</title>
              </rect>
              <rect x={cx + 1} y={y(cap)} width={bw} height={Math.max(y(0) - y(cap), cap > 0 ? 1.5 : 0)} rx={2} fill={C.capex} opacity={op}>
                <title>{`${periodLabel(p.period)} — CAPEX won ${gbp(cap)}`}</title>
              </rect>
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill={on ? "var(--text-secondary)" : "var(--text-quaternary)"} fontWeight={on ? 700 : 400}>
                {monthShort(p.period)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{label}
    </span>
  );
}

// ── How MRR moved: opening → closing ────────────────────────────────────────────

function Bridge({ opening, openingAt, closing, closingAt, newMrr, expansion, churned, churnUnknown, reconciles }: {
  opening: number; openingAt: string; closing: number; closingAt: string;
  newMrr: number; expansion: number; churned: number; churnUnknown: boolean; reconciles: boolean;
}) {
  const max = Math.max(opening, closing, newMrr, expansion, churned, 1);
  const rows: { label: string; v: number; color: string; sign: string; note?: string }[] = [
    { label: "Start", v: opening, color: "var(--text-secondary)", sign: "", note: dayLabel(openingAt) },
    { label: "New clients", v: newMrr, color: C.mrr, sign: "+" },
    { label: "Upsells", v: expansion, color: C.exp, sign: "+" },
    { label: "Lost", v: churnUnknown ? 0 : churned, color: C.churn, sign: "−", note: churnUnknown ? "not tracked this far back" : undefined },
    { label: "End", v: closing, color: "var(--text)", sign: "", note: dayLabel(closingAt) },
  ];
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>How MRR moved</div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span style={{ color: "var(--text-secondary)" }}>{r.label}{r.note ? <span style={{ color: "var(--text-quaternary)" }}> · {r.note}</span> : null}</span>
              <span className="font-bold" style={{ color: r.color }}>{r.sign}{gbp(r.v)}</span>
            </div>
            <div className="h-2 rounded-full mt-1" style={{ background: "var(--surface2)" }}>
              <div className="h-2 rounded-full" style={{ width: `${Math.max((r.v / max) * 100, r.v > 0 ? 2 : 0)}%`, background: r.color === "var(--text)" || r.color === "var(--text-secondary)" ? C.mrr : r.color, opacity: r.sign ? 0.9 : 0.55 }} />
            </div>
          </div>
        ))}
      </div>
      {!reconciles && (
        <p className="text-[11px] mt-2" style={{ color: "#f59e0b" }}>
          Start + changes ≠ end for this period. Usually a product price edited in place; the totals are still right.
        </p>
      )}
    </div>
  );
}
