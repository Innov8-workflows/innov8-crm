"use client";

import { useState, useEffect, useCallback } from "react";
import type { Solution, EntitySolution } from "@/types";
import { SOLUTION_STATUSES, SOLUTION_CATEGORIES } from "@/types";
import Icon from "./Icon";
import { useToast } from "./Toast";

const catColor = (cat: string) => SOLUTION_CATEGORIES.find((c) => c.value === cat)?.color || "var(--text-dim)";

interface ProductPickerProps {
  leadId: number;
  businessName?: string;
  onClose?: () => void;
  // Fires on committed changes (attach / detach / status / amount-blur) with the
  // full set of attached rows, so the grid can refresh its summary and the
  // project modal can write-through projects.monthly_fee.
  onChanged?: (rows: EntitySolution[]) => void;
}

export default function ProductPicker({ leadId, businessName, onClose, onChanged }: ProductPickerProps) {
  const { toast } = useToast();
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [rows, setRows] = useState<Record<number, EntitySolution>>({}); // keyed by solution_id
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/solutions").then((r) => r.json()).catch(() => ({})),
      fetch(`/api/entity-solutions?entity_type=lead&entity_id=${leadId}`).then((r) => r.json()).catch(() => ({})),
    ]).then(([sols, es]) => {
      if (cancelled) return;
      setSolutions(sols.solutions || []);
      const map: Record<number, EntitySolution> = {};
      for (const r of (es.entity_solutions || []) as EntitySolution[]) map[r.solution_id] = r;
      setRows(map);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [leadId]);

  const emit = useCallback((next: Record<number, EntitySolution>) => {
    onChanged?.(Object.values(next));
  }, [onChanged]);

  const attach = async (sol: Solution) => {
    const optimistic: EntitySolution = {
      id: -1, entity_type: "lead", entity_id: leadId, solution_id: sol.id,
      status: "sold", upfront_charged: sol.upfront_price, monthly_upcharge: sol.monthly_price,
      notes: "", proposed_at: "", sold_at: "", delivered_at: "", created_at: "", updated_at: "",
    };
    const next = { ...rows, [sol.id]: optimistic };
    setRows(next); emit(next);
    try {
      const res = await fetch("/api/entity-solutions", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "lead", entity_id: leadId, solution_id: sol.id, status: "sold" }),
      });
      const data = await res.json();
      if (data.entity_solution) {
        setRows((prev) => { const n = { ...prev, [sol.id]: data.entity_solution }; emit(n); return n; });
      }
    } catch {
      toast("Couldn't add product", "error");
      setRows((prev) => { const n = { ...prev }; delete n[sol.id]; emit(n); return n; });
    }
  };

  const detach = async (sol: Solution) => {
    const row = rows[sol.id];
    const next = { ...rows }; delete next[sol.id];
    setRows(next); emit(next);
    if (!row || row.id < 0) return;
    try {
      await fetch(`/api/entity-solutions?id=${row.id}`, { method: "DELETE" });
    } catch {
      toast("Couldn't remove product", "error");
      setRows((prev) => { const n = { ...prev, [sol.id]: row }; emit(n); return n; });
    }
  };

  // PUT the current row (status + amounts). Used by status changes and amount blur.
  const save = useCallback(async (sol: Solution, row: EntitySolution, doEmit: boolean) => {
    if (doEmit) setRows((prev) => { const n = { ...prev, [sol.id]: row }; emit(n); return n; });
    try {
      await fetch("/api/entity-solutions", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: "lead", entity_id: leadId, solution_id: sol.id,
          status: row.status, monthly_upcharge: row.monthly_upcharge, upfront_charged: row.upfront_charged,
        }),
      });
    } catch { toast("Update failed", "error"); }
  }, [leadId, emit, toast]);

  // Local-only amount edit (keystrokes) — no PUT/emit until blur.
  const setAmountLocal = (solId: number, field: "monthly_upcharge" | "upfront_charged", v: string) => {
    setRows((prev) => prev[solId] ? { ...prev, [solId]: { ...prev[solId], [field]: Number(v) || 0 } } : prev);
  };

  const attached = Object.values(rows).filter((r) => r.status !== "declined");
  const totalMonthly = attached.reduce((s, r) => s + (Number(r.monthly_upcharge) || 0), 0);
  const totalUpfront = attached.reduce((s, r) => s + (Number(r.upfront_charged) || 0), 0);

  return (
    <div className="flex flex-col" style={{ maxHeight: "70vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="currency-pound" className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>Products</p>
            {businessName && <p className="text-[11px] truncate" style={{ color: "var(--text-dim)" }}>{businessName}</p>}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded" style={{ color: "var(--text-muted)" }}><Icon name="x-mark" className="w-5 h-5" /></button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {loading ? (
          <p className="text-sm text-center py-6" style={{ color: "var(--text-dim)" }}>Loading…</p>
        ) : solutions.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "var(--text-dim)" }}>No products in the catalogue.</p>
        ) : solutions.map((sol) => {
          const row = rows[sol.id];
          const on = !!row;
          return (
            <div key={sol.id} className="rounded-lg p-2" style={{ background: on ? "var(--surface2)" : "transparent", border: `1px solid ${on ? "var(--border-light)" : "transparent"}` }}>
              <div className="flex items-center gap-2">
                <button onClick={() => (on ? detach(sol) : attach(sol))} aria-label={on ? "Remove" : "Add"}
                  className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center transition-colors"
                  style={{ background: on ? "var(--accent)" : "transparent", border: `1.5px solid ${on ? "var(--accent)" : "var(--border-light)"}` }}>
                  {on && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} style={{ color: "#fff" }} />}
                </button>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: catColor(sol.category) }} />
                <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: on ? "var(--text)" : "var(--text-secondary)" }}>{sol.name}</span>
                {!on && (
                  <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-dim)" }}>
                    {sol.monthly_price > 0 && `£${sol.monthly_price}/mo`}{sol.monthly_price > 0 && sol.upfront_price > 0 && " · "}{sol.upfront_price > 0 && `£${sol.upfront_price}`}
                  </span>
                )}
              </div>

              {on && (
                <div className="flex items-center gap-2 mt-2 pl-7 flex-wrap">
                  <select value={row.status}
                    onChange={(e) => save(sol, { ...row, status: e.target.value as EntitySolution["status"] }, true)}
                    className="text-xs rounded px-1.5 py-1 cursor-pointer"
                    style={{ background: "var(--surface3)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }}>
                    {SOLUTION_STATUSES.map((s) => <option key={s.value} value={s.value} style={{ background: "var(--surface2)" }}>{s.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-dim)" }}>£
                    <input type="number" value={row.monthly_upcharge}
                      onChange={(e) => setAmountLocal(sol.id, "monthly_upcharge", e.target.value)}
                      onBlur={() => save(sol, rows[sol.id], true)}
                      className="w-14 text-xs rounded px-1.5 py-1" style={{ background: "var(--surface3)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
                    /mo
                  </label>
                  <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-dim)" }}>£
                    <input type="number" value={row.upfront_charged}
                      onChange={(e) => setAmountLocal(sol.id, "upfront_charged", e.target.value)}
                      onBlur={() => save(sol, rows[sol.id], true)}
                      className="w-14 text-xs rounded px-1.5 py-1" style={{ background: "var(--surface3)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
                    once
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer totals */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--border)", background: "var(--stats-bg)" }}>
        <div className="flex items-center gap-4 text-sm">
          <span style={{ color: "var(--text-dim)" }}>Monthly <span className="font-bold" style={{ color: "#22c55e" }}>£{totalMonthly}</span></span>
          <span style={{ color: "var(--text-dim)" }}>One-off <span className="font-bold" style={{ color: "var(--accent)" }}>£{totalUpfront}</span></span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--accent)", color: "#fff" }}>Done</button>
        )}
      </div>
    </div>
  );
}
