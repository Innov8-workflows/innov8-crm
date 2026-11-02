"use client";

// The layer over the whole CRM for target celebrations and seasonal effects. Mounted in
// src/app/page.tsx only, so the login and client-facing onboarding pages never get it.
// The canvas takes no clicks, and src/lib/effectEngine.ts only runs while an effect does.
//
// The Preview list in SeasonalToggle.tsx, or ?effects= with a name from PREVIEWS, plays
// one on demand and writes nothing, so any of them can be seen on any day.
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { gbp } from "@/lib/money";
import { ukToday } from "@/lib/dateRange";
import { seasonFor, type Season } from "@/lib/seasons";
import { startEffect, type EffectKind } from "@/lib/effectEngine";
import { playKaching } from "@/lib/effectSound";
import { CELEBRATE_EVENT, MILESTONE_KEY, PREVIEW_EVENT, SEASONAL_EVENT, WIN_EVENT, celebratedKey, milestoneAt, momentFor, seasonalOn, type Moment } from "@/lib/celebrate";
import type { SalesTargetResponse } from "@/lib/salesTargets";

const SEASON_EFFECT: Record<Season, EffectKind> = {
  bonfire: "fireworks", christmas: "stars", xmasday: "gifts", newyear: "fireworks",
  valentines: "hearts", easter: "spring", halloween: "ghosts",
};
const hasLights = (s: Season | null) => s === "christmas" || s === "xmasday";

const SEASON_MS = 45_000;
const PREVIEW_MS = 15_000;
const SEASON_EVERY_MS = 20 * 60_000;
const SNOW_EVERY_MS = 30 * 60_000;
const TARGET_EVERY_MS = 5 * 60_000;
const BANNER_MS = 8_000;
const BULBS = ["#ef4444", "#fbbf24", "#22c55e", "#38bdf8"];

interface Banner { title: string; name?: string; sub: string }

const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

