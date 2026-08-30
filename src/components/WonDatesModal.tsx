"use client";

import { useCallback, useEffect, useState } from "react";
import { isValidDate } from "@/lib/dateRange";

// The one-sitting chore: correct the won dates that were backfilled from
// date(created_at). That guess is right for most clients and wrong for any created
// by hand or by import, and every historical revenue figure depends on it.
//
// Saves on BLUR, one PUT per field, through the existing whitelisted
// PUT /api/projects/[id]. No batch endpoint and no unsaved-changes machinery — 20
// sequential PUTs behind a "Save all" would be 2-6s of round-trips for a chore that
// should feel like filling in a form.

interface Row {
  project_id: number;
  business_name: string;
  won_at: string;
  lost_at: string;
  client_status: string;
  suggested_won_at: string;
  monthly: number;
}

export default function WonDatesModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/revenue/won-dates").then((r) => r.json());
      setRows(d.clients || []);
    } catch { setError("Couldn't load clients"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (row: Row, field: "won_at" | "lost_at", value: string) => {
    if (value !== "" && !isValidDate(value)) return;
    setSavingId(row.project_id);
    setError("");
    try {
      const res = await fetch(`/api/projects/${row.project_id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(`${row.business_name}: ${b.error || "save failed"}`);
        await load();                       // snap back to the server's truth
      } else {
        setDirty(true);
      }
    } catch { setError(`${row.business_name}: save failed`); }
    setSavingId(null);
  };

  const patch = (id: number, field: "won_at" | "lost_at", value: string) =>
    setRows((prev) => prev.map((r) => (r.project_id === id ? { ...r, [field]: value } : r)));

  const cell = {
    background: "var(--surface)", border: "1px solid var(--border-light)",
    color: "var(--text)", outline: "none", colorScheme: "dark" as const,
  };

  const close = () => { if (dirty) onSaved(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }} onClick={close}>
      <div className="rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}>

        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Client won dates</h2>
            <button onClick={close} style={{ color: "var(--text-dim)" }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Every historical revenue figure is dated from these. They were guessed from when each
            project row was created — correct the ones that are wrong. Saves as you go.
          </p>
        </div>

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg text-xs"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171" }}>
            {error}
          </div>
        )}

        <div className="overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="text-sm py-8 text-center" style={{ color: "var(--text-quaternary)" }}>Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-dim)" }}>
                  <th className="text-left font-normal text-xs pb-2">Client</th>
                  <th className="text-left font-normal text-xs pb-2 w-[140px]">Won</th>
                  <th className="text-left font-normal text-xs pb-2 w-[110px]">Guess</th>
                  <th className="text-left font-normal text-xs pb-2 w-[140px]">Churned</th>
                  <th className="text-right font-normal text-xs pb-2 w-[80px]">MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                {rows.map((r) => (
                  <tr key={r.project_id} style={{ opacity: savingId === r.project_id ? 0.5 : 1 }}>
                    <td className="py-2 pr-3 cf-name" style={{ color: "var(--text)" }}>
                      {r.business_name}
                      {r.client_status === "lost" && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "var(--surface2)", color: "var(--text-quaternary)" }}>lost</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <input type="date" value={r.won_at} max={today}
                        onChange={(e) => patch(r.project_id, "won_at", e.target.value)}
                        onBlur={(e) => save(r, "won_at", e.target.value)}
                        className="px-2 py-1 text-xs rounded-md w-full" style={cell} />
                    </td>
                    <td className="py-2 pr-3">
                      {r.suggested_won_at && r.suggested_won_at !== r.won_at ? (
                        <button
                          onClick={() => { patch(r.project_id, "won_at", r.suggested_won_at); save(r, "won_at", r.suggested_won_at); }}
                          title="Use this guess"
                          className="text-xs underline" style={{ color: "var(--text-quaternary)" }}>
                          {r.suggested_won_at}
                        </button>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-quaternary)" }}>—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {/* Churn was never recorded historically, so this is blank for
                          everyone lost before tracking began. Editable so it can be
                          filled in from memory where it matters. */}
                      {r.client_status === "lost" ? (
                        <input type="date" value={r.lost_at} max={today}
                          onChange={(e) => patch(r.project_id, "lost_at", e.target.value)}
                          onBlur={(e) => save(r, "lost_at", e.target.value)}
                          className="px-2 py-1 text-xs rounded-md w-full" style={cell} />
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-quaternary)" }}>—</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {r.monthly ? `£${r.monthly.toFixed(0)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--text-quaternary)" }}>
            {rows.length} clients · saved automatically
          </span>
          <button onClick={close} className="px-4 py-1.5 text-sm font-semibold rounded-md"
            style={{ background: "var(--accent)", color: "#fff" }}>Done</button>
        </div>
      </div>
    </div>
  );
}
