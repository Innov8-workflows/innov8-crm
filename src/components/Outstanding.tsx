"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "@/types";
import { WAITING_LABEL, WAITING_COLOUR } from "./OutstandingLine";

// Everything still outstanding, across every client, in one place.
//
// Three kinds of row:
//   - real items: something specific to this client (Redhart's suspended
//     Business Profile), with who it is waiting on and what it blocks
//   - setup gaps: an unticked setup pill, shown as a row so it can't be
//     forgotten; ticking it ticks the pill
//   - checklist steps: the generic 32-step build template, folded away per
//     client so it never drowns the real items
//
// Items ticked by Claude show a "Claude" marker and the note it left, and every
// tick can be reopened from the Recently resolved feed.

interface Task {
  id: number; project_id: number; title: string; detail: string; waiting_on: string;
  blocked_by: number; business_name: string; template: boolean; blocked: boolean;
  blocker_title: string; blocks: number; sort_order: number;
}
interface Gap { project_id: number; business_name: string; field: string; label: string; title: string }
interface Resolved {
  id: number; project_id: number; title: string; completed_at: string; completed_by: string;
  resolution: string; business_name: string;
}
type Filter = "all" | "me" | "client" | "google" | "blocked";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "me", label: "On me" },
  { id: "client", label: "Waiting on client" },
  { id: "google", label: "Waiting on Google" },
  { id: "blocked", label: "Blocked" },
];

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const btn = "px-2.5 py-1 rounded-md text-xs font-semibold";

function Tick({ onClick, disabled, title }: { onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title}
      className="w-4 h-4 rounded flex-shrink-0 mt-0.5"
      style={{ border: "1.5px solid var(--border-light)", background: "var(--surface)",
               cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }} />
  );
}

