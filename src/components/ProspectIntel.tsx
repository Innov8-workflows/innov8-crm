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
  seoscore: string; // their site's SEO rating out of 10 ("" = not scored)
};

export const INTEL_FIELDS = {
  gbp: "custom_intel_gbp",
  fbpage: "custom_intel_fbpage",
  greviews: "custom_intel_greviews",
  freviews: "custom_intel_freviews",
  website: "custom_intel_website",
  webnotes: "custom_intel_webnotes",
  seoscore: "custom_intel_seoscore",
} as const;

const GOOGLE = "#4285F4";
const FACEBOOK = "#1877F2";

// Attached SEO reports live in their own table (lead_seo_reports), not in the
// custom-field KV — that KV is shipped for every lead on app load, so a few
// multi-MB PDFs in it would be paid for on every page view.
interface LeadReport {
  id: number;
  report_name: string;
  report_type: string;
  report_url: string;
  is_file: number;
}

// Low score = big pain point = better pitch, so red is the "good news" end here.
export function seoScoreColour(score: number): string {
  if (score <= 3) return "#ef4444";
  if (score <= 6) return "#f59e0b";
  return "#22c55e";
}

export default function ProspectIntel({
  leadId, leadName, anchorRect, values, onSet, onClose,
}: {
  leadId: number;
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
  const [seoscore, setSeoscore] = useState(values.seoscore);

  // saved = last value pushed to the server (so we never re-PUT an unchanged field);
  // latest = current local values, read by the on-close flush to avoid stale closures.
  const saved = useRef<IntelValues>({ ...values });
  const latest = useRef<IntelValues>({ ...values });
  latest.current = { gbp, fbpage, greviews, freviews, website, webnotes, seoscore };

  // Attached reports — fetched on open (they're not part of the custom-field
  // payload the grid already holds).
  const [reports, setReports] = useState<LeadReport[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${leadId}/seo-report`)
      .then((r) => r.json())
      .then((d) => { if (alive) setReports(d.reports || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [leadId]);

  const uploadReport = async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/leads/${leadId}/seo-report`, { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setReports((prev) => [d, ...prev]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeReport = async (id: number) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/leads/${leadId}/seo-report?report_id=${id}`, { method: "DELETE" }).catch(() => {});
  };

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

  // Anchor next to the clicked button; flip/clamp so it stays on-screen. The
  // popover grew past a short viewport once the SEO sections were added, so the
  // body scrolls internally rather than the card running off the bottom.
  const POP_W = 304, POP_H = 620;
  const maxH = Math.min(POP_H, window.innerHeight - 16);
  let left = anchorRect.right + 8;
  if (left + POP_W > window.innerWidth - 8) left = anchorRect.left - POP_W - 8;
  if (left < 8) left = 8;
  let top = anchorRect.top - 6;
  if (top + maxH > window.innerHeight - 8) top = window.innerHeight - maxH - 8;
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
    <div ref={cardRef} className="fixed z-[60] rounded-xl shadow-2xl flex flex-col"
      style={{ left, top, width: POP_W, maxHeight: maxH, background: "var(--surface)", border: "1px solid var(--accent)" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
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
      <div className="p-3 space-y-2.5 overflow-y-auto flex-1 min-h-0">
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

        {divider}

        {/* SEO score out of 10 — a low score is the pitch, so the scale runs
            red (big opportunity) → green (already strong). */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>SEO rating</span>
            <span className="text-xs font-bold tabular-nums"
              style={{ color: seoscore === "" ? "var(--text-quaternary)" : seoScoreColour(Number(seoscore)) }}>
              {seoscore === "" ? "—" : `${seoscore}/10`}
            </span>
          </div>
          <div className="flex gap-[3px]">
            {Array.from({ length: 11 }, (_, n) => {
              const active = seoscore !== "" && Number(seoscore) === n;
              return (
                <button key={n} type="button"
                  title={`${n} out of 10`}
                  onClick={() => {
                    // Click the active number again to clear back to "not scored".
                    const next = active ? "" : String(n);
                    setSeoscore(next);
                    persist("seoscore", next);
                  }}
                  className="flex-1 text-[10px] font-bold rounded transition-colors"
                  style={{
                    height: 22,
                    background: active ? seoScoreColour(n) : "var(--surface2)",
                    color: active ? "#fff" : "var(--text-quaternary)",
                    border: `1px solid ${active ? seoScoreColour(n) : "var(--border-light)"}`,
                  }}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {divider}

        {/* SEO report — PDF (or image) upload, opened lazily via ?file= */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>SEO report</span>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors"
              style={{
                background: "var(--accent-subtle)", border: "1px solid var(--accent)",
                color: "var(--accent)", opacity: uploading ? 0.6 : 1,
              }}>
              {uploading ? "Uploading…" : "+ Attach PDF"}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReport(f); }} />

          {uploadError && (
            <div className="text-[10px] mb-1.5 px-2 py-1 rounded"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
              {uploadError}
            </div>
          )}

          {reports.length === 0 ? (
            <p className="text-[10px]" style={{ color: "var(--text-quaternary)" }}>
              No report attached. Upload their audit to pull pain points from on the call.
            </p>
          ) : (
            <div className="space-y-1">
              {reports.map((r) => (
                <div key={r.id} className="group flex items-center gap-1.5 px-2 py-1 rounded-md"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                  <a
                    href={r.is_file ? `/api/leads/${leadId}/seo-report?file=${r.id}` : r.report_url}
                    target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={r.report_name}
                    className="flex-1 min-w-0 text-[11px] truncate hover:underline"
                    style={{ color: "var(--accent)" }}>
                    {r.report_name}
                  </a>
                  <button type="button" onClick={() => removeReport(r.id)} title="Remove"
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--text-dim)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-[10px] text-right" style={{ color: "var(--text-quaternary)" }}>Saved automatically</div>
      </div>
    </div>,
    document.body
  );
}
