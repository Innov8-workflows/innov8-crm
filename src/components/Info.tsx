"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TabBar from "./TabBar";
import Icon from "./Icon";
import LoadingAI from "./LoadingAI";
import { useToast } from "./Toast";

// Info: the skills Jay has built with Claude, what to run next for each website
// client, what runs by itself, and the ERP tools Claude can use. Skills,
// scheduled tasks and tools are synced from his PC (sync-skills.mjs); the
// pipeline is worked out from CRM data by src/lib/pipeline.ts.

interface Item { key: string; title: string; category: string; sort: number; description: string; use_when: string; next: string; replaced_by: string; extra: Record<string, unknown>; updated_at: string }
interface Automation { name: string; where: string; schedule: string; last_at: string; detail: string }
interface InfoData { synced_at: string; skills: Item[]; scheduled: Item[]; tools: Item[]; automations: Automation[] }
interface Step { id: string; label: string; command: string; manualBy?: string; ads?: string; does: string; needs: string; produces: string }
interface StepResult { state: "done" | "na" | "todo" | "hidden"; by: string; note: string }
interface ClientRow { project_id: number; business_name: string; stage: string; ads: string[]; steps: Record<string, StepResult>; next: string | null; done: number; total: number }

const TABS = ["Website pipeline", "All skills", "Automations", "Claude's tools"];
const CATEGORY_ORDER = ["Full website", "Paid ads", "Prospecting & sales", "Uncategorised", "Retired"];

function ago(s: string): string {
  if (!s) return "never";
  const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
  if (!Number.isFinite(t)) return s;
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function Command({ cmd }: { cmd: string }) {
  const { toast } = useToast();
  if (!cmd) return null;
  return (
    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(cmd).then(() => toast(`Copied ${cmd}`, "success")).catch(() => {}); }}
      title="Copy to paste into Claude" className="font-mono text-xs px-1.5 py-0.5 rounded"
      style={{ background: "rgba(234,88,12,0.12)", color: "var(--accent)" }}>
      {cmd}
    </button>
  );
}

export default function Info() {
  const [tab, setTab] = useState(TABS[0]);
  const [info, setInfo] = useState<InfoData | null>(null);
  const [pipe, setPipe] = useState<{ steps: Step[]; clients: ClientRow[] } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch("/api/info"), fetch("/api/pipeline")]);
      if (!a.ok || !b.ok) throw new Error(`HTTP ${a.status}/${b.status}`);
      setInfo(await a.json()); setPipe(await b.json()); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "failed"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="p-6 text-sm" style={{ color: "#ef4444" }}>Couldn&apos;t load Info ({error}).</div>;
  if (!info || !pipe) return <LoadingAI message="Loading info" />;

  const skillByKey = new Map(info.skills.map((s) => [s.key, s]));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 pt-3 pb-2 flex items-center gap-2 flex-wrap" style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        <Icon name="book" className="w-5 h-5" style={{ color: "var(--accent)" }} />
        <h1 className="text-lg font-bold" style={{ color: "var(--text)" }}>Info</h1>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          {info.skills.length} skills · synced from your PC {ago(info.synced_at)}
        </span>
        <span className="ml-auto text-[11px]" style={{ color: "var(--text-dim)" }}>Click a command to copy it into Claude</span>
      </div>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      <div className="flex-1 overflow-auto p-5">
        {!info.synced_at && (
          <div className="mb-4 text-xs rounded-lg px-3 py-2" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)", color: "#f59e0b" }}>
            Nothing synced from your PC yet. Ask Claude to &quot;sync skills&quot;.
          </div>
        )}
        {tab === "Website pipeline" && <Pipeline steps={pipe.steps} clients={pipe.clients} skillByKey={skillByKey} onChanged={load} />}
        {tab === "All skills" && <Skills skills={info.skills} />}
        {tab === "Automations" && <Automations automations={info.automations} scheduled={info.scheduled} />}
        {tab === "Claude's tools" && <Tools tools={info.tools} />}
      </div>
    </div>
  );
}

// ── Website pipeline ──────────────────────────────────────────────────────────