export default function Outstanding({ projects, onOpenProject, onChanged }: {
  projects: Project[];
  onOpenProject: (id: number) => void;
  onChanged: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [resolved, setResolved] = useState<Resolved[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [openChecklist, setOpenChecklist] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ title: "", detail: "", waiting_on: "", blocked_by: 0 });
  const [adding, setAdding] = useState<{ pid: number; title: string; waiting_on: string } | null>(null);
  const [newFor, setNewFor] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/project-tasks?outstanding=1")).json();
    setTasks(d.tasks || []);
    setGaps(d.setup || []);
    setResolved(d.resolved || []);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  const after = async () => { await load(); onChanged(); setBusy(false); };

  const tickTask = async (id: number) => {
    setBusy(true);
    await fetch("/api/project-tasks", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, completed: true }) });
    await after();
  };
  const reopen = async (id: number) => {
    setBusy(true);
    await fetch("/api/project-tasks", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, completed: false }) });
    await after();
  };
  const tickSetup = async (pid: number, field: string) => {
    setBusy(true);
    await fetch(`/api/projects/${pid}`, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: 1 }) });
    await after();
  };
  const save = async (id: number) => {
    setBusy(true);
    const r = await fetch("/api/project-tasks", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...draft }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); window.alert(e.error || "Couldn't save that."); setBusy(false); return; }
    setEditing(null);
    await after();
  };
  const add = async () => {
    if (!adding || !adding.title.trim()) return;
    setBusy(true);
    await fetch("/api/project-tasks", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: adding.pid, title: adding.title, waiting_on: adding.waiting_on }) });
    setAdding(null);
    await after();
  };

  // Group by client. Real items and setup gaps decide the order — a client whose
  // only open rows are generic checklist steps sinks to the bottom.
  const groups = useMemo(() => {
    const m = new Map<number, { pid: number; name: string; real: Task[]; checklist: Task[]; setup: Gap[] }>();
    const g = (pid: number, name: string) => {
      let e = m.get(pid);
      if (!e) { e = { pid, name, real: [], checklist: [], setup: [] }; m.set(pid, e); }
      return e;
    };
    for (const t of tasks) (t.template ? g(t.project_id, t.business_name).checklist : g(t.project_id, t.business_name).real).push(t);
    for (const s of gaps) g(s.project_id, s.business_name).setup.push(s);
    return [...m.values()].sort((a, b) =>
      (b.real.length - a.real.length) || (b.setup.length - a.setup.length) || a.name.localeCompare(b.name));
  }, [tasks, gaps]);

  const counts = useMemo(() => {
    const real = tasks.filter((t) => !t.template);
    return {
      total: tasks.length + gaps.length,
      me: tasks.filter((t) => !t.waiting_on && !t.blocked).length + gaps.length,
      client: real.filter((t) => t.waiting_on === "client").length,
      google: real.filter((t) => t.waiting_on === "google").length,
      other: real.filter((t) => t.waiting_on === "other").length,
      blocked: tasks.filter((t) => t.blocked).length,
    };
  }, [tasks, gaps]);

  const showTask = (t: Task) =>
    filter === "all" ? true
      : filter === "blocked" ? t.blocked
      : filter === "me" ? !t.waiting_on && !t.blocked
      : t.waiting_on === filter;
  const showSetup = filter === "all" || filter === "me";

  if (!loaded) return <div className="p-6 text-sm" style={{ color: "var(--text-dim)" }}>Loading what&apos;s outstanding…</div>;

  const liveProjects = projects.filter((p) => p.client_status !== "lost");

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 overflow-y-auto p-4">
        {/* summary strip */}
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            ["Outstanding", counts.total, "var(--text)"],
            ["On me", counts.me, WAITING_COLOUR[""]],
            ["Waiting on client", counts.client, WAITING_COLOUR.client],
            ["Waiting on Google", counts.google, WAITING_COLOUR.google],
            ["Blocked", counts.blocked, "#6b7280"],
          ].map(([label, n, colour]) => (
            <div key={String(label)} className="px-3 py-2 rounded-lg"
                 style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <div className="text-lg font-bold" style={{ color: String(colour) }}>{n}</div>
              <div className="text-xs" style={{ color: "var(--text-dim)" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* filters + add for any client */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={btn}
              style={{ background: filter === f.id ? "rgba(234,88,12,0.15)" : "var(--surface2)",
                       color: filter === f.id ? "var(--accent-hover)" : "var(--text-muted)",
                       border: `1px solid ${filter === f.id ? "rgba(234,88,12,0.3)" : "var(--border)"}` }}>
              {f.label}
            </button>
          ))}
          <select value={newFor} disabled={busy}
            onChange={(e) => { const pid = Number(e.target.value); setNewFor(""); if (pid) setAdding({ pid, title: "", waiting_on: "" }); }}
            className="ml-auto px-2 py-1 rounded-md text-xs"
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            <option value="">+ Add an item for…</option>
            {liveProjects.map((p) => <option key={p.id} value={p.id}>{p.business_name}</option>)}
          </select>
        </div>

        {adding && !groups.some((g) => g.pid === adding.pid) && (
          <AddRow adding={adding} setAdding={setAdding} add={add} busy={busy}
            name={liveProjects.find((p) => p.id === adding.pid)?.business_name || ""} />
        )}

        {groups.length === 0 && (
          <div className="text-sm py-10 text-center" style={{ color: "var(--text-dim)" }}>Nothing outstanding anywhere.</div>
        )}

        {groups.map((g) => {
          const real = g.real.filter(showTask);
          const checklist = filter === "all" || filter === "me" ? g.checklist.filter(showTask) : [];
          const setup = showSetup ? g.setup : [];
          if (!real.length && !checklist.length && !setup.length && adding?.pid !== g.pid) return null;
          const open = openChecklist.has(g.pid);
          const openRows = g.real.filter((t) => t.id !== editing);

          return (
            <div key={g.pid} className="mb-3 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <button onClick={() => onOpenProject(g.pid)} className="text-sm font-semibold hover:underline cf-name"
                  style={{ color: "var(--text)", background: "none", border: "none", cursor: "pointer" }}>
                  {g.name}
                </button>
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
                  <span>{g.real.length + g.setup.length + g.checklist.length} outstanding</span>
                  <button className={btn} disabled={busy}
                    onClick={() => setAdding({ pid: g.pid, title: "", waiting_on: "" })}
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                    + Add
                  </button>
                </div>
              </div>

              <div className="px-3 py-2 space-y-1.5">
                {adding?.pid === g.pid && (
                  <AddRow adding={adding} setAdding={setAdding} add={add} busy={busy} />
                )}

                {real.map((t) => editing === t.id ? (
                  <div key={t.id} className="p-2 rounded-lg space-y-1.5" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      className="w-full px-2 py-1 rounded text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
                    <textarea value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
                      placeholder="Why it's still open, what's been tried, dates…" rows={2}
                      className="w-full px-2 py-1 rounded text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }} />
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={draft.waiting_on} onChange={(e) => setDraft({ ...draft, waiting_on: e.target.value })}
                        className="px-2 py-1 rounded text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        {Object.entries(WAITING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <select value={draft.blocked_by} onChange={(e) => setDraft({ ...draft, blocked_by: Number(e.target.value) })}
                        className="px-2 py-1 rounded text-xs max-w-[220px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        <option value={0}>Not blocked</option>
                        {openRows.map((o) => <option key={o.id} value={o.id}>Blocked by: {o.title}</option>)}
                      </select>
                      <button className={btn} disabled={busy} onClick={() => save(t.id)}
                        style={{ background: "var(--accent)", color: "#fff", border: "none" }}>Save</button>
                      <button className={btn} onClick={() => setEditing(null)}
                        style={{ background: "none", color: "var(--text-dim)", border: "none" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={t.id} className="flex items-start gap-2" style={{ opacity: t.blocked ? 0.6 : 1 }}>
                    <Tick onClick={() => tickTask(t.id)} disabled={busy} title="Mark done" />
                    <div className="flex-1 min-w-0">
                      <button onClick={() => { setEditing(t.id); setDraft({ title: t.title, detail: t.detail || "", waiting_on: t.waiting_on || "", blocked_by: t.blocked_by || 0 }); }}
                        className="text-sm text-left" style={{ color: "var(--text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        {t.title}
                      </button>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs mt-0.5">
                        {t.blocked
                          ? <span style={{ color: "#6b7280" }}>blocked by: {t.blocker_title}</span>
                          : <span style={{ color: WAITING_COLOUR[t.waiting_on || ""] }}>{WAITING_LABEL[t.waiting_on || ""]}</span>}
                        {t.blocks > 0 && <span style={{ color: "var(--text-dim)" }}>· holding up {t.blocks} other{t.blocks === 1 ? "" : "s"}</span>}
                      </div>
                      {t.detail && <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)", whiteSpace: "pre-wrap" }}>{t.detail}</div>}
                    </div>
                  </div>
                ))}

                {setup.map((s) => (
                  <div key={s.field} className="flex items-start gap-2">
                    <Tick onClick={() => tickSetup(s.project_id, s.field)} disabled={busy} title={`Mark ${s.label} done`} />
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }} title={s.title}>
                      {s.label} <span className="text-xs" style={{ color: "var(--text-dim)" }}>· setup not done</span>
                    </div>
                  </div>
                ))}

                {checklist.length > 0 && (
                  <div>
                    <button onClick={() => setOpenChecklist((prev) => { const n = new Set(prev); if (n.has(g.pid)) n.delete(g.pid); else n.add(g.pid); return n; })}
                      className="text-xs" style={{ color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {open ? "▾" : "▸"} {checklist.length} build-checklist step{checklist.length === 1 ? "" : "s"}
                    </button>
                    {open && (
                      <div className="mt-1 ml-1 space-y-1">
                        {checklist.map((t) => (
                          <div key={t.id} className="flex items-start gap-2">
                            <Tick onClick={() => tickTask(t.id)} disabled={busy} title="Mark done" />
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{t.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* who ticked what */}
      <div className="w-80 flex-shrink-0 overflow-y-auto p-4" style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="text-xs font-bold mb-2" style={{ color: "var(--text-muted)" }}>RECENTLY RESOLVED</div>
        {resolved.length === 0 && <div className="text-xs" style={{ color: "var(--text-dim)" }}>Nothing ticked in the last fortnight.</div>}
        {resolved.map((r) => (
          <div key={r.id} className="mb-2.5 pb-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold" style={{ color: r.completed_by === "claude" ? "#a855f7" : "#22c55e" }}>
                ✓ {r.completed_by === "claude" ? "Claude" : "You"} · {ago(r.completed_at)}
              </span>
              <button className="text-xs" disabled={busy} onClick={() => reopen(r.id)}
                style={{ color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer" }}>reopen</button>
            </div>
            <div className="text-xs mt-0.5 cf-name" style={{ color: "var(--text-dim)" }}>{r.business_name}</div>
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{r.title}</div>
            {r.resolution && <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>{r.resolution}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddRow({ adding, setAdding, add, busy, name }: {
  adding: { pid: number; title: string; waiting_on: string };
  setAdding: (a: { pid: number; title: string; waiting_on: string } | null) => void;
  add: () => void; busy: boolean; name?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 mb-2 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      {name && <span className="text-xs font-semibold cf-name" style={{ color: "var(--text-secondary)" }}>{name}:</span>}
      <input autoFocus value={adding.title} placeholder="What's outstanding?"
        onChange={(e) => setAdding({ ...adding, title: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") setAdding(null); }}
        className="flex-1 min-w-[200px] px-2 py-1 rounded text-sm"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
      <select value={adding.waiting_on} onChange={(e) => setAdding({ ...adding, waiting_on: e.target.value })}
        className="px-2 py-1 rounded text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
        {Object.entries(WAITING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button className={btn} disabled={busy || !adding.title.trim()} onClick={add}
        style={{ background: "var(--accent)", color: "#fff", border: "none" }}>Add</button>
      <button className={btn} onClick={() => setAdding(null)}
        style={{ background: "none", color: "var(--text-dim)", border: "none" }}>Cancel</button>
    </div>
  );
}
