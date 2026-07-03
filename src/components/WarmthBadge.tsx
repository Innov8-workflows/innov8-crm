"use client";

import { memo, useState, useRef, useEffect } from "react";

// How warm a prospect is to closing — a click-to-pick badge in the "Warmth" grid
// column (right after Stage). Stored as the reserved custom_warmth field value, so
// no schema change is needed (same KV pattern as the Intel column). Modelled on
// PipelineBadge; the cell's <td> is given overflow-visible in DraggableRow so the
// dropdown isn't clipped.
const WARMTH = [
  { value: "hot", label: "Hot", color: "#ef4444" },
  { value: "warm", label: "Warm", color: "#f59e0b" },
  { value: "cold", label: "Cold", color: "#3b82f6" },
];

function WarmthBadgeBase({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = WARMTH.find((w) => w.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-80"
        style={cur
          ? { backgroundColor: cur.color + "25", color: cur.color, border: `1px solid ${cur.color}40` }
          : { background: "var(--surface2)", color: "var(--text-dim)", border: "1px solid var(--border-light)" }}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {cur ? cur.label : "—"}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-28 rounded-lg shadow-xl z-50 py-1"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)" }}>
          {WARMTH.map((w) => (
            <button key={w.value}
              className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
              style={{ color: w.value === value ? w.color : "var(--text-secondary)", fontWeight: w.value === value ? 600 : 400 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onClick={() => { onChange(w.value); setOpen(false); }}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
              {w.label}
            </button>
          ))}
          {value && (
            <button className="w-full text-left px-3 py-1.5 text-xs transition-colors" style={{ color: "var(--text-dim)", borderTop: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onClick={() => { onChange(""); setOpen(false); }}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const WarmthBadge = memo(WarmthBadgeBase, (prev, next) => prev.value === next.value);
export default WarmthBadge;
