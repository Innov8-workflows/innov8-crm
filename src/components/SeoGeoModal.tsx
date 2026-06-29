"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import type { Project, SeoReport } from "@/types";
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

  // SEO report uploads + scores (tracked over time)
  const [reports, setReports] = useState<SeoReport[]>([]);
  const [repScore, setRepScore] = useState("");
  const [repDate, setRepDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [repLink, setRepLink] = useState("");
  const [repFile, setRepFile] = useState<File | null>(null);
  const [savingReport, setSavingReport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const inputStyle = { background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" } as const;

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const r = await fetch(`/api/projects/${project.id}/seo`);
    const d = await r.json();
    setLogs(d.logs || []);
    setLoadingLogs(false);
  };

  const fetchReports = async () => {
    const r = await fetch(`/api/projects/${project.id}/seo-reports`);
    const d = await r.json();
    setReports(d.reports || []);
  };

  useEffect(() => { fetchLogs(); fetchReports(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [project.id]);

  const saveReport = async () => {
    const score = parseFloat(repScore);
    if (isNaN(score) || score < 0 || score > 10) { toast("Enter a score from 0 to 10", "error"); return; }
    if (!repFile && !repLink.trim()) { toast("Choose a file or paste a link", "error"); return; }
    setSavingReport(true);
    try {
      // Noon local so the YYYY-MM-DD date doesn't roll back a day in UTC.
      const loggedAt = repDate ? new Date(repDate + "T12:00:00").toISOString() : new Date().toISOString();
      let res: Response;
      if (repFile) {
        const fd = new FormData();
        fd.append("file", repFile);
        fd.append("score", String(score));
        fd.append("logged_at", loggedAt);
        res = await fetch(`/api/projects/${project.id}/seo-reports`, { method: "POST", body: fd });
      } else {
        res = await fetch(`/api/projects/${project.id}/seo-reports`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: repLink.trim(), name: repLink.trim(), score, logged_at: loggedAt }),
        });
      }
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "save failed"); }
      toast("Report saved", "success");
      setRepScore(""); setRepLink(""); setRepFile(null);
      if (fileRef.current) fileRef.current.value = "";
      fetchReports();
      onLogged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save report", "error");
    } finally {
      setSavingReport(false);
    }
  };

  const removeReport = async (reportId: number) => {
    if (!confirm("Remove this report?")) return;
    await fetch(`/api/projects/${project.id}/seo-reports?report_id=${reportId}`, { method: "DELETE" });
    fetchReports();
    onLogged?.();
  };

  const fmtDay = (iso: string) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "";

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
            <h2 className="text-lg font-bold cf-name" style={{ color: "var(--text)" }}>{project.business_name}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded" style={{ color: "var(--text-muted)" }}><Icon name="x-mark" className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          {/* SEO Score & Reports */}
          <div className="rounded-xl p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-3" style={{ color: "var(--accent)" }}>
              <Icon name="chart-bar" className="w-4 h-4" /> SEO Score &amp; Reports
            </h3>

            {/* Trend chart */}
            {reports.length > 0 && (() => {
              const latest = reports[reports.length - 1]?.score;
              const prev = reports[reports.length - 2]?.score;
              const trend = (latest != null && prev != null) ? (latest > prev ? "up" : latest < prev ? "down" : "same") : null;
              const band = (s: number) => s >= 7 ? "#22c55e" : s >= 4 ? "#f59e0b" : "#ef4444";
              return (
                <div className="mb-4">
                  <div className="flex items-end gap-1 h-20">
                    {reports.map((r) => (
                      <div key={r.id} className="flex-1 rounded-t transition-all" title={`${fmtDay(r.logged_at)} · ${r.score}/10`}
                        style={{ height: `${Math.max((r.score / 10) * 100, 3)}%`, minHeight: 3, background: band(r.score) }} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[10px] mt-1.5" style={{ color: "var(--text-quaternary)" }}>
                    <span>{fmtDay(reports[0].logged_at)}</span>
                    {trend && (
                      <span style={{ color: trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "var(--text-dim)", fontWeight: 600 }}>
                        {trend === "up" ? `▲ Up to ${latest}/10` : trend === "down" ? `▼ Down to ${latest}/10` : `– ${latest}/10`}
                      </span>
                    )}
                    <span>{fmtDay(reports[reports.length - 1].logged_at)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Add a report — upload a file OR paste a link, + score + date */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="application/pdf,image/*"
                  onChange={(e) => setRepFile(e.target.files?.[0] || null)}
                  className="text-xs flex-1 min-w-0" style={{ color: "var(--text-secondary)" }} />
                <span className="text-[10px]" style={{ color: "var(--text-quaternary)" }}>or</span>
                <input value={repLink} onChange={(e) => setRepLink(e.target.value)} placeholder="paste report link…"
                  className="flex-1 min-w-0 px-2 py-1.5 rounded text-xs" style={inputStyle} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px]" style={{ color: "var(--text-dim)" }}>Score</label>
                <input value={repScore} onChange={(e) => setRepScore(e.target.value)} type="number" step="0.5" min="0" max="10" placeholder="7.5"
                  className="w-16 px-2 py-1.5 rounded text-xs" style={inputStyle} />
                <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>/10</span>
                <label className="text-[11px] ml-2" style={{ color: "var(--text-dim)" }}>Date</label>
                <input value={repDate} onChange={(e) => setRepDate(e.target.value)} type="date"
                  className="px-2 py-1.5 rounded text-xs" style={inputStyle} />
                <button onClick={saveReport} disabled={savingReport}
                  className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: "var(--accent)", color: "#fff", opacity: savingReport ? 0.6 : 1 }}>
                  {savingReport ? "Saving…" : "Save report"}
                </button>
              </div>
            </div>

            {/* Report history (newest first) */}
            {reports.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {[...reports].reverse().map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <span className="font-semibold w-14 flex-shrink-0" style={{ color: r.score >= 7 ? "#22c55e" : r.score >= 4 ? "#f59e0b" : "#ef4444" }}>{r.score}/10</span>
                    <span className="flex-shrink-0" style={{ color: "var(--text-dim)" }}>{fmtDay(r.logged_at)}</span>
                    {(r.is_file || r.report_url) && (
                      <a href={r.is_file ? `/api/projects/${project.id}/seo-reports?file=${r.id}` : r.report_url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline" style={{ color: "var(--accent)" }}
                        onClick={(e) => e.stopPropagation()}>
                        {r.report_type === "link" ? "View report ↗" : (r.report_name || "Open file ↗")}
                      </a>
                    )}
                    <button onClick={() => removeReport(r.id)} title="Remove report" className="ml-auto flex-shrink-0 hover:underline" style={{ color: "#ef4444" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
