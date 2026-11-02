"use client";

// The daily sales streak at the top of the Today page. It fetches for itself so a
// failure here can't take Today down. Rules and sources: src/lib/salesStreak.ts.
import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { StreakDay, StreakResponse } from "@/lib/salesStreak";

const GOOD = "#22c55e";
const REFRESH_MS = 2 * 60_000;

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default function SalesStreak() {
  const [data, setData] = useState<StreakResponse | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/celebrations", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { streak?: StreakResponse } | null) => { if (live && d?.streak) setData(d.streak); })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { live = false; window.clearInterval(timer); };
  }, []);

  if (!data) return null;

  const { goal, today, streak, best, days } = data;
  const safe = today.count >= goal;
  const left = goal - today.count;
  const flame = streak > 0 || safe ? "var(--accent)" : "var(--text-dim)";

  return (
    <section className="mx-5 mt-4 rounded-xl p-4 flex items-center gap-x-6 gap-y-3 flex-wrap" aria-label="Daily sales streak"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2.5">
        <Icon name="fire" className="w-8 h-8" style={{ color: flame }} />
        <div>
          <div className="text-xl font-extrabold leading-tight" style={{ color: "var(--text)" }}>
            {streak} day{streak === 1 ? "" : "s"}
          </div>
          <div className="text-xs" style={{ color: "var(--text-dim)" }}>Sales streak · best {best}</div>
        </div>
      </div>

      <div className="flex-1" style={{ minWidth: 200 }}>
        <div className="flex justify-between text-xs mb-1">
          <span className="font-semibold" style={{ color: safe ? GOOD : "var(--text-secondary)" }}>
            {safe ? "Streak safe for today" : `${left} more today to keep it going`}
          </span>
          <span style={{ color: "var(--text-dim)" }}>{today.count} of {goal}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (today.count / goal) * 100)}%`, background: safe ? GOOD : "var(--accent)" }} />
        </div>
        <div className="text-[11px] mt-1" style={{ color: "var(--text-quaternary)" }}>
          {today.calls} call{today.calls === 1 ? "" : "s"} · {today.messages} message{today.messages === 1 ? "" : "s"} · {today.emails} email{today.emails === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex items-center gap-1" aria-label="Last 14 days">
        {days.map((d, i) => <Dot key={d.day} d={d} isToday={i === days.length - 1} goal={goal} />)}
      </div>
    </section>
  );
}

function Dot({ d, isToday, goal }: { d: StreakDay; isToday: boolean; goal: number }) {
  const background = d.met ? GOOD : d.weekend || isToday ? "var(--surface3)" : "var(--border)";
  return (
    <span title={`${dayLabel(d.day)}: ${d.count} of ${goal}${d.weekend && !d.met ? " (weekend)" : ""}`} className="inline-block rounded-sm"
      style={{ width: 12, height: 12, background, outline: isToday ? "1px solid var(--accent)" : "none", outlineOffset: 1, opacity: d.weekend && !d.met ? 0.5 : 1 }} />
  );
}
