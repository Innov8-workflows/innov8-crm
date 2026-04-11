"use client";

import { useState, useRef, useEffect } from "react";
import { PIPELINE_STAGES } from "@/types";

interface PipelineBadgeProps {
  value: string;
  onChange: (value: string) => void;
}

export default function PipelineBadge({ value, onChange }: PipelineBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const stage = PIPELINE_STAGES.find((s) => s.value === value) || PIPELINE_STAGES[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-80"
        style={{ backgroundColor: stage.color + "25", color: stage.color, border: `1px solid ${stage.color}30` }}
        onClick={() => setOpen(!open)}
      >
        {stage.label}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-40 rounded-lg shadow-xl z-50 py-1"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)" }}>
          {PIPELINE_STAGES.map((s) => (
            <button key={s.value}
              className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors"
              style={{ color: s.value === value ? s.color : "var(--text-secondary)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface3)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              onClick={() => { onChange(s.value); setOpen(false); }}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
