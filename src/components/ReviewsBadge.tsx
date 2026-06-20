"use client";

import { useState } from "react";

// Manually-maintained Google + Facebook review stats (rating + count), shown as
// two chips on the project/client cards and edited inline. Sibling to SetupPills.
// Meta blocks reading FB review counts via API, so these are kept up to date by
// hand — click the row to edit all four numbers at once.
const GOOGLE = "#4285F4";
const FACEBOOK = "#1877F2";
const STAR = "#f59e0b";

export type ReviewValues = {
  google_rating?: number;
  google_review_count?: number;
  facebook_rating?: number;
  facebook_review_count?: number;
};

export default function ReviewsBadge({ values, onSave }: {
  values: ReviewValues;
  onSave: (fields: ReviewValues) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [gr, setGr] = useState("");
  const [gc, setGc] = useState("");
  const [fr, setFr] = useState("");
  const [fc, setFc] = useState("");

  const gRating = values.google_rating || 0;
  const gCount = values.google_review_count || 0;
  const fRating = values.facebook_rating || 0;
  const fCount = values.facebook_review_count || 0;

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGr(gRating ? String(gRating) : "");
    setGc(gCount ? String(gCount) : "");
    setFr(fRating ? String(fRating) : "");
    setFc(fCount ? String(fCount) : "");
    setEditing(true);
  };

  const save = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave({
      google_rating: Math.min(5, Math.max(0, parseFloat(gr) || 0)),
      google_review_count: Math.max(0, Math.round(parseFloat(gc) || 0)),
      facebook_rating: Math.min(5, Math.max(0, parseFloat(fr) || 0)),
      facebook_review_count: Math.max(0, Math.round(parseFloat(fc) || 0)),
    });
    setEditing(false);
  };

  if (editing) {
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    const inputStyle = { background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" } as const;
    const row = (color: string, label: string, ratingVal: string, setRating: (v: string) => void, countVal: string, setCount: (v: string) => void) => (
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-[10px] font-semibold w-14 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <input value={ratingVal} onChange={(e) => setRating(e.target.value)} type="number" step="0.1" min="0" max="5" placeholder="4.8"
          className="w-12 px-1.5 py-1 text-xs rounded" style={inputStyle} />
        <span className="text-[10px]" style={{ color: STAR }}>★</span>
        <input value={countVal} onChange={(e) => setCount(e.target.value)} type="number" min="0" placeholder="47"
          className="flex-1 min-w-0 px-1.5 py-1 text-xs rounded" style={inputStyle} />
        <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>reviews</span>
      </div>
    );
    return (
      <div className="mt-2 rounded-lg p-2 space-y-1.5" style={{ background: "var(--surface)", border: "1px solid var(--accent)" }}
        onClick={stop} onMouseDown={stop}>
        {row(GOOGLE, "Google", gr, setGr, gc, setGc)}
        {row(FACEBOOK, "Facebook", fr, setFr, fc, setFc)}
        <div className="flex items-center justify-end gap-2 pt-0.5">
          <button onClick={(e) => { e.stopPropagation(); setEditing(false); }} className="text-[11px] px-2 py-1 rounded" style={{ color: "var(--text-dim)" }}>Cancel</button>
          <button onClick={save} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "var(--accent)", color: "#fff" }}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={startEdit} onMouseDown={(e) => e.stopPropagation()} title="Edit Google / Facebook review counts"
      className="flex flex-wrap items-center gap-1.5 mt-2 w-full text-left hover:opacity-80 transition-opacity">
      <ReviewChip color={GOOGLE} label="Google" rating={gRating} count={gCount} />
      <ReviewChip color={FACEBOOK} label="Facebook" rating={fRating} count={fCount} />
    </button>
  );
}

function ReviewChip({ color, label, rating, count }: { color: string; label: string; rating: number; count: number }) {
  const set = rating > 0 || count > 0;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{ background: "var(--surface2)", color: set ? "var(--text-secondary)" : "var(--text-dim)" }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
      <span style={{ color: STAR }}>★</span>
      {set ? rating.toFixed(1) : "–"}
      <span style={{ color: "var(--text-quaternary)" }}>({set ? count : "–"})</span>
    </span>
  );
}
