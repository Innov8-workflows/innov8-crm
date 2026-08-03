"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { Todo } from "@/types";
import { TODO_PRIORITIES, TODO_CATEGORIES } from "@/types";
import Icon from "./Icon";
import { useToast } from "./Toast";

type Filter = "active" | "done" | "all";
type Priority = "low" | "medium" | "high";

const PRIORITY_WEIGHT: Record<string, number> = { high: 0, medium: 1, low: 2 };
const priorityMeta = (p: string) => TODO_PRIORITIES.find((x) => x.value === p) || TODO_PRIORITIES[1];
const catMeta = (c: string) => TODO_CATEGORIES.find((x) => x.value === c) || TODO_CATEGORIES[TODO_CATEGORIES.length - 1];
const catOf = (t: Todo) => t.category || "general";
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
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newCategory, setNewCategory] = useState<string>("general");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the latest callback without making load()/handlers depend on it.
  const onCountRef = useRef(onCountChanged);
  onCountRef.current = onCountChanged;

  // Report the active-todo count to the parent (nav badge) AFTER each commit.
  // Doing this inside a setTodos updater would update the parent mid-render —
  // React 19 flags that and it caused the view to hang on first add.
  useEffect(() => {
    onCountRef.current?.(todos.filter((t) => !t.done).length);
  }, [todos]);

  // When focused on a category, pre-select it in the add picker so a new task
  // lands where you're looking.
  useEffect(() => {
    if (categoryFilter !== "all") setNewCategory(categoryFilter);
  }, [categoryFilter]);

  const load = useCallback(() => {
    fetch("/api/todos")
      .then((r) => r.json())
      .then((d) => setTodos(d.todos || []))
      .catch(() => toast("Couldn't load to-dos", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (adding) return;
    const text = newText.trim();
    if (!text) { inputRef.current?.focus(); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, priority: newPriority, category: newCategory }),
      });
      if (!res.ok) throw new Error();
      const todo: Todo = await res.json();
      setTodos((prev) => [todo, ...prev]);
      setNewText("");
      setNewPriority("medium");
    } catch {
      toast("Couldn't add — try again", "error");
    } finally {
      setAdding(false);
    }
  };

  const patch = async (id: number, fields: Partial<Pick<Todo, "text" | "detail" | "priority" | "category" | "done">>) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } as Todo : t)));
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error();
      const updated: Todo = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch {
      toast("Update failed", "error");
      load();
    }
  };

  const remove = async (id: number) => {
    const snapshot = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      toast("Delete failed", "error");
      setTodos(snapshot);
    }
  };

  const matchesOwner = (t: Todo) => {
    if (!ownerFilter) return true;
    if (ownerFilter === "__unassigned__") return !t.owner;
    return (t.owner || "").toLowerCase() === ownerFilter.toLowerCase();
  };

  // Owner-scoped set drives the category chip counts (independent of which
  // category is currently selected, so the counts don't jump as you filter).
  const ownerScoped = todos.filter(matchesOwner);
  const activeCount = (cat: string) => ownerScoped.filter((t) => !t.done && (cat === "all" || catOf(t) === cat)).length;

  const matchesCategory = (t: Todo) => categoryFilter === "all" || catOf(t) === categoryFilter;
  const visible = ownerScoped.filter(matchesCategory);

  const byPriorityThenRecency = (a: Todo, b: Todo) =>
    (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]) ||
    (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const active = visible.filter((t) => !t.done).sort(byPriorityThenRecency);
  const done = visible.filter((t) => t.done).sort((a, b) =>
    new Date(b.completed_at || b.updated_at).getTime() - new Date(a.completed_at || a.updated_at).getTime());

  const shownActive = filter === "done" ? [] : active;
  const shownDone = filter === "active" ? [] : done;

  const oneCat = categoryFilter !== "all";

  const renderItem = (t: Todo, showCategory = false) => (
    <TodoItem key={t.id} todo={t} editing={editingId === t.id}
      onStartEdit={() => setEditingId(t.id)} onCancelEdit={() => setEditingId(null)}
      onToggle={() => patch(t.id, { done: t.done ? 0 : 1 })}
      onSave={(fields) => { patch(t.id, fields); setEditingId(null); }}
      onDelete={() => remove(t.id)} showOwner={!ownerFilter} showCategory={showCategory} />
  );

  return (
    <div className="flex-1 overflow-auto">
      {/* Header + add bar */}
      <div className="px-6 pt-4 pb-3 sticky top-0 z-10" style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        {/* Title and status filter share a row — the header is sticky, so every
            row it costs is a row permanently stolen from the board below. */}
        <div className="flex items-center gap-2 gap-y-1.5 flex-wrap mb-2.5">
          <Icon name="list-bullet" className="w-5 h-5 flex-shrink-0" style={{ color: "var(--accent)" }} />
          <h1 className="text-lg font-bold flex-shrink-0" style={{ color: "var(--text)" }}>To-Do</h1>
          {active.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)", color: "#fff" }}>{active.length}</span>
          )}
          <span className="text-xs truncate hidden md:block" style={{ color: "var(--text-dim)" }}>
            Things to get round to — jot it here before it slips your mind.
          </span>
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            {([["active", `Active${active.length ? ` (${active.length})` : ""}`], ["done", `Done${done.length ? ` (${done.length})` : ""}`], ["all", "All"]] as const).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)}
                className="text-xs font-semibold px-3 py-1 rounded-full transition-colors"
                style={{
                  background: filter === f ? "var(--surface3, var(--surface))" : "transparent",
                  color: filter === f ? "var(--text)" : "var(--text-dim)",
                  border: `1px solid ${filter === f ? "var(--border-light)" : "transparent"}`,
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            ref={inputRef}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Add something to do…"
            className="flex-1 px-3 py-2 text-sm rounded-lg"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryPicker value={newCategory} onChange={setNewCategory} />
            <PriorityPicker value={newPriority} onChange={setNewPriority} />
            <button
              onClick={add}
              disabled={adding}
              className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-opacity"
              style={{ background: "var(--accent)", color: "#fff", opacity: adding ? 0.6 : 1 }}
            >
              <Icon name="plus" className="w-4 h-4" strokeWidth={2} /> Add
            </button>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          <CatChip active={categoryFilter === "all"} color="var(--accent)" label="All" count={activeCount("all")} onClick={() => setCategoryFilter("all")} />
          {TODO_CATEGORIES.map((c) => (
            <CatChip key={c.value} active={categoryFilter === c.value} color={c.color} label={c.label} count={activeCount(c.value)} onClick={() => setCategoryFilter(c.value)} />
          ))}
        </div>
      </div>

      {/* List */}
      <div className="px-6 py-4 space-y-3">
        {loading ? (
          <p className="text-sm text-center py-10" style={{ color: "var(--text-dim)" }}>Loading…</p>
        ) : ownerScoped.length === 0 ? (
          <EmptyState text="Nothing on the list yet. Add the first thing above." />
        ) : (
          <>
            {/* Active — one box per category. All categories → the boxes tile
                across the full width (up to 4 abreast on a wide monitor) so the
                board reads as one screen rather than two long stacks. A single
                selected category → one full-width box whose cards tile instead. */}
            <div className={oneCat ? "" : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 items-start"}>
              {TODO_CATEGORIES.map((c) => {
                const items = shownActive.filter((t) => catOf(t) === c.value);
                if (items.length === 0) return null;
                return (
                  <Section key={c.value} color={c.color} label={c.label} count={items.length} singleCol={!oneCat}>
                    {items.map((t) => renderItem(t, false))}
                  </Section>
                );
              })}
            </div>
            {filter === "active" && active.length === 0 && (
              <EmptyState text={oneCat ? `No active ${catMeta(categoryFilter).label} to-dos.` : "No active to-dos — you're all caught up."} />
            )}

            {/* Done — full width, with a category tag on each card */}
            {shownDone.length > 0 && (
              <Section color="#64748b" label="Done" count={shownDone.length}>{shownDone.map((t) => renderItem(t, true))}</Section>
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

// ─── Category filter chip ───
function CatChip({ active, color, label, count, onClick }: { active: boolean; color: string; label: string; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
      style={{
        background: active ? color : `${color}14`,
        color: active ? "#fff" : color,
        border: `1px solid ${active ? color : `${color}40`}`,
      }}>
      {label}
      {count > 0 && (
        <span className="text-[10px] font-bold px-1.5 rounded-full"
          style={{ background: active ? "rgba(255,255,255,0.25)" : `${color}26`, color: active ? "#fff" : color }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Category picker (dropdown — too many to segment) ───
function CategoryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} title="Category"
      className="text-xs font-semibold rounded-lg px-2.5 py-2 flex-shrink-0 cursor-pointer"
      style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)", outline: "none" }}>
      {TODO_CATEGORIES.map((c) => (
        <option key={c.value} value={c.value} style={{ background: "var(--surface)", color: "var(--text)" }}>{c.label}</option>
      ))}
    </select>
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

// ─── Boxed category / status section with a card grid ───
function Section({ color, label, count, singleCol, children }: { color: string; label: string; count: number; singleCol?: boolean; children: ReactNode }) {
  return (
    <div className="rounded-xl p-2.5" style={{ border: `1px solid ${color}40`, background: `${color}14` }}>
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
        <span className="text-[11px] font-semibold px-1.5 rounded-full" style={{ background: `${color}26`, color }}>{count}</span>
      </div>
      <div className={singleCol ? "grid grid-cols-1 gap-1.5" : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-1.5"}>
        {children}
      </div>
    </div>
  );
}

// ─── Single row ───
function TodoItem({ todo, editing, onStartEdit, onCancelEdit, onToggle, onSave, onDelete, showOwner, showCategory }: {
  todo: Todo;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onToggle: () => void;
  onSave: (fields: Partial<Pick<Todo, "text" | "detail" | "priority" | "category">>) => void;
  onDelete: () => void;
  showOwner: boolean;
  showCategory: boolean;
}) {
  const [text, setText] = useState(todo.text);
  const [detail, setDetail] = useState(todo.detail || "");
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [category, setCategory] = useState<string>(catOf(todo));

  useEffect(() => {
    if (editing) { setText(todo.text); setDetail(todo.detail || ""); setPriority(todo.priority); setCategory(catOf(todo)); }
  }, [editing, todo]);

  const meta = priorityMeta(todo.priority);
  const cat = catMeta(catOf(todo));
  const isDone = !!todo.done;

  if (editing) {
    return (
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--accent)" }}>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) onSave({ text, detail, priority, category }); if (e.key === "Escape") onCancelEdit(); }}
          className="w-full px-2 py-1.5 text-sm rounded"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} placeholder="Notes (optional)"
          className="w-full px-2 py-1.5 text-sm rounded resize-none"
          style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)", outline: "none" }} />
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryPicker value={category} onChange={setCategory} />
          <PriorityPicker value={priority} onChange={setPriority} />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancelEdit} className="text-xs px-3 py-1.5 rounded" style={{ color: "var(--text-dim)" }}>Cancel</button>
          <button onClick={() => text.trim() && onSave({ text, detail, priority, category })} disabled={!text.trim()}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--accent)", color: "#fff", opacity: text.trim() ? 1 : 0.5 }}>Save</button>
        </div>
      </div>
    );
  }

  return (
    // One compact row: the title carries the weight, meta sits inline on the
    // right, and the edit/delete buttons are overlaid on hover rather than
    // reserving width — so a single-line to-do costs ~34px instead of ~72px.
    <div className="group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors h-full"
      style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderLeft: `3px solid ${isDone ? "var(--border-light)" : meta.color}` }}>
      {/* Checkbox */}
      <button onClick={onToggle} aria-label={isDone ? "Mark not done" : "Mark done"}
        className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-colors"
        style={{ background: isDone ? "#22c55e" : "transparent", border: `1.5px solid ${isDone ? "#22c55e" : "var(--border-light)"}` }}>
        {isDone && <Icon name="check" className="w-3 h-3" strokeWidth={3} style={{ color: "#fff" }} />}
      </button>

      {/* Body — clamped to 2 lines so one rambling to-do can't stretch its column */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium leading-snug line-clamp-2 break-words" title={todo.text}
          style={{ color: isDone ? "var(--text-dim)" : "var(--text)", textDecoration: isDone ? "line-through" : "none" }}>
          {todo.text}
        </p>
        {todo.detail && (
          <p className="text-[11px] leading-snug line-clamp-1 break-words" title={todo.detail}
            style={{ color: "var(--text-dim)", textDecoration: isDone ? "line-through" : "none" }}>{todo.detail}</p>
        )}
      </div>

      {/* Meta — inline, hidden under the actions on hover */}
      <div className="flex items-center gap-1.5 flex-shrink-0 group-hover:opacity-0 transition-opacity">
        {showCategory && (
          <span className="w-1.5 h-1.5 rounded-full" title={cat.label} style={{ background: cat.color }} />
        )}
        {showOwner && todo.owner && (
          <span className="text-[10px] font-semibold" style={{ color: ownerColor(todo.owner) }}>{todo.owner}</span>
        )}
        <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--text-quaternary)" }}>
          {isDone && todo.completed_at ? `Done ${relTime(todo.completed_at)}` : relTime(todo.created_at)}
        </span>
      </div>

      {/* Actions — overlaid so they cost no layout width */}
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "var(--surface2)" }}>
        <button onClick={onStartEdit} title="Edit" className="p-1 rounded" style={{ color: "var(--text-dim)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
          <Icon name="pencil" className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} title="Delete" className="p-1 rounded" style={{ color: "var(--text-dim)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
          <Icon name="trash" className="w-3.5 h-3.5" />
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
