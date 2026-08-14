"use client";

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  SCHEDULE_SLOTS,
  ACTIVITY_META,
  WEEKLY_TARGETS,
  DAYS,
  DAY_LABELS,
  DAY_INDEX,
  type Day,
  type Activity,
  type ScheduleSlot,
  mondayOfWeek,
  dateForDayOffset,
  todayAsDay,
} from "@/lib/scheduleTemplate";
import LoadingAI from "./LoadingAI";
import Icon from "./Icon";
import { useToast } from "./Toast";

interface Completion {
  slot_id: string;
  date: string;
  notes: string;
}

export default function Schedule() {
  const { toast } = useToast();
  const [weekMonday, setWeekMonday] = useState<string>(() => mondayOfWeek());
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<string[]>([]);

  const today = todayAsDay();

  const fetchWeek = useCallback(async () => {
    setLoading(true);
    // cache: "no-store" pairs with the server's no-store header — guarantees
    // we get the latest completions whenever fetchWeek runs (mount + week nav
    // + post-toggle rollback).
    const res = await fetch(`/api/schedule?week=${weekMonday}`, { cache: "no-store" });
    const data = await res.json();
    setCompletions(data.completions || []);
    setDays(data.days || []);
    setLoading(false);
  }, [weekMonday]);

  useEffect(() => { fetchWeek(); }, [fetchWeek]);

  // Quick lookup: is (slot, date) completed?
  const completionMap = useMemo(() => {
    const m = new Map<string, Completion>();
    for (const c of completions) m.set(`${c.slot_id}|${c.date}`, c);
    return m;
  }, [completions]);

  const isComplete = useCallback((slotId: string, date: string) => completionMap.has(`${slotId}|${date}`), [completionMap]);

  const toggleSlot = useCallback(async (slot: ScheduleSlot, date: string) => {
    const key = `${slot.id}|${date}`;
    const wasComplete = completionMap.has(key);
    const newState = !wasComplete;

    // Optimistic update
    setCompletions((prev) => {
      if (newState) {
        return [...prev, { slot_id: slot.id, date, notes: "" }];
      }
      return prev.filter((c) => !(c.slot_id === slot.id && c.date === date));
    });

    try {
      const res = await fetch("/api/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_id: slot.id, date, completed: newState }),
      });
      // CRUCIAL: fetch only throws on network errors. A 4xx/5xx response is
      // considered "successful" by fetch — without this check, silent server
      // failures left the optimistic tick on screen but no row in the DB,
      // so refreshing wiped the progress.
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      toast(newState ? `✓ ${slot.title}` : `Unticked ${slot.title}`, newState ? "success" : "info");
    } catch (err) {
      console.error("schedule toggle failed", err);
      // Rollback the optimistic update by re-syncing from the server
      fetchWeek();
      toast("Update failed — please retry", "error");
    }
  }, [completionMap, toast, fetchWeek]);

  // Weekly progress per activity
  const progress = useMemo(() => {
    const counts: Partial<Record<Activity, number>> = {};
    for (const slot of SCHEDULE_SLOTS) {
      const date = dateForDayOffset(weekMonday, DAY_INDEX[slot.day]);
      if (!completionMap.has(`${slot.id}|${date}`)) continue;
      const add = slot.target?.count ?? 0;
      counts[slot.activity] = (counts[slot.activity] || 0) + add;
    }
    return counts;
  }, [completionMap, weekMonday]);

  // Format week label e.g. "Mon 25 May – Sun 31 May"
  const weekLabel = useMemo(() => {
    if (days.length < 7) return "";
    const first = new Date(days[0] + "T00:00:00");
    const last = new Date(days[6] + "T00:00:00");
    const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `${fmt(first)} – ${fmt(last)}`;
  }, [days]);

  const navWeek = (offsetDays: number) => {
    const d = new Date(weekMonday + "T00:00:00");
    d.setDate(d.getDate() + offsetDays);
    setWeekMonday(d.toISOString().split("T")[0]);
  };

  const isCurrentWeek = weekMonday === mondayOfWeek();

  if (loading && completions.length === 0) return <LoadingAI message="Loading schedule" />;

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="px-4 py-3 sticky top-0 z-20" style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text)" }}><Icon name="calendar" className="w-5 h-5" style={{ color: "var(--accent)" }} /> Weekly Schedule</h1>
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: "var(--accent-subtle)", color: "var(--accent)", fontWeight: 600 }}>
              Full time · Mon-Fri 9-6
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navWeek(-7)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--surface2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>← Prev</button>
            <span className="text-sm font-semibold px-3" style={{ color: "var(--text)" }}>{weekLabel}{isCurrentWeek && <span className="ml-2 text-xs" style={{ color: "var(--accent)" }}>· this week</span>}</span>
            <button onClick={() => navWeek(7)} className="text-xs px-2 py-1 rounded" style={{ background: "var(--surface2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Next →</button>
            {!isCurrentWeek && (
              <button onClick={() => setWeekMonday(mondayOfWeek())} className="text-xs px-2 py-1 rounded ml-1" style={{ background: "var(--accent)", color: "#fff", fontWeight: 600 }}>Jump to today</button>
            )}
          </div>
        </div>

        {/* Progress strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {(Object.entries(WEEKLY_TARGETS) as Array<[Activity, number]>).map(([act, target]) => {
            const done = progress[act] ?? 0;
            const pct = Math.min(100, Math.round((done / target) * 100));
            const meta = ACTIVITY_META[act];
            const barColor = pct >= 100 ? "#22c55e" : pct >= 60 ? meta.color : pct >= 30 ? "#f59e0b" : "#ef4444";
            return (
              <div key={act} className="rounded-lg p-2" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-dim)" }}><Icon name={meta.icon} className="w-3.5 h-3.5" style={{ color: meta.color }} /> {meta.label}</span>
                  <span className="text-xs font-bold" style={{ color: barColor }}>{done}/{target}</span>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface3)" }}>
                  <div className="h-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day grid */}
      {/* items-start: the weekend columns hold 2 slots against the weekdays' 10,
          and without it the grid stretches them into a mostly-empty 1200px box. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3 p-4 items-start">
        {DAYS.map((day) => {
          const date = dateForDayOffset(weekMonday, DAY_INDEX[day]);
          const isToday = isCurrentWeek && today === day;
          const slots = SCHEDULE_SLOTS.filter((s) => s.day === day);
          const dayCompleted = slots.filter((s) => isComplete(s.id, date)).length;

          return (
            <div key={day} className="rounded-xl overflow-hidden flex flex-col" style={{
              background: "var(--surface)",
              border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
              boxShadow: isToday ? "0 0 16px rgba(234,88,12,0.25)" : "none",
            }}>
              <div className="px-3 py-2" style={{
                background: isToday ? "var(--accent-subtle)" : "var(--surface2)",
                borderBottom: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
              }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: isToday ? "var(--accent)" : "var(--text)" }}>
                    {DAY_LABELS[day]}
                    {isToday && <span className="text-[10px] ml-1.5 uppercase tracking-wider">TODAY</span>}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-dim)" }}>{dayCompleted}/{slots.length}</span>
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--text-quaternary)" }}>
                  {new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
              </div>

              <div className="p-2 space-y-2 flex-1">
                {slots.map((slot) => (
                  <SlotCard
                    key={slot.id}
                    slot={slot}
                    completed={isComplete(slot.id, date)}
                    onToggle={() => toggleSlot(slot, date)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rationale strip */}
      <div className="mx-4 mb-4 rounded-xl p-4 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-dim)" }}>
        <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Why this schedule? </span>
        Mornings fulfil and fill the pipe — client work first, then <strong style={{ color: "var(--text)" }}>30 Facebook messages</strong>, the number that decides whether you have calls to make in ten days&apos; time. Gym and lunch are blocked out, not squeezed in: full time removes the excuse, and the afternoon phone session sounds completely different on the back of them. Calls sit at 3.30-6pm because that runs into the <strong style={{ color: "var(--text)" }}>4:30-6pm window</strong> Pricing → Best Times to Call rates as one of the two best of the day for trades. Evenings stop at 7.15 and the weekend is a half-day — that&apos;s what makes this survivable past month three.
      </div>
    </div>
  );
}