function Pipeline({ steps, clients, skillByKey, onChanged }: {
  steps: Step[]; clients: ClientRow[]; skillByKey: Map<string, Item>; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [showDone, setShowDone] = useState(false);
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<{ pid: number; step: string } | null>(null);
  const label = (id: string | null) => steps.find((s) => s.id === id);

  const rows = useMemo(() => clients
    .filter((c) => showDone || c.next)
    .filter((c) => !search || c.business_name.toLowerCase().includes(search.toLowerCase())),
  [clients, showDone, search]);

  const mark = async (pid: number, step: string, status: "done" | "na" | "todo" | null) => {
    setMenu(null);
    const r = await fetch("/api/pipeline", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: pid, step, status }) });
    if (!r.ok) { toast("Couldn't save that", "error"); return; }
    onChanged();
  };

  return (
    <div className="space-y-5">
      {/* The steps, in order */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>Full website — the steps in order</div>
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {steps.map((s, i) => {
            const skill = s.command ? skillByKey.get(s.command.slice(1)) : undefined;
            return (
              <li key={s.id} className="rounded-xl p-3" style={{ background: "var(--surface2)", border: `1px solid ${s.ads ? "rgba(59,130,246,0.35)" : "var(--border)"}` }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0"
                    style={{ background: s.command ? "var(--accent)" : "var(--surface3)", color: s.command ? "#fff" : "var(--text-secondary)" }}>{i + 1}</span>
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{s.label}</span>
                  {s.command ? <Command cmd={s.command} /> : <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface3)", color: "var(--text-dim)" }}>Manual · {s.manualBy}</span>}
                  {s.ads && <span className="text-[11px]" style={{ color: "#3b82f6" }}>{s.ads === "google" ? "Google ads clients" : "Ads clients only"}</span>}
                </div>
                <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>{s.does}</p>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-dim)" }}><b>Needs:</b> {s.needs}</p>
                <p className="text-[11px]" style={{ color: "var(--text-dim)" }}><b>Produces:</b> {s.produces}</p>
                {s.command && !skill && <p className="text-[11px] mt-1" style={{ color: "#f59e0b" }}>Skill not found in the last sync.</p>}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Every client's progress */}
      <div>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Where each client is</div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a client"
            className="text-sm rounded-lg px-2 py-1" style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text)" }} />
          <label className="text-xs flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show finished clients
          </label>
          <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>Click a cell to mark it. A pale ✓ was worked out from the CRM.</span>
        </div>
        <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid var(--border)" }}>
          <table className="text-sm w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                <th className="text-left text-[11px] font-bold uppercase px-3 py-2 sticky left-0" style={{ color: "var(--text-dim)", background: "var(--surface)" }}>Client</th>
                <th className="text-left text-[11px] font-bold uppercase px-3 py-2" style={{ color: "var(--text-dim)" }}>Next</th>
                {steps.map((s, i) => (
                  <th key={s.id} title={s.label} className="text-[11px] font-bold px-1.5 py-2 text-center whitespace-nowrap" style={{ color: "var(--text-dim)" }}>{i + 1}. {s.label.split(" ")[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const n = label(c.next);
                return (
                  <tr key={c.project_id} style={{ borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
                    <td className="px-3 py-1.5 whitespace-nowrap sticky left-0 cf-name" style={{ color: "var(--text)", background: "var(--surface2)" }}>
                      {c.business_name}
                      <span className="text-[11px] ml-1.5" style={{ color: "var(--text-dim)" }}>{c.done}/{c.total}</span>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {n ? (n.command ? <Command cmd={n.command} /> : <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{n.label} (manual)</span>)
                         : <span className="text-xs" style={{ color: "#22c55e" }}>All done</span>}
                    </td>
                    {steps.map((s) => {
                      const r = c.steps[s.id];
                      if (!r || r.state === "hidden") return <td key={s.id} className="text-center text-xs" style={{ color: "var(--text-quaternary)" }}>·</td>;
                      const isNext = c.next === s.id;
                      const open = menu?.pid === c.project_id && menu.step === s.id;
                      const glyph = r.state === "done" ? "✓" : r.state === "na" ? "N/A" : "–";
                      const color = r.state === "done" ? (r.by === "evidence" ? "#86efac" : "#22c55e") : r.state === "na" ? "var(--text-dim)" : isNext ? "var(--accent)" : "var(--text-quaternary)";
                      return (
                        <td key={s.id} className="text-center relative">
                          <button onClick={() => setMenu(open ? null : { pid: c.project_id, step: s.id })}
                            title={`${s.label}: ${r.state}${r.by ? ` (${r.by === "evidence" ? "from CRM data" : `marked by ${r.by}`})` : ""}${r.note ? ` — ${r.note}` : ""}`}
                            className="text-xs font-bold w-9 py-1 rounded"
                            style={{ color, outline: isNext ? "1.5px solid var(--accent)" : "none" }}>
                            {glyph}
                          </button>
                          {open && (
                            <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 rounded-lg shadow-xl p-1 flex flex-col text-xs min-w-[120px]"
                              style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
                              <MenuBtn onClick={() => mark(c.project_id, s.id, "done")}>Mark done</MenuBtn>
                              <MenuBtn onClick={() => mark(c.project_id, s.id, "na")}>Not needed (N/A)</MenuBtn>
                              <MenuBtn onClick={() => mark(c.project_id, s.id, "todo")}>Not done yet</MenuBtn>
                              {r.by === "jay" || r.by === "claude" ? <MenuBtn onClick={() => mark(c.project_id, s.id, null)}>Clear my mark</MenuBtn> : null}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={steps.length + 2} className="px-3 py-4 text-xs" style={{ color: "var(--text-dim)" }}>No clients with steps left. Tick &quot;Show finished clients&quot; to see everyone.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MenuBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left px-2 py-1 rounded hover:opacity-80" style={{ color: "var(--text-secondary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>{children}</button>
  );
}

// ── All skills ────────────────────────────────────────────────────────────────

function Skills({ skills }: { skills: Item[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = new Map<string, Item[]>();
  for (const s of skills) groups.set(s.category, [...(groups.get(s.category) || []), s]);
  const order = [...groups.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
    return (ia < 0 ? 50 : ia) - (ib < 0 ? 50 : ib) || a.localeCompare(b);
  });
  const titleOf = (key: string) => skills.find((s) => s.key === key)?.key || key;

  if (!skills.length) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>No skills synced yet.</p>;
  return (
    <div className="space-y-6">
      {order.map((cat) => (
        <section key={cat}>
          <h2 className="text-sm font-bold mb-2" style={{ color: cat === "Uncategorised" ? "#f59e0b" : cat === "Retired" ? "var(--text-dim)" : "var(--text)" }}>
            {cat} <span className="text-xs font-normal" style={{ color: "var(--text-dim)" }}>({groups.get(cat)!.length})</span>
            {cat === "Uncategorised" && <span className="text-xs font-normal ml-2">— new skills land here until they&apos;re added to catalogue.json</span>}
          </h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {groups.get(cat)!.sort((a, b) => a.sort - b.sort).map((s) => {
              const isOpen = open === s.key;
              const retired = cat === "Retired";
              return (
                <div key={s.key} className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)", opacity: retired ? 0.65 : 1 }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {cat === "Full website" && <span className="text-[11px] font-bold" style={{ color: "var(--text-dim)" }}>Step {s.sort}</span>}
                    <Command cmd={String(s.extra.command || `/${s.key}`)} />
                    <span className="ml-auto text-[11px]" style={{ color: "var(--text-dim)" }}>changed {String(s.extra.updated || "")}</span>
                  </div>
                  {s.use_when && <p className="text-sm mt-1.5" style={{ color: "var(--text)" }}>{s.use_when}</p>}
                  {s.replaced_by && <p className="text-xs mt-1" style={{ color: "#f59e0b" }}>Replaced by /{s.replaced_by}</p>}
                  {s.next && <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Next → /{titleOf(s.next)}</p>}
                  <button onClick={() => setOpen(isOpen ? null : s.key)} className="text-[11px] mt-1.5" style={{ color: "var(--accent)" }}>
                    {isOpen ? "Hide details" : "Full description"}
                  </button>
                  {isOpen && <p className="text-xs mt-1 whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>{s.description}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Automations ───────────────────────────────────────────────────────────────

function Automations({ automations, scheduled }: { automations: Automation[]; scheduled: Item[] }) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-bold mb-2" style={{ color: "var(--text)" }}>Running in the ERP</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {automations.map((a) => (
            <div key={a.name} className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{a.name}</span>
                <span className="ml-auto text-[11px]" style={{ color: "var(--text-dim)" }}>{a.last_at ? `last ${ago(a.last_at)}` : ""}</span>
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>{a.schedule} · {a.where}</div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{a.detail}</div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-sm font-bold mb-2" style={{ color: "var(--text)" }}>On your PC</h2>
        {!scheduled.length && <p className="text-xs" style={{ color: "var(--text-dim)" }}>Nothing synced yet.</p>}
        <div className="grid gap-2 md:grid-cols-2">
          {scheduled.map((t) => {
            const on = t.extra.enabled !== false;
            return (
              <div key={t.key} className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)", opacity: on ? 1 : 0.6 }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{t.title}</span>
                  <span className="text-[11px] px-1.5 rounded" style={{ background: on ? "rgba(34,197,94,0.12)" : "var(--surface3)", color: on ? "#22c55e" : "var(--text-dim)" }}>{on ? "On" : "Off"}</span>
                  <span className="ml-auto text-[11px]" style={{ color: "var(--text-dim)" }}>{t.extra.last_run ? `last ${ago(String(t.extra.last_run))}` : ""}</span>
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>{String(t.extra.schedule || "")} · {t.category}</div>
                <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{t.description}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ── Claude's tools ────────────────────────────────────────────────────────────

function Tools({ tools }: { tools: Item[] }) {
  if (!tools.length) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>Nothing synced yet.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: "var(--text-dim)" }}>
        What Claude (Code and Cowork) can read and change in the ERP, through the innov8-onboarding connector on your PC.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {tools.map((t) => (
          <div key={t.key} className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <div className="font-mono text-xs font-bold" style={{ color: "var(--accent)" }}>{t.title}</div>
            <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{t.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
