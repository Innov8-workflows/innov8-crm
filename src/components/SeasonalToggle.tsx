"use client";

// Top-bar switch for the seasonal effects. Target celebrations ignore it: they're rare,
// earned, and each one can be closed.
import { useSyncExternalStore } from "react";
import Icon from "./Icon";
import { SEASONAL_EVENT, seasonalOn, setSeasonal } from "@/lib/celebrate";

const subscribe = (notify: () => void) => {
  window.addEventListener(SEASONAL_EVENT, notify);
  return () => window.removeEventListener(SEASONAL_EVENT, notify);
};

export default function SeasonalToggle() {
  const on = useSyncExternalStore(subscribe, seasonalOn, () => true);
  return (
    <button
      onClick={() => setSeasonal(!on)}
      aria-pressed={on}
      aria-label="Seasonal effects"
      className="flex items-center justify-center p-2 rounded-lg transition-colors flex-shrink-0"
      style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: on ? "var(--accent)" : "var(--text-muted)" }}
      title={on ? "Seasonal effects are on. Click to turn them off" : "Seasonal effects are off. Click to turn them on"}
    >
      <Icon name="sparkles" className="w-4 h-4" />
    </button>
  );
}
