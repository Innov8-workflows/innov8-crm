"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { CALL_OUTCOMES, type CallLog, type Lead } from "@/types";

// Per-prospect call history — a running track record of every phone call
// (date, whether they picked up, what was discussed). Opened from the "History"
// grid column right after Intel. Rows live in the call_logs table via
// /api/call-logs; the grid's at-a-glance cell reads the bootstrap callRollup,
// kept in sync via onChanged (full post-change list, didLog=true on a new log
// so the grid can auto-tick Called / advance stage).

export default function CallHistory({
  lead, anchorRect, onChanged, onClose,
}: {
  lead: Lead;
  anchorRect: DOMRect;
  onChanged: (calls: CallLog[], didLog: boolean) => void;
  onClose: () => void;
}) {
  const [calls, setCalls] = useState<CallLog[] | null>(null); // null = loading
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [outcome, setOutcome] = useState<CallLog["outcome"]>("answered");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/call-logs?lead_id=${lead.id}`)
      .then((r) => r.json())
      .then((d) => setCalls(d.calls || []))
      .catch(() => setCalls([]));
  }, [lead.id]);

  const logCall = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/call-logs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, called_at: date, outcome, notes: notes.trim() }),
      });
      if (!res.ok) return;
      const log = (await res.json()) as CallLog;
      const next = [log, ...(calls || [])];
      setCalls(next);
      setNotes("");
      onChanged(next, true);
    } finally {
      setSaving(false);
    }
  }, [saving, calls, lead.id, date, outcome, notes, onChanged]);

  const deleteCall = useCallback(async (log: CallLog) => {
    const next = (calls || []).filter((c) => c.id !== log.id);
    setCalls(next);
    onChanged(next, false);
    await fetch(`/api/call-logs?id=${log.id}`, { method: "DELETE" });
  }, [calls, onChanged]);

  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  // Anchor next to the clicked button; flip/clamp so it stays on-screen.
  const POP_W = 320, POP_H = 480;
  let left = anchorRect.right + 8;
  if (left + POP_W > window.innerWidth - 8) left = anchorRect.left - POP_W - 8;
  if (left < 8) left = 8;
  let top = anchorRect.top - 6;
  if (top + POP_H > window.innerHeight - 8) top = window.innerHeight - POP_H - 8;
  if (top < 8) top = 8;

  const fmtDate = (d: string) => {
    const dt = new Date(`${d}T00:00:00`);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const outcomeMeta = (v: string) => CALL_OUTCOMES.find((o) => o.value === v) || CALL_OUTCOMES[0];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div ref={cardRef} className="fixed z-[60] rounded-xl shadow-2xl flex flex-col"
      style={{ left, top, width: POP_W, maxHeight: POP_H, background: "var(--surface)", border: "1px solid var(--accent)" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
            <Icon name="phone" className="w-3.5 h-3.5" /> Call History
          </div>
          <div className="text-sm font-semibold truncate cf-name" style={{ color: "var(--text)" }}>{lead.business_name}</div>
        </div>
        <button type="button" onClick={onClose} className="p-0.5 rounded flex-shrink-0 transition-colors" style={{ color: "var(--text-dim)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Quick-log form */}
      <div className="p-3 space-y-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="px-2 py-1 text-xs rounded-md flex-shrink-0"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none", colorScheme: "dark" }} />
          <div className="flex gap-1 flex-1 justify-end">
            {CALL_OUTCOMES.map((o) => {
              const active = outcome === o.value;
              return (
                <button key={o.value} type="button" onClick={() => setOutcome(o.value)}
                  className="px-2 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap"
                  style={{
                    background: active ? o.color : "var(--surface2)",
                    color: active ? "#fff" : "var(--text-muted)",
                    border: `1px solid ${active ? o.color : "var(--border-light)"}`,
                  }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
        <textarea rows={2} value={notes} placeholder="What was the call about?"
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) logCall(); }}
          className="w-full px-2 py-1.5 text-xs rounded-md resize-none"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
        <button type="button" onClick={logCall} disabled={saving}
          className="w-full py-1.5 text-xs font-semibold rounded-md transition-colors"
          style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Log call"}
        </button>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5" style={{ minHeight: 60 }}>
        {calls === null ? (
          <div className="text-xs text-center py-4" style={{ color: "var(--text-dim)" }}>Loading…</div>
        ) : calls.length === 0 ? (
          <div className="text-xs text-center py-4" style={{ color: "var(--text-quaternary)" }}>No calls logged yet</div>
        ) : (
          calls.map((c) => {
            const meta = outcomeMeta(c.outcome);
            return (
              <div key={c.id} className="rounded-lg px-2.5 py-2 group" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--text)" }}>{fmtDate(c.called_at)}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                      style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55` }}>
                      {meta.label}
                    </span>
                  </div>
                  <button type="button" onClick={() => deleteCall(c)} title="Delete this call log"
                    className="p-0.5 rounded flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--text-dim)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {c.notes && (
                  <div className="text-xs mt-1 whitespace-pre-wrap break-words" style={{ color: "var(--text-secondary)" }}>{c.notes}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );
}
