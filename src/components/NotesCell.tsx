"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

// Notes cell for the prospects grid. The grid rows are a fixed single line (for
// virtualization), so a long note either truncates or forces the column super wide.
// Instead the cell shows a truncated preview and opens a compact multi-line editor
// popover on click — read + write the whole note without stretching the column.
// Autosaves (on blur + on close), mirroring the ProspectIntel popover pattern.

export default function NotesCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const openBox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cellRef.current) setRect(cellRef.current.getBoundingClientRect());
    setOpen(true);
  };

  return (
    <>
      <div
        ref={cellRef}
        className="px-2 py-1 cursor-pointer min-h-[28px] rounded truncate transition-colors"
        style={{ color: value ? "var(--text)" : "var(--text-tertiary)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(234,88,12,0.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        onClick={openBox}
        title={value || "Click to add a note"}
      >
        {value || "+ Note"}
      </div>
      {open && rect && (
        <NotesPopover anchorRect={rect} value={value} onSave={onSave} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function NotesPopover({ anchorRect, value, onSave, onClose }: {
  anchorRect: DOMRect;
  value: string;
  onSave: (v: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value);
  const savedRef = useRef(value);   // last value pushed to the server
  const latestRef = useRef(value);  // current local text (read by flush)
  latestRef.current = text;
  const cardRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const persist = () => {
    if (savedRef.current === latestRef.current) return;
    savedRef.current = latestRef.current;
    onSave(latestRef.current);
  };

  useEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }, []);

  // Flush any unsaved edit on unmount (covers Escape / outside-click close).
  useEffect(() => () => { if (savedRef.current !== latestRef.current) onSave(latestRef.current); }, [onSave]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  // Anchor below the cell; flip up / clamp so it stays on-screen.
  const POP_W = 400, POP_H = 250;
  let left = anchorRect.left - 4;
  if (left + POP_W > window.innerWidth - 8) left = window.innerWidth - POP_W - 8;
  if (left < 8) left = 8;
  let top = anchorRect.bottom + 4;
  if (top + POP_H > window.innerHeight - 8) top = anchorRect.top - POP_H - 4;
  if (top < 8) top = 8;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div ref={cardRef} className="fixed z-[60] rounded-xl shadow-2xl"
      style={{ left, top, width: POP_W, background: "var(--surface)", border: "1px solid var(--accent)" }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Notes</span>
        <button type="button" onClick={onClose} className="p-0.5 rounded transition-colors" style={{ color: "var(--text-dim)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-3">
        <textarea ref={taRef} rows={9} value={text}
          placeholder="Add notes about this lead…"
          onChange={(e) => setText(e.target.value)} onBlur={persist}
          className="w-full px-2.5 py-2 text-sm rounded-md resize-y leading-relaxed"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none", minHeight: 150 }} />
        <div className="text-[10px] text-right mt-1" style={{ color: "var(--text-quaternary)" }}>Saved automatically</div>
      </div>
    </div>,
    document.body
  );
}
