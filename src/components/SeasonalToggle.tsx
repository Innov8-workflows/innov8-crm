"use client";

// Top-bar menu for the effects: the seasonal on/off switch, and a list that plays any
// effect on demand. The switch doesn't touch target celebrations: they're rare, earned,
// and each one can be closed. Previews write nothing, so they can't use up a real one.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Icon from "./Icon";
import { PREVIEWS, PREVIEW_EVENT, SEASONAL_EVENT, seasonalOn, setSeasonal } from "@/lib/celebrate";

const subscribe = (notify: () => void) => {
  window.addEventListener(SEASONAL_EVENT, notify);
  return () => window.removeEventListener(SEASONAL_EVENT, notify);
};

const preview = (name: string) => window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: name }));

export default function SeasonalToggle() {
  const on = useSyncExternalStore(subscribe, seasonalOn, () => true);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const row = "w-full text-left px-3 py-1.5 text-sm transition-colors";
  const hover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = "var(--surface3)"; },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = "transparent"; },
  };

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Effects"
        className="flex items-center justify-center p-2 rounded-lg transition-colors"
        style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: on ? "var(--accent)" : "var(--text-muted)" }}
        title="Effects: seasonal on or off, and preview them"
      >
        <Icon name="sparkles" className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-lg shadow-xl z-50 py-1"
             style={{ background: "var(--surface2)", border: "1px solid var(--border-light)" }}>
          <button className={`${row} flex items-center justify-between font-semibold`} style={{ color: "var(--text)" }}
            aria-pressed={on} onClick={() => setSeasonal(!on)} {...hover}>
            Seasonal effects
            <span className="text-xs font-bold" style={{ color: on ? "#22c55e" : "var(--text-dim)" }}>{on ? "On" : "Off"}</span>
          </button>
          <div className="px-3 pt-2 pb-1 text-xs" style={{ color: "var(--text-dim)", borderTop: "1px solid var(--border)" }}>Preview</div>
          {PREVIEWS.map(([name, label]) => (
            <button key={name} className={row} style={{ color: "var(--text-secondary)" }} onClick={() => preview(name)} {...hover}>{label}</button>
          ))}
          <button className={row} style={{ color: "var(--text-dim)", borderTop: "1px solid var(--border)" }} onClick={() => preview("stop")} {...hover}>Stop preview</button>
        </div>
      )}
    </div>
  );
}
