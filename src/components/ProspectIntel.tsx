"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

// Per-prospect "cold-call intel" — quick recon Jay fills in so he can see, at a
// glance before dialling, where the pain points are (no Google Business Profile,
// few/no reviews, weak website, etc.). Opened from the dropdown button in the
// "Intel" grid column (right after Stage). Persisted as five reserved custom-field
// values via /api/custom-fields — same KV pattern as custom_called /
// custom_fb_messenger, so no schema/API change is needed.

export type IntelValues = {
  gbp: string;      // "1" yes | "0" no | "" unknown
  fbpage: string;   // "1" yes | "0" no | "" unknown
  greviews: string; // Google review count
  freviews: string; // Facebook review count
  website: string;  // current website URL (for reference on the call)
  webnotes: string; // free-text notes on their current website
};

export const INTEL_FIELDS = {
  gbp: "custom_intel_gbp",
  fbpage: "custom_intel_fbpage",
  greviews: "custom_intel_greviews",
  freviews: "custom_intel_freviews",
  website: "custom_intel_website",
  webnotes: "custom_intel_webnotes",
} as const;

const GOOGLE = "#4285F4";
const FACEBOOK = "#1877F2";

export default function ProspectIntel({
  leadName, anchorRect, values, onSet, onClose,
}: {
  leadName: string;
  anchorRect: DOMRect;
  values: IntelValues;
  onSet: (fieldId: string, value: string) => void;
  onClose: () => void;
}) {
  const [gbp, setGbp] = useState(values.gbp);
  const [fbpage, setFbpage] = useState(values.fbpage);
  const [greviews, setGreviews] = useState(values.greviews);
  const [freviews, setFreviews] = useState(values.freviews);
  const [website, setWebsite] = useState(values.website);
  const [webnotes, setWebnotes] = useState(values.webnotes);

  // saved = last value pushed to the server (so we never re-PUT an unchanged field);
  // latest = current local values, read by the on-close flush to avoid stale closures.
  const saved = useRef<IntelValues>({ ...values });
  const latest = useRef<IntelValues>({ ...values });
  latest.current = { gbp, fbpage, greviews, freviews, website, webnotes };

  const persist = (key: keyof IntelValues, val: string) => {
    if (saved.current[key] === val) return;
    saved.current[key] = val;
    onSet(INTEL_FIELDS[key], val);
  };

  // Flush any dirty field on unmount — covers closing mid-edit (Escape, etc.).
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => () => {
    const l = latest.current;
    (Object.keys(l) as (keyof IntelValues)[]).forEach((k) => persistRef.current(k, l[k]));
  }, []);

  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  // Anchor next to the clicked button; flip/clamp so it stays on-screen.
  const POP_W = 304, POP_H = 452;
  let left = anchorRect.right + 8;
  if (left + POP_W > window.innerWidth - 8) left = anchorRect.left - POP_W - 8;
  if (left < 8) left = 8;
  let top = anchorRect.top - 6;
  if (top + POP_H > window.innerHeight - 8) top = window.innerHeight - POP_H - 8;
  if (top < 8) top = 8;

  const yesNo = (val: string, set: (v: string) => void, key: keyof IntelValues) => (
    <div className="flex gap-1 flex-shrink-0">
      {([["1", "Yes", "#22c55e"], ["0", "No", "#ef4444"]] as const).map(([t, lbl, col]) => {
        const active = val === t;
        return (
          <button key={t} type="button"
            onClick={() => { const next = val === t ? "" : t; set(next); persist(key, next); }}
            className="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
            style={{
              background: active ? col : "var(--surface2)",
              color: active ? "#fff" : "var(--text-muted)",
              border: `1px solid ${active ? col : "var(--border-light)"}`,
            }}>
            {lbl}
          </button>
        );
      })}
    </div>
  );

  const numInput = (val: string, set: (v: string) => void, key: keyof IntelValues) => (
    <input type="number" min="0" placeholder="—" value={val}
      onChange={(e) => set(e.target.value)} onBlur={() => persist(key, latest.current[key])}
      className="w-20 px-2 py-1 text-xs rounded-md text-right"
      style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
  );

  const divider = <div style={{ borderTop: "1px solid var(--surface2)" }} />;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div ref={cardRef} className="fixed z-[60] rounded-xl shadow-2xl"
      style={{ left, top, width: POP_W, background: "var(--surface)", border: "1px solid var(--accent)" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
            <Icon name="phone" className="w-3.5 h-3.5" /> Cold-call Intel
          </div>
          <div className="text-sm font-semibold truncate cf-name" style={{ color: "var(--text)" }}>{leadName}</div>
        </div>
        <button type="button" onClick={onClose} className="p-0.5 rounded flex-shrink-0 transition-colors" style={{ color: "var(--text-dim)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: "var(--text-secondary)" }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: GOOGLE }} /> Google Business Profile
          </span>
          {yesNo(gbp, setGbp, "gbp")}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs pl-3.5" style={{ color: "var(--text-muted)" }}>Google reviews</span>
          {numInput(greviews, setGreviews, "greviews")}
        </div>

        {divider}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: "var(--text-secondary)" }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: FACEBOOK }} /> Business Facebook page
          </span>
          {yesNo(fbpage, setFbpage, "fbpage")}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs pl-3.5" style={{ color: "var(--text-muted)" }}>Facebook reviews</span>
          {numInput(freviews, setFreviews, "freviews")}
        </div>

        {divider}

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Current website</span>
            {website.trim() && (
              <a href={/^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`}
                target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                className="text-[11px] font-semibold hover:underline flex-shrink-0" style={{ color: "var(--accent)" }}>Open ↗</a>
            )}
          </div>
          <input type="text" inputMode="url" value={website}
            placeholder="theircurrentsite.co.uk"
            onChange={(e) => setWebsite(e.target.value)} onBlur={() => persist("website", latest.current.website)}
            className="w-full px-2 py-1.5 text-xs rounded-md cf-name"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
        </div>

        <div>
          <span className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Website notes</span>
          <textarea rows={3} value={webnotes}
            placeholder="Their current site — slow, not mobile-friendly, Wix watermark, dead, or none at all…"
            onChange={(e) => setWebnotes(e.target.value)} onBlur={() => persist("webnotes", latest.current.webnotes)}
            className="w-full px-2 py-1.5 text-xs rounded-md resize-none cf-name"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
        </div>

        <div className="text-[10px] text-right" style={{ color: "var(--text-quaternary)" }}>Saved automatically</div>
      </div>
    </div>,
    document.body
  );
}