export default function Celebrations() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [lights, setLights] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fromUrl = new URLSearchParams(window.location.search).get("effects");
    let previewing = !!fromUrl;
    let stop: (() => void) | null = null;
    let playing: EffectKind | null = null;
    let celebrating = false;
    let snowing = false;
    let bannerTimer = 0;
    let lastCheck = 0;
    const done = new Set<string>();     // for when localStorage won't hold the key

    const halt = () => { stop?.(); stop = null; playing = null; };
    const play = (kind: EffectKind, ms: number | null, onEnd?: () => void) => {
      halt();
      playing = kind;
      stop = startEffect(canvas, kind, ms, () => { stop = null; playing = null; onEnd?.(); });
    };

    const seasonal = () => {
      if (previewing || celebrating) return;
      const on = seasonalOn();
      const season = seasonFor(ukToday());
      setLights(on && hasLights(season));
      if (!on) { halt(); return; }
      if (snowing) { if (playing !== "snow") play("snow", null); return; }
      if (playing === "snow") halt();
      if (season && !playing) play(SEASON_EFFECT[season], SEASON_MS);
    };

    const checkSnow = () => {
      if (previewing || !seasonalOn()) return;
      fetch("/api/weather-snow", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { snowing?: boolean } | null) => { snowing = !!d?.snowing; seasonal(); })
        .catch(() => {});
    };

    const fanfare = (b: Banner, big: boolean) => {
      celebrating = true;
      setBanner(b);
      playKaching();
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => setBanner(null), BANNER_MS);
      play(big ? "fireworks" : "confetti", big ? 6000 : 3000, () => { celebrating = false; previewing = false; seasonal(); });
    };

    const celebrate = (m: Moment) => fanfare({
      title: `${m.record ? "New record month. " : ""}${monthLabel(m.month)} target hit.`,
      sub: `${gbp(m.amount)} sold${m.run >= 3 ? ` · ${m.run} months in a row` : ""}`,
    }, m.record);

    const celebrateWin = (name: string, clients: number | null) => fanfare({
      title: "New client won.", name, sub: clients ? `Client number ${clients}` : "Project created",
    }, false);

    const celebrateMilestone = (m: number) => fanfare({
      title: `${gbp(m)} a month.`, sub: `That's ${gbp(m * 12)} a year in recurring revenue`,
    }, true);

    const alreadyDone = (month: string) => {
      if (done.has(month)) return true;
      try { return localStorage.getItem(celebratedKey(month)) === "1"; } catch { return false; }
    };

    const checkTarget = () => {
      if (previewing || document.visibilityState !== "visible" || Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now();
      fetch("/api/sales-targets", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: SalesTargetResponse | null) => {
          const m = data && momentFor(data);
          if (!m || alreadyDone(m.month)) { checkMilestone(); return; }
          done.add(m.month);
          try { localStorage.setItem(celebratedKey(m.month), "1"); } catch {}
          celebrate(m);
        })
        .catch(() => {});
    };

    // The first run in a browser only notes where MRR already stands, so landmarks
    // passed long ago don't all go off at once. Each new one fires once after that.
    const checkMilestone = () => {
      if (celebrating) return;
      fetch("/api/celebrations", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { mrr?: number } | null) => {
          if (!d?.mrr) return;
          const reached = milestoneAt(d.mrr);
          let stored: string | null = String(reached);
          try { stored = localStorage.getItem(MILESTONE_KEY); } catch {}
          if (stored !== null && reached <= Number(stored)) return;
          try { localStorage.setItem(MILESTONE_KEY, String(reached)); } catch {}
          if (stored !== null) celebrateMilestone(reached);
        })
        .catch(() => {});
    };

    const runPreview = (name: string) => {
      const after = () => { previewing = false; seasonal(); };
      halt();
      window.clearTimeout(bannerTimer);
      setBanner(null);
      setLights(false);
      celebrating = false;
      previewing = true;
      if (name === "win") {
        celebrateWin("Example Roofing", 34);
      } else if (name === "milestone") {
        celebrateMilestone(10000);
      } else if (name === "target" || name === "record") {
        const record = name === "record";
        celebrate({ month: ukToday().slice(0, 7), amount: 2140, record, run: record ? 3 : 1 });
      } else if (name === "snow") {
        play("snow", PREVIEW_MS, after);
      } else if (name in SEASON_EFFECT) {
        setLights(hasLights(name as Season));
        play(SEASON_EFFECT[name as Season], PREVIEW_MS, after);
      } else {
        after();            // "stop", or an unknown name in the URL
      }
    };

    const onWin = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      fetch("/api/celebrations", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { clients?: number } | null) => celebrateWin(name, d?.clients ?? null))
        .catch(() => celebrateWin(name, null));
    };
    const onPreview = (e: Event) => runPreview((e as CustomEvent<string>).detail);
    const onReplay = (e: Event) => celebrate((e as CustomEvent<Moment>).detail);
    const onToggle = () => {
      if (!seasonalOn() && !celebrating) { halt(); setLights(false); previewing = false; }
      seasonal();
      checkSnow();
    };
    window.addEventListener(CELEBRATE_EVENT, onReplay);
    window.addEventListener(PREVIEW_EVENT, onPreview);
    window.addEventListener(WIN_EVENT, onWin);
    window.addEventListener(SEASONAL_EVENT, onToggle);
    document.addEventListener("visibilitychange", checkTarget);

    // Three seconds in, so nothing here competes with the first load.
    const boot = window.setTimeout(() => {
      if (fromUrl) { runPreview(fromUrl); return; }
      seasonal();
      checkSnow();
      checkTarget();
    }, 3000);

    const timers = [
      window.setInterval(seasonal, SEASON_EVERY_MS),
      window.setInterval(checkSnow, SNOW_EVERY_MS),
      window.setInterval(checkTarget, TARGET_EVERY_MS),
    ];

    return () => {
      window.clearTimeout(boot);
      window.clearTimeout(bannerTimer);
      timers.forEach((t) => window.clearInterval(t));
      window.removeEventListener(CELEBRATE_EVENT, onReplay);
      window.removeEventListener(PREVIEW_EVENT, onPreview);
      window.removeEventListener(WIN_EVENT, onWin);
      window.removeEventListener(SEASONAL_EVENT, onToggle);
      document.removeEventListener("visibilitychange", checkTarget);
      halt();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 w-full h-full"
        style={{ zIndex: 60, pointerEvents: "none" }} />

      {lights && (
        <div aria-hidden="true" className="fixed top-0 left-0 right-0 flex justify-between px-2 overflow-hidden"
          style={{ zIndex: 60, pointerEvents: "none", height: 8 }}>
          {Array.from({ length: 48 }, (_, i) => (
            <span key={i} className="crm-bulb" style={{ background: BULBS[i % BULBS.length], color: BULBS[i % BULBS.length], animationDelay: `${(i % 7) * 0.3}s` }} />
          ))}
        </div>
      )}

      {banner && (
        <div role="status" className="crm-banner fixed left-1/2 flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ zIndex: 61, top: 64, background: "var(--surface)", border: "1px solid var(--accent)", boxShadow: "0 12px 32px rgba(0,0,0,0.35)", maxWidth: "calc(100vw - 32px)" }}>
          <Icon name="trophy" className="w-6 h-6 flex-shrink-0" style={{ color: "var(--accent)" }} />
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--text)" }}>
              {banner.title}{banner.name && <span className="cf-name"> {banner.name}</span>}
            </div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {banner.sub}
            </div>
          </div>
          <button onClick={() => setBanner(null)} className="text-xs px-2 py-1" style={{ color: "var(--text-dim)" }}>Close</button>
        </div>
      )}
    </>
  );
}
