"use client";

import { useEffect, useState, useMemo } from "react";
import type { Project } from "@/types";
import { SEO_GEO_TASKS } from "@/lib/seoGeoTasks";
import Icon from "./Icon";
import { useToast } from "./Toast";

interface SeoLog {
  id: number;
  task_ids: string;
  notes: string;
  completed_at: string;
}

export default function SeoGeoModal({ project, onClose, onLogged }: {
  project: Project;
  onClose: () => void;
  onLogged?: () => void;
}) {
  const { toast } = useToast();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [logs, setLogs] = useState<SeoLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const r = await fetch(`/api/projects/${project.id}/seo`);
    const d = await r.json();
    setLogs(d.logs || []);
    setLoadingLogs(false);
  };

  useEffect(() => { fetchLogs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [project.id]);

  const toggle = (id: string) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const tickAll = (category: "seo" | "geo") => {
    setTicked((prev) => {
      const next = new Set(prev);
      const cat = SEO_GEO_TASKS.filter((t) => t.category === category);
      const allTicked = cat.every((t) => next.has(t.id));
      if (allTicked) cat.forEach((t) => next.delete(t.id));
      else cat.forEach((t) => next.add(t.id));
      return next;
    });
  };

  const save = async () => {
    if (ticked.size === 0) {
      toast("Tick at least one task first", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/seo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_ids: Array.from(ticked), notes }),
      });
      if (!res.ok) throw new Error("save failed");
      toast(`Logged ${ticked.size} task${ticked.size === 1 ? "" : "s"}`, "success");
      setTicked(new Set());
      setNotes("");
      fetchLogs();
      onLogged?.();
    } catch {
      toast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const removeLog = async (logId: number) => {
    if (!confirm("Remove this log entry?")) return;
    await fetch(`/api/projects/${project.id}/seo?log_id=${logId}`, { method: "DELETE" });
    fetchLogs();
    onLogged?.();
  };

  const seoTasks = useMemo(() => SEO_GEO_TASKS.filter((t) => t.category === "seo"), []);
  const geoTasks = useMemo(() => SEO_GEO_TASKS.filter((t) => t.category === "geo"), []);

  const taskById = useMemo(() => {
    const m = new Map<string, typeof SEO_GEO_TASKS[number]>();
    SEO_GEO_TASKS.forEach((t) => m.set(t.id, t));
    return m;
  }, []);

  const formatDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl overflow-hidden flex flex-col"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>SEO / GEO Maintenance</p>
            <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>{project.business_name}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded" style={{ color: "var(--text-muted)" }}><Icon name="x-mark" className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          {/* SEO column */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#3b82f6" }}><Icon name="search" className="w-4 h-4" /> SEO Tasks</h3>
              <button onClick={() => tickAll("seo")} className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Toggle all</button>
            </div>
            <div className="space-y-1.5">
              {seoTasks.map((t) => (
                <TaskRow key={t.id} task={t} checked={ticked.has(t.id)} onToggle={() => toggle(t.id)} />
              ))}
            </div>
          </div>

          {/* GEO column */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#22c55e" }}><Icon name="map-pin" className="w-4 h-4" /> GEO / Local Tasks</h3>
              <button onClick={() => tickAll("geo")} className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Toggle all</button>
            </div>
            <div className="space-y-1.5">
              {geoTasks.map((t) => (
                <TaskRow key={t.id} task={t} checked={ticked.has(t.id)} onToggle={() => toggle(t.id)} />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-dim)" }}>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="e.g. New GBP post for summer offer, fixed 3 broken links on services page..."
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }} />
          </div>

          {/* Log history */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>History</h3>
            {loadingLogs ? (
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Loading…</p>
            ) : logs.length === 0 ? (
              <p className="text-xs italic" style={{ color: "var(--text-dim)" }}>No SEO/GEO work logged yet. Tick some tasks above and hit Save.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => {
                  const taskNames = log.task_ids.split(",").filter(Boolean).map((id) => taskById.get(id)?.label || id);
                  return (
                    <div key={log.id} className="rounded-lg p-3 text-xs" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{formatDate(log.completed_at)}</span>
                        <button onClick={() => removeLog(log.id)} title="Remove entry"
                          className="text-xs hover:underline" style={{ color: "#ef4444" }}>Remove</button>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {taskNames.map((n, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[10px]"
                            style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>{n}</span>
                        ))}
                      </div>
                      {log.notes && <p className="italic" style={{ color: "var(--text-dim)" }}>&ldquo;{log.notes}&rdquo;</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer save bar */}
        <div className="flex items-center justify-between gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>{ticked.size} task{ticked.size === 1 ? "" : "s"} ticked</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--surface2)", color: "var(--text-secondary)" }}>Cancel</button>
            <button onClick={save} disabled={saving || ticked.size === 0}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: "var(--accent)", color: "#fff", opacity: (saving || ticked.size === 0) ? 0.5 : 1 }}>
              {saving ? "Saving…" : `Log ${ticked.size > 0 ? ticked.size + " " : ""}task${ticked.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task, checked, onToggle }: { task: typeof SEO_GEO_TASKS[number]; checked: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="w-full text-left rounded-lg p-2.5 transition-all flex items-start gap-2.5"
      style={{
        background: checked ? "var(--accent-subtle)" : "var(--surface2)",
        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
      }}>
      <div className="w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center"
        style={{ background: checked ? "var(--accent)" : "transparent", border: `1.5px solid ${checked ? "var(--accent)" : "var(--border-light)"}` }}>
        {checked && <svg className="w-3 h-3" fill="none" stroke="#fff" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{task.label}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>{task.description}</p>
      </div>
    </button>
  );
}