// ─── Slot card ──────────────────────────────────────────────────────────
// Memoised — re-renders only when this slot's completion state changes,
// not when sibling slots are toggled (was 210 re-renders per click before).
const SlotCard = memo(function SlotCardBase({ slot, completed, onToggle }: { slot: ScheduleSlot; completed: boolean; onToggle: () => void }) {
  const meta = ACTIVITY_META[slot.activity];
  const isRest = slot.protectedRest;

  return (
    <button
      onClick={onToggle}
      className="w-full text-left rounded-lg p-2.5 transition-all"
      style={{
        background: completed ? `${meta.color}15` : isRest ? "var(--surface2)" : "var(--surface2)",
        border: `1px solid ${completed ? meta.color : isRest ? "var(--border)" : "var(--border)"}`,
        opacity: isRest ? 0.6 : 1,
      }}
    >
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        <div
          className="w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors"
          style={{
            background: completed ? meta.color : "transparent",
            border: `1.5px solid ${completed ? meta.color : "var(--border-light)"}`,
          }}
        >
          {completed && (
            <svg className="w-3 h-3" fill="none" stroke="#fff" strokeWidth={3} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-[10px] font-mono" style={{ color: completed ? "var(--text-muted)" : "var(--text-dim)" }}>
              {slot.start}–{slot.end}
            </span>
            <span className="flex items-center gap-1" title={meta.label} style={{ color: meta.color }}>
              <Icon name={meta.icon} className="w-3.5 h-3.5" />
              {slot.mobile && <Icon name="device-mobile" className="w-3 h-3" />}
            </span>
          </div>
          <p className="text-xs font-semibold leading-tight" style={{
            color: completed ? "var(--text-muted)" : "var(--text)",
            textDecoration: completed ? "line-through" : "none",
          }}>{slot.title}</p>
          {slot.target && !isRest && (
            <p className="text-[10px] mt-1 font-bold" style={{ color: completed ? meta.color : meta.color }}>
              Target: {slot.target.count} {meta.unit || ""}
            </p>
          )}
          <p className="text-[10px] mt-1 italic leading-snug" style={{ color: "var(--text-dim)" }}>{slot.rationale}</p>
        </div>
      </div>
    </button>
  );
}, (prev, next) => prev.completed === next.completed && prev.slot.id === next.slot.id);
