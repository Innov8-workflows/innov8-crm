"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Solution, EntitySolution } from "@/types";
import { SOLUTION_STATUSES, SOLUTION_CATEGORIES } from "@/types";
import LoadingAI from "./LoadingAI";
import { useToast } from "./Toast";

type SubView = "catalogue" | "matrix" | "stats";

interface MatrixRow {
  entity_type: "lead" | "project";
  entity_id: number;
  business_name: string;
  solutions: Record<number, EntitySolution>; // keyed by solution_id
}

interface Stats {
  total: number;
  proposed: number;
  sold: number;
  delivered: number;
  declined: number;
  mrr: number;
  one_off_revenue: number;
  per_solution: Array<{
    id: number;
    name: string;
    proposed: number;
    sold: number;
    delivered: number;
    declined: number;
    total: number;
    conversion_pct: number;
  }>;
}

const TRADE_OPTIONS = ["Plumbing", "Electrician", "Driveway", "Builder", "Roofer", "Beauty", "Hairdresser", "Dog Groomer", "Personal Trainer", "Photographer", "LinkedIn SME", "Other"];

export default function AISolutions() {
  const [subView, setSubView] = useState<SubView>("catalogue");
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSolution, setEditingSolution] = useState<Solution | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const fetchSolutions = useCallback(async () => {
    const r = await fetch("/api/solutions");
    const d = await r.json();
    setSolutions(d.solutions || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSolutions(); }, [fetchSolutions]);

  if (loading) return <LoadingAI message="Loading AI Solutions" />;

  return (
    <div className="flex-1 overflow-auto">
      {/* Sub-nav */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-lg font-bold mr-4" style={{ color: "var(--text)" }}>🤖 AI Solutions</h1>
        <SubNavBtn active={subView === "catalogue"} onClick={() => setSubView("catalogue")}>Catalogue</SubNavBtn>
        <SubNavBtn active={subView === "matrix"} onClick={() => setSubView("matrix")}>Matrix</SubNavBtn>
        <SubNavBtn active={subView === "stats"} onClick={() => setSubView("stats")}>Stats</SubNavBtn>
        <div className="ml-auto">
          {subView === "catalogue" && (
            <button
              onClick={() => setShowNewModal(true)}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              + New Solution
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {subView === "catalogue" && (
        <CatalogueView solutions={solutions} onEdit={setEditingSolution} onRefresh={fetchSolutions} />
      )}
      {subView === "matrix" && <MatrixView solutions={solutions} />}
      {subView === "stats" && <StatsView solutions={solutions} />}

      {/* Modals */}
      {(showNewModal || editingSolution) && (
        <SolutionEditModal
          solution={editingSolution}
          onClose={() => { setShowNewModal(false); setEditingSolution(null); }}
          onSaved={() => { fetchSolutions(); setShowNewModal(false); setEditingSolution(null); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-nav button
// ─────────────────────────────────────────────────────────────────
function SubNavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
      style={{
        background: active ? "var(--accent)" : "var(--surface2)",
        color: active ? "#fff" : "var(--text-secondary)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// Catalogue View
// ─────────────────────────────────────────────────────────────────
function CatalogueView({ solutions, onEdit, onRefresh }: { solutions: Solution[]; onEdit: (s: Solution) => void; onRefresh: () => void }) {
  const { toast } = useToast();

  const handleDelete = async (s: Solution) => {
    if (!confirm(`Delete "${s.name}"? This will hide it from the catalogue but keep historical sales records intact.`)) return;
    await fetch(`/api/solutions/${s.id}`, { method: "DELETE" });
    toast(`Deleted ${s.name}`, "success");
    onRefresh();
  };

  if (solutions.length === 0) {
    return (
      <div className="p-12 text-center" style={{ color: "var(--text-dim)" }}>
        <div className="text-4xl mb-2">🤖</div>
        <p className="mb-4">No solutions in the catalogue yet.</p>
        <p className="text-sm">Click &ldquo;+ New Solution&rdquo; to add your first one.</p>
      </div>
    );
  }

  return (
    <div className="p-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {solutions.map((s) => {
        const cat = SOLUTION_CATEGORIES.find((c) => c.value === s.category);
        const trades = (s.target_trades || "").split(",").filter(Boolean);
        return (
          <div key={s.id} className="rounded-xl p-4 flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>{s.name}</h3>
              {cat && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: `${cat.color}25`, color: cat.color }}>{cat.label}</span>
              )}
            </div>
            <p className="text-xs mb-3 flex-1" style={{ color: "var(--text-secondary)" }}>{s.description}</p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-lg p-2 text-center" style={{ background: "var(--surface2)" }}>
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Upfront</div>
                <div className="text-lg font-bold" style={{ color: "var(--text)" }}>£{s.upfront_price}</div>
              </div>
              <div className="rounded-lg p-2 text-center" style={{ background: "var(--surface2)" }}>
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Monthly</div>
                <div className="text-lg font-bold" style={{ color: "#22c55e" }}>£{s.monthly_price}</div>
              </div>
            </div>

            {s.pitch_angle && (
              <div className="text-xs mb-3 italic p-2 rounded-lg" style={{ background: "var(--accent-subtle)", color: "var(--text)" }}>
                💬 {s.pitch_angle}
              </div>
            )}

            {trades.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {trades.map((t) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>{t}</span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>{s.install_days} day{s.install_days === 1 ? "" : "s"} install</span>
              <div className="flex gap-1">
                <button onClick={() => onEdit(s)} className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ background: "var(--surface2)", color: "var(--text-secondary)" }}>Edit</button>
                <button onClick={() => handleDelete(s)} className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ background: "var(--surface2)", color: "#ef4444" }}>Delete</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Edit / New solution modal
// ─────────────────────────────────────────────────────────────────
function SolutionEditModal({ solution, onClose, onSaved }: { solution: Solution | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: solution?.name || "",
    description: solution?.description || "",
    category: solution?.category || "ai",
    target_trades: solution?.target_trades || "",
    upfront_price: solution?.upfront_price || 0,
    monthly_price: solution?.monthly_price || 0,
    install_days: solution?.install_days || 0,
    pitch_angle: solution?.pitch_angle || "",
  });
  const [saving, setSaving] = useState(false);

  const trades = useMemo(() => new Set((form.target_trades || "").split(",").filter(Boolean)), [form.target_trades]);

  const toggleTrade = (t: string) => {
    const next = new Set(trades);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setForm({ ...form, target_trades: Array.from(next).join(",") });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast("Name is required", "error");
      return;
    }
    setSaving(true);
    try {
      if (solution) {
        await fetch(`/api/solutions/${solution.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        toast(`Updated ${form.name}`, "success");
      } else {
        await fetch("/api/solutions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        toast(`Created ${form.name}`, "success");
      }
      onSaved();
    } catch {
      toast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-2xl rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)", maxHeight: "90vh" }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>
            {solution ? "Edit Solution" : "New Solution"}
          </h2>
          <button onClick={onClose} className="text-sm px-2 py-1 rounded" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>
        <div className="p-5 overflow-auto space-y-4" style={{ maxHeight: "calc(90vh - 120px)" }}>
          <Field label="Name">
            <input className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. AI Voice Receptionist" />
          </Field>
          <Field label="Description">
            <textarea rows={2} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Category">
            <select className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {SOLUTION_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Upfront (£)">
              <input type="number" min="0" step="1" className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} value={form.upfront_price} onChange={(e) => setForm({ ...form, upfront_price: Number(e.target.value) })} />
            </Field>
            <Field label="Monthly (£)">
              <input type="number" min="0" step="1" className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} value={form.monthly_price} onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })} />
            </Field>
            <Field label="Install days">
              <input type="number" min="0" step="1" className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} value={form.install_days} onChange={(e) => setForm({ ...form, install_days: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Pitch angle (1-line elevator)">
            <input className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} value={form.pitch_angle} onChange={(e) => setForm({ ...form, pitch_angle: e.target.value })} placeholder="When to suggest this and why" />
          </Field>
          <Field label="Target trades (leave empty = all)">
            <div className="flex flex-wrap gap-1.5">
              {TRADE_OPTIONS.map((t) => {
                const active = trades.has(t);
                return (
                  <button key={t} type="button" onClick={() => toggleTrade(t)}
                    className="text-xs px-2 py-1 rounded-full transition-colors"
                    style={{
                      background: active ? "var(--accent)" : "var(--surface2)",
                      color: active ? "#fff" : "var(--text-muted)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--surface2)", color: "var(--text-secondary)" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: "var(--text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Matrix View — entities × solutions, click to cycle status
// ─────────────────────────────────────────────────────────────────
type EntityFilter = "all" | "lead" | "project";

function MatrixView({ solutions }: { solutions: Solution[] }) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<EntityFilter>("all");
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    // Fetch the matrix data + entity list (so we show empty rows for entities with no solutions)
    const [esRes, leadsRes, projsRes] = await Promise.all([
      fetch("/api/entity-solutions?view=matrix").then((r) => r.json()),
      fetch("/api/leads").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
    ]);

    const entities = new Map<string, MatrixRow>();
    for (const lead of leadsRes.leads || []) {
      const key = `lead:${lead.id}`;
      entities.set(key, { entity_type: "lead", entity_id: lead.id, business_name: lead.business_name, solutions: {} });
    }
    for (const proj of projsRes.projects || []) {
      const key = `project:${proj.id}`;
      entities.set(key, { entity_type: "project", entity_id: proj.id, business_name: proj.business_name, solutions: {} });
    }

    for (const es of esRes.entity_solutions || []) {
      const key = `${es.entity_type}:${es.entity_id}`;
      const row = entities.get(key);
      if (row) row.solutions[es.solution_id] = es;
    }

    setMatrixRows(Array.from(entities.values()));
    setLoading(false);
  }, []);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

  const filtered = useMemo(() => {
    return matrixRows.filter((r) => {
      if (filter !== "all" && r.entity_type !== filter) return false;
      if (search && !r.business_name?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [matrixRows, filter, search]);

  const cycleStatus = async (row: MatrixRow, solution: Solution) => {
    const existing = row.solutions[solution.id];
    const order: Array<EntitySolution["status"] | null> = [null, "proposed", "sold", "delivered"];
    const idx = existing ? order.indexOf(existing.status) : 0;
    const nextStatus = order[(idx + 1) % order.length];

    if (nextStatus === null) {
      // Remove
      if (existing) {
        await fetch(`/api/entity-solutions?id=${existing.id}`, { method: "DELETE" });
      }
    } else {
      await fetch("/api/entity-solutions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          solution_id: solution.id,
          status: nextStatus,
        }),
      });
    }
    toast(`${row.business_name}: ${solution.name} → ${nextStatus || "removed"}`, "info");
    fetchMatrix();
  };

  if (loading) return <LoadingAI message="Building matrix" />;

  return (
    <div className="p-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1">
          {(["all", "lead", "project"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: filter === f ? "var(--accent)" : "var(--surface2)",
                color: filter === f ? "#fff" : "var(--text-secondary)",
                border: `1px solid ${filter === f ? "var(--accent)" : "var(--border)"}`,
              }}>
              {f === "all" ? "All" : f === "lead" ? "Prospects" : "Live Clients"}
            </button>
          ))}
        </div>
        <input
          placeholder="Search business name…"
          className="text-sm px-3 py-1.5 rounded-lg"
          style={{ ...inputStyle, minWidth: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          {filtered.length} {filter === "all" ? "businesses" : filter === "lead" ? "prospects" : "clients"}
        </span>
        <div className="ml-auto text-xs flex items-center gap-3" style={{ color: "var(--text-dim)" }}>
          <span>Click cells to cycle status:</span>
          {SOLUTION_STATUSES.map((s) => (
            <span key={s.value} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Matrix table */}
      <div className="overflow-auto rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)", maxHeight: "calc(100vh - 240px)" }}>
        <table className="text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead className="sticky top-0 z-10" style={{ background: "var(--surface2)" }}>
            <tr>
              <th className="text-left px-3 py-2 sticky left-0 z-20" style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", minWidth: 200 }}>
                Business
              </th>
              {solutions.map((s) => (
                <th key={s.id} className="text-center px-2 py-2 text-xs" title={s.name}
                  style={{ borderBottom: "1px solid var(--border)", minWidth: 90, color: "var(--text-secondary)" }}>
                  {s.name.length > 18 ? s.name.slice(0, 16) + "…" : s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={`${row.entity_type}:${row.entity_id}`} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-3 py-2 sticky left-0" style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <span style={{ color: "var(--text)" }}>{row.business_name || "(unnamed)"}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        background: row.entity_type === "project" ? "#22c55e25" : "var(--surface2)",
                        color: row.entity_type === "project" ? "#22c55e" : "var(--text-dim)",
                      }}>
                      {row.entity_type === "project" ? "Client" : "Lead"}
                    </span>
                  </div>
                </td>
                {solutions.map((s) => {
                  const es = row.solutions[s.id];
                  const status = SOLUTION_STATUSES.find((st) => st.value === es?.status);
                  return (
                    <td key={s.id} className="px-2 py-1 text-center cursor-pointer transition-colors"
                      onClick={() => cycleStatus(row, s)}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface2)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      {status ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs"
                          style={{ background: `${status.color}30`, color: status.color, border: `1px solid ${status.color}` }}>
                          {status.icon}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-quaternary)" }}>–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm" style={{ color: "var(--text-dim)" }}>No businesses match the current filters.</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Stats View
// ─────────────────────────────────────────────────────────────────
function StatsView({ solutions: _solutions }: { solutions: Solution[] }) {
  void _solutions;
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/solutions/stats").then((r) => r.json()).then(setStats);
  }, []);

  if (!stats) return <LoadingAI message="Crunching the numbers" />;

  const maxSold = Math.max(1, ...stats.per_solution.map((s) => s.sold + s.delivered));

  return (
    <div className="p-4 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Proposed" value={stats.proposed} color="#f59e0b" />
        <StatCard label="Sold" value={stats.sold} color="#22c55e" />
        <StatCard label="Delivered" value={stats.delivered} color="#059669" />
        <StatCard label="Upsell MRR" value={`£${stats.mrr.toLocaleString()}`} color="#22c55e" />
        <StatCard label="One-Off Revenue" value={`£${stats.one_off_revenue.toLocaleString()}`} color="var(--accent)" />
      </div>

      {/* Per-solution bar chart */}
      <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Solutions by Sales (Sold + Delivered)</h3>
        <div className="space-y-2">
          {stats.per_solution.map((s) => {
            const won = s.sold + s.delivered;
            const w = (won / maxSold) * 100;
            return (
              <div key={s.id} className="flex items-center gap-3">
                <div className="w-48 text-sm truncate" style={{ color: "var(--text)" }}>{s.name}</div>
                <div className="flex-1 h-7 rounded-lg overflow-hidden flex items-center" style={{ background: "var(--surface2)" }}>
                  <div className="h-full transition-all" style={{ width: `${w}%`, background: "linear-gradient(90deg, #22c55e, #059669)" }} />
                </div>
                <div className="w-32 text-right text-sm" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>{won}</span>
                  <span style={{ color: "var(--text-dim)" }}> sold</span>
                  {s.proposed > 0 && (
                    <span style={{ color: "var(--text-dim)" }}> · {s.proposed} pending</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversion table */}
      <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Conversion Rate</h3>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="text-left py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Solution</th>
              <th className="text-right py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Proposed</th>
              <th className="text-right py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Sold</th>
              <th className="text-right py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Declined</th>
              <th className="text-right py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Conversion</th>
            </tr>
          </thead>
          <tbody>
            {stats.per_solution.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="py-2" style={{ color: "var(--text)" }}>{s.name}</td>
                <td className="text-right py-2" style={{ color: "#f59e0b" }}>{s.proposed}</td>
                <td className="text-right py-2" style={{ color: "#22c55e" }}>{s.sold + s.delivered}</td>
                <td className="text-right py-2" style={{ color: "var(--text-dim)" }}>{s.declined}</td>
                <td className="text-right py-2 font-semibold" style={{ color: s.conversion_pct >= 50 ? "#22c55e" : s.conversion_pct >= 25 ? "#f59e0b" : "var(--text-muted)" }}>
                  {s.conversion_pct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs uppercase tracking-wider mt-1" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}
