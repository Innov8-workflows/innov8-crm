"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Todo } from "@/types";
import { TODO_PRIORITIES } from "@/types";
import Icon from "./Icon";
import { useToast } from "./Toast";

type Filter = "active" | "done" | "all";
type Priority = "low" | "medium" | "high";

const PRIORITY_WEIGHT: Record<string, number> = { high: 0, medium: 1, low: 2 };
const priorityMeta = (p: string) => TODO_PRIORITIES.find((x) => x.value === p) || TODO_PRIORITIES[1];
const ownerColor = (o: string) => (o === "Truthfu1" ? "var(--accent)" : o === "LowKey" ? "#c084fc" : "var(--text-dim)");

function relTime(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7); if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface TodosProps {
  ownerFilter: string;
  onCountChanged?: (n: number) => void;
}

export default function Todos({ ownerFilter, onCountChanged }: TodosProps) {
  const { toast } = useToast();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("active");
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Keep the latest callback without making load()/handlers depend on it.
  const onCountRef = useRef(onCountChanged);
  onCountRef.current = onCountChanged;
  const report = useCallback((list: Todo[]) => {
    onCountRef.current?.(list.filter((t) => !t.done).length);
  }, []);

  const load = useCallback(() => {
    fetch("/api/todos")
      .then((r) => r.json())
      .then((d) => { const list: Todo[] = d.todos || []; setTodos(list); report(list); })
      .catch(() => toast("Couldn't load to-dos", "error"))
      .finally(() => setLoading(false));
  }, [report, toast]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const text = newText.trim();
    if (!text || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, priority: newPriority }),
      });
      if (!res.ok) throw new Error();
      const todo: Todo = await res.json();
      setTodos((prev) => { const next = [todo, ...prev]; report(next); return next; });
      setNewText("");
      setNewPriority("medium");
    } catch {
      toast("Couldn't add — try again", "error");
    } finally {
      setAdding(false);
    }
  };

  const patch = async (id: number, fields: Partial<Pick<Todo, "text" | "detail" | "priority" | "done">>) => {
    setTodos((prev) => { const next = prev.map((t) => (t.id === id ? { ...t, ...fields } as Todo : t)); report(next); return next; });
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error();
      const updated: Todo = await res.json();
      setTodos((prev) => { const next = prev.map((t) => (t.id === id ? updated : t)); report(next); return next; });
    } catch {
      toast("Update failed", "error");
      load();
    }
  };

  const remove = async (id: number) => {
    const snapshot = todos;
    setTodos((prev) => { const next = prev.filter((t) => t.id !== id); report(next); return next; });
    try {
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      toast("Delete failed", "error");
      setTodos(snapshot); report(snapshot);
    }
  };

  const matchesOwner = (t: Todo) => {
    if (!ownerFilter) return true;
    if (ownerFilter === "__unassigned__") return !t.owner;
    return (t.owner || "").toLowerCase() === ownerFilter.toLowerCase();
  };

  const visible = todos.filter(matchesOwner);
  const active = visible.filter((t) => !t.done).sort((a, b) =>
    (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]) ||
    (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  const done = visible.filter((t) => t.done).sort((a, b) =>
    new Date(b.completed_at || b.updated_at).getTime() - new Date(a.completed_at || a.updated_at).getTime());

  const shownActive = filter === "done" ? [] : active;
  const shownDone = filter === "active" ? [] : done;

  return (
    <div className="flex-1 overflow-auto">
      {/* Header + add bar */}
      <div className="px-6 pt-5 pb-3 sticky top-0 z-10" style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon name="list-bullet" className="w-5 h-5" style={{ color: "var(--accent)" }} />
          <h1 className="text-lg font-bold" style={{ color: "var(--text)" }}>To-Do</h1>
          {active.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "#fff" }}>{active.length}</span>
          )}
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-dim)" }}>Things to get round to — jot it here before it slips your mind.</p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Add something to do…"
            className="flex-1 px-3 py-2 text-sm rounded-lg"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }}
          />
          <div className="flex items-center gap-2">
            <PriorityPicker value={newPriority} onChange={setNewPriority} />
            <button
              onClick={add}
              disabled={!newText.trim() || adding}
              className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-opacity"
              style={{ background: "var(--accent)", color: "#fff", opacity: !newText.trim() || adding ? 0.5 : 1 }}
            >
              <Icon name="plus" className="w-4 h-4" strokeWidth={2} /> Add
            </button>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 mt-3">
          {([["active", `Active${active.length ? ` (${active.length})` : ""}`], ["done", `Done${done.length ? ` (${done.length})` : ""}`], ["all", "All"]] as const).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)}
              className="text-xs font-semibold px-3 py-1 rounded-full transition-colors"
              style={{
                background: filter === f ? "var(--accent)" : "var(--surface2)",
                color: filter === f ? "#fff" : "var(--text-secondary)",
                border: `1px solid ${filter === f ? "var(--accent)" : "var(--border)"}`,
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="px-6 py-4 max-w-3xl mx-auto space-y-2">
        {loading ? (
          <p className="text-sm text-center py-10" style={{ color: "var(--text-dim)" }}>Loading…</p>
        ) : visible.length === 0 ? (
          <EmptyState text="Nothing on the list yet. Add the first thing above." />
        ) : (
          <>
            {shownActive.map((t) => (
              <TodoItem key={t.id} todo={t} editing={editingId === t.id}
                onStartEdit={() => setEditingId(t.id)} onCancelEdit={() => setEditingId(null)}
                onToggle={() => patch(t.id, { done: t.done ? 0 : 1 })}
                onSave={(fields) => { patch(t.id, fields); setEditingId(null); }}
                onDelete={() => remove(t.id)} showOwner={!ownerFilter} />
            ))}
            {filter === "active" && active.length === 0 && (
              <EmptyState text="No active to-dos — you're all caught up." />
            )}

            {shownDone.length > 0 && (
              <>
                {filter === "all" && shownActive.length > 0 && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider pt-4 pb-1" style={{ color: "var(--text-quaternary)" }}>Done</p>
                )}
                {shownDone.map((t) => (
                  <TodoItem key={t.id} todo={t} editing={editingId === t.id}
                    onStartEdit={() => setEditingId(t.id)} onCancelEdit={() => setEditingId(null)}
                    onToggle={() => patch(t.id, { done: t.done ? 0 : 1 })}
                    onSave={(fields) => { patch(t.id, fields); setEditingId(null); }}
                    onDelete={() => remove(t.id)} showOwner={!ownerFilter} />
                ))}
              </>
            )}
            {filter === "done" && done.length === 0 && (
              <EmptyState text="Nothing ticked off yet." />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Priority picker (segmented) ───
function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0" style={{ border: "1px solid var(--border-light)" }}>
      {TODO_PRIORITIES.map((p) => {
        const on = value === p.value;
        return (
          <button key={p.value} onClick={() => onChange(p.value)} title={`${p.label} priority`}
            className="text-xs font-semibold px-2.5 py-2 transition-colors"
            style={{ background: on ? `${p.color}25` : "transparent", color: on ? p.color : "var(--text-dim)" }}>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Single row ───
function TodoItem({ todo, editing, onStartEdit, onCancelEdit, onToggle, onSave, onDelete, showOwner }: {
  todo: Todo;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onToggle: () => void;
  onSave: (fields: Partial<Pick<Todo, "text" | "detail" | "priority">>) => void;
  onDelete: () => void;
  showOwner: boolean;
}) {
  const [text, setText] = useState(todo.text);
  const [detail, setDetail] = useState(todo.detail || "");
  const [priority, setPriority] = useState<Priority>(todo.priority);

  useEffect(() => {
    if (editing) { setText(todo.text); setDetail(todo.detail || ""); setPriority(todo.priority); }
  }, [editing, todo]);

  const meta = priorityMeta(todo.priority);
  const isDone = !!todo.done;

  if (editing) {
    return (
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--accent)" }}>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) onSave({ text, detail, priority }); if (e.key === "Escape") onCancelEdit(); }}
          className="w-full px-2 py-1.5 text-sm rounded"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} placeholder="Notes (optional)"
          className="w-full px-2 py-1.5 text-sm rounded resize-none"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
        <div className="flex items-center justify-between gap-2">
          <PriorityPicker value={priority} onChange={setPriority} />
          <div className="flex items-center gap-2">
            <button onClick={onCancelEdit} className="text-xs px-3 py-1.5 rounded" style={{ color: "var(--text-dim)" }}>Cancel</button>
            <button onClick={() => text.trim() && onSave({ text, detail, priority })} disabled={!text.trim()}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--accent)", color: "#fff", opacity: text.trim() ? 1 : 0.5 }}>Save</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${isDone ? "var(--border-light)" : meta.color}` }}>
      {/* Checkbox */}
      <button onClick={onToggle} aria-label={isDone ? "Mark not done" : "Mark done"}
        className="w-5 h-5 rounded-md flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors"
        style={{ background: isDone ? "#22c55e" : "transparent", border: `1.5px solid ${isDone ? "#22c55e" : "var(--border-light)"}` }}>
        {isDone && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} style={{ color: "#fff" }} />}
      </button>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug break-words" style={{ color: isDone ? "var(--text-dim)" : "var(--text)", textDecoration: isDone ? "line-through" : "none" }}>
          {todo.text}
        </p>
        {todo.detail && (
          <p className="text-xs mt-0.5 break-words" style={{ color: "var(--text-dim)", textDecoration: isDone ? "line-through" : "none" }}>{todo.detail}</p>
        )}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5">
          {!isDone && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: `${meta.color}20`, color: meta.color }}>{meta.label}</span>
          )}
          {showOwner && todo.owner && (
            <span className="text-[10px] font-semibold" style={{ color: ownerColor(todo.owner) }}>{todo.owner}</span>
          )}
          <span className="text-[10px]" style={{ color: "var(--text-quaternary)" }}>
            {isDone && todo.completed_at ? `Done ${relTime(todo.completed_at)}` : relTime(todo.created_at)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onStartEdit} title="Edit" className="p-1 rounded" style={{ color: "var(--text-dim)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
          <Icon name="pencil" className="w-4 h-4" />
        </button>
        <button onClick={onDelete} title="Delete" className="p-1 rounded" style={{ color: "var(--text-dim)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
          <Icon name="trash" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-12" style={{ color: "var(--text-dim)" }}>
      <div className="flex justify-center mb-2" style={{ color: "var(--text-quaternary)" }}><Icon name="list-bullet" className="w-9 h-9" /></div>
      <p className="text-sm">{text}</p>
    </div>
  );
}
