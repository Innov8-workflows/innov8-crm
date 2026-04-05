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
        className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
        style={{ backgroundColor: stage.color + "20", color: stage.color }}
        onClick={() => setOpen(!open)}
      >
        {stage.label}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          {PIPELINE_STAGES.map((s) => (
            <button
              key={s.value}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2"
              onClick={() => { onChange(s.value); setOpen(false); }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
              {s.value === value && (
                <svg className="w-4 h-4 ml-auto text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
