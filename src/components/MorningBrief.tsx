"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import { useToast } from "./Toast";

// The morning brief from Claude's 8am task, as plain text items. Everything
// here was written by AI from Jay's email and the web, so it is rendered as
// text only (React escapes it) and links show their domain so a disguised
// link can't pass as something else.

interface BriefItem {
  id: number; brief_date: string; section: string; title: string; summary: string;
  source_kind: string; url: string; project_id: number | null; business_name: string;
  client_hint: string; task_id: number | null; task_title: string; task_done: number;
  suggested_action: string; action_kind: string; dismissed_at: string;
}
interface BriefData {
  run: { brief_date: string; headline: string; received_at: string; item_count: number } | null;
  runs: { date: string; items: number }[];
  items: BriefItem[];
}

const SECTION_LABEL: Record<string, string> = {
  attention: "Needs attention", calendar: "Calendar", status: "Status", news: "News",
};
const SOURCE_LABEL: Record<string, string> = { email: "Email", calendar: "Calendar", web: "Web", crm: "CRM" };
const ACTION_LABEL: Record<string, string> = {
  reply_draft: "Draft a reply", site_edit: "Site change", checklist: "Checklist", tracker: "Tracker",
};

const domainOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export default function MorningBrief() {
  const { toast } = useToast();
  const [data, setData] = useState<BriefData | null>(null);
  const [date, setDate] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);

  const load = useCallback(async (d = "") => {
    try {
      const r = await fetch(`/api/brief${d ? `?date=${d}` : ""}`);
      if (!r.ok) throw new Error();
      const j: BriefData = await r.json();
      setData(j);
      setDate(j.run?.brief_date || "");
    } catch {
      setData({ run: null, runs: [], items: [] });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dismiss = async (item: BriefItem, dismissed: boolean) => {
    const r = await fetch("/api/brief", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, dismissed }) });
    if (!r.ok) { toast("Couldn't update that item", "error"); return; }
    setData((d) => d && { ...d, items: d.items.map((i) => i.id === item.id ? { ...i, dismissed_at: dismissed ? "now" : "" } : i) });
  };

  const markDone = async (item: BriefItem) => {
    const note = window.prompt(`Mark "${item.task_title}" done for ${item.business_name}?\n\nWhat was done:`, "");
    if (note === null) return;
    const r = await fetch("/api/project-tasks", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.task_id, completed: true, resolution: note.trim() }) });
    if (!r.ok) { toast("Couldn't tick it off", "error"); return; }
    toast("Ticked off — undo it from Projects → Outstanding", "success");
    setData((d) => d && { ...d, items: d.items.map((i) => i.task_id === item.task_id ? { ...i, task_done: 1 } : i) });
  };

  if (!data) return null;

  const idx = Math.max(0, data.runs.findIndex((r) => r.date === date));
  const latest = data.runs[0]?.date || "";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD
  const visible = data.items.filter((i) => showDismissed || !i.dismissed_at);
  const dismissedCount = data.items.filter((i) => i.dismissed_at).length;
  const sections = ["attention", "calendar", "status", "news"].filter((s) => visible.some((i) => i.section === s));

  return (
    <div className="rounded-xl p-4 lg:col-span-2" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <Icon name="light-bulb" className="w-4 h-4" style={{ color: "var(--accent)" }} />
        <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>Morning brief</h2>
        {data.runs.length > 0 && (
          <div className="flex items-center gap-1">
            {/* runs are newest first: an older day is further down the list */}
            <DayButton label="‹" title="Older brief" to={data.runs[idx + 1]?.date} onGo={load} />
            <select value={date} onChange={(e) => load(e.target.value)} className="text-xs rounded px-1.5 py-0.5"
              style={{ background: "var(--surface3)", color: "var(--text-secondary)", border: "1px solid var(--border-light)" }}>
              {data.runs.map((r) => <option key={r.date} value={r.date}>{dayLabel(r.date)} ({r.items})</option>)}
            </select>
            <DayButton label="›" title="Newer brief" to={idx > 0 ? data.runs[idx - 1]?.date : undefined} onGo={load} />
          </div>
        )}
        {data.run && <span className="text-xs" style={{ color: "var(--text-dim)" }}>received {data.run.received_at.slice(11, 16)} UTC</span>}
        {dismissedCount > 0 && (
          <button onClick={() => setShowDismissed(!showDismissed)} className="ml-auto text-xs" style={{ color: "var(--text-dim)" }}>
            {showDismissed ? "Hide" : "Show"} {dismissedCount} dismissed
          </button>
        )}
      </div>

      {!data.run ? (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          No brief has arrived yet. Once Claude&apos;s 8am task is connected, its items (email, calendar, news) appear here.
        </p>
      ) : (
        <>
          {latest && latest < today && date === latest && (
            <p className="text-xs mb-2 px-2 py-1 rounded" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b" }}>
              Today&apos;s brief hasn&apos;t arrived yet — this is the one from {dayLabel(latest)}.
            </p>
          )}
          {data.run.headline && <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>{data.run.headline}</p>}
          {visible.length === 0 && <p className="text-xs" style={{ color: "var(--text-dim)" }}>Everything in this brief has been dealt with.</p>}
          {sections.map((s) => (
            <div key={s} className="mb-3">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>{SECTION_LABEL[s]}</div>
              <ul className="space-y-2">
                {visible.filter((i) => i.section === s).map((i) => (
                  <li key={i.id} className="rounded-lg px-3 py-2" style={{
                    background: "var(--surface)", border: "1px solid var(--border)", opacity: i.dismissed_at ? 0.5 : 1 }}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>{i.title}</div>
                        {i.summary && <div className="text-xs mt-0.5 whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>{i.summary}</div>}
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5 text-[11px]">
                          {i.business_name && <Chip className="cf-name">{i.business_name}</Chip>}
                          {!i.business_name && i.client_hint && <Chip title="Didn't match a client exactly">? {i.client_hint}</Chip>}
                          {i.source_kind && <Chip>{SOURCE_LABEL[i.source_kind] || i.source_kind}</Chip>}
                          {i.action_kind && <Chip accent>{ACTION_LABEL[i.action_kind] || i.action_kind}</Chip>}
                          {i.url && domainOf(i.url) && (
                            <a href={i.url} target="_blank" rel="noopener noreferrer nofollow" className="underline"
                              style={{ color: "var(--accent)" }}>{domainOf(i.url)} ↗</a>
                          )}
                        </div>
                        {i.suggested_action && (
                          <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>Suggested: {i.suggested_action}</div>
                        )}
                        {i.task_id && (
                          <div className="text-xs mt-1" style={{ color: i.task_done ? "#22c55e" : "var(--text-dim)" }}>
                            {i.task_done ? "✓ " : "Outstanding: "}{i.task_title}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {i.task_id && !i.task_done && (
                          <button onClick={() => markDone(i)} className="text-xs font-semibold px-2 py-1 rounded"
                            style={{ background: "var(--accent)", color: "#fff" }}>Mark done</button>
                        )}
                        <button onClick={() => dismiss(i, !i.dismissed_at)} className="text-xs px-2 py-1 rounded"
                          style={{ background: "var(--surface3)", color: "var(--text-secondary)" }}>
                          {i.dismissed_at ? "Restore" : "Dismiss"}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function DayButton({ label, title, to, onGo }: { label: string; title: string; to?: string; onGo: (d: string) => void }) {
  return (
    <button onClick={() => to && onGo(to)} disabled={!to} title={title}
      className="text-sm font-bold w-6 h-6 rounded"
      style={{ background: "var(--surface3)", color: to ? "var(--text-secondary)" : "var(--text-dim)", opacity: to ? 1 : 0.4, cursor: to ? "pointer" : "default" }}>
      {label}
    </button>
  );
}

function Chip({ children, accent, className = "", title }: { children: React.ReactNode; accent?: boolean; className?: string; title?: string }) {
  return (
    <span title={title} className={`px-1.5 py-0.5 rounded ${className}`} style={{
      background: accent ? "rgba(234,88,12,0.12)" : "var(--surface3)",
      color: accent ? "var(--accent)" : "var(--text-secondary)",
    }}>{children}</span>
  );
}
