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
import { CELEBRATE_EVENT, PREVIEW_EVENT, SEASONAL_EVENT, celebratedKey, momentFor, seasonalOn, type Moment } from "@/lib/celebrate";
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

const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

export default function Celebrations() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
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

    const celebrate = (m: Moment) => {
      celebrating = true;
      setMoment(m);
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => setMoment(null), BANNER_MS);
      play(m.record ? "fireworks" : "confetti", m.record ? 6000 : 3000, () => { celebrating = false; previewing = false; seasonal(); });
    };

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
          if (!m || alreadyDone(m.month)) return;
          done.add(m.month);
          try { localStorage.setItem(celebratedKey(m.month), "1"); } catch {}
          celebrate(m);
        })
        .catch(() => {});
    };

    const runPreview = (name: string) => {
      const after = () => { previewing = false; seasonal(); };
      halt();
      window.clearTimeout(bannerTimer);
      setMoment(null);
      setLights(false);
      celebrating = false;
      previewing = true;
      if (name === "target" || name === "record") {
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

    const onPreview = (e: Event) => runPreview((e as CustomEvent<string>).detail);
    const onReplay = (e: Event) => celebrate((e as CustomEvent<Moment>).detail);
    const onToggle = () => {
      if (!seasonalOn() && !celebrating) { halt(); setLights(false); previewing = false; }
      seasonal();
      checkSnow();
    };
    window.addEventListener(CELEBRATE_EVENT, onReplay);
    window.addEventListener(PREVIEW_EVENT, onPreview);
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

      {moment && (
        <div role="status" className="crm-banner fixed left-1/2 flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ zIndex: 61, top: 64, background: "var(--surface)", border: "1px solid var(--accent)", boxShadow: "0 12px 32px rgba(0,0,0,0.35)", maxWidth: "calc(100vw - 32px)" }}>
          <Icon name="trophy" className="w-6 h-6 flex-shrink-0" style={{ color: "var(--accent)" }} />
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--text)" }}>
              {moment.record ? `New record month. ${monthLabel(moment.month)} target hit.` : `${monthLabel(moment.month)} target hit.`}
            </div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {gbp(moment.amount)} sold{moment.run >= 3 ? ` · ${moment.run} months in a row` : ""}
            </div>
          </div>
          <button onClick={() => setMoment(null)} className="text-xs px-2 py-1" style={{ color: "var(--text-dim)" }}>Close</button>
        </div>
      )}
    </>
  );
}
