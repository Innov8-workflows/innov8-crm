"use client";

// The monthly sales target, at the top of the Dashboard. Always the current calendar
// month and always company-wide, whatever the date picker and Owner filter say. It
// fetches for itself so a failure here can't take the rest of the Dashboard down.
// The figures come from src/lib/salesTargets.ts, which explains why they can differ
// from the New MRR tile.
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { gbp } from "@/lib/money";
import type { MonthResult, SalesTargetResponse } from "@/lib/salesTargets";

const GOOD = "#22c55e";
const MISS = "#f59e0b";
const NEUTRAL = "#64748b";

const monthName = (m: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

const pct = (value: number, target: number) => (target > 0 ? Math.min(100, (value / target) * 100) : 0);

export default function SalesTarget({ active = true }: { active?: boolean }) {
  const [data, setData] = useState<SalesTargetResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);

  // The Dashboard stays mounted, so refresh each time it becomes the active view.
  useEffect(() => {
    if (!active) return;
    let live = true;
    fetch("/api/sales-targets", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((fresh: SalesTargetResponse) => { if (live) { setData(fresh); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [active]);

  if (!data) {
    return failed
      ? <div className="pt-4 text-sm" style={{ color: "var(--text-dim)" }}>The sales target couldn&apos;t load.</div>
      : null;
  }

  const { current, day, days_in_month: daysInMonth } = data;
  const target = current.target;
  const daysLeft = daysInMonth - day;

  return (
    <section className="rounded-xl p-4 mt-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      aria-label="Monthly sales target">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="trophy" className="w-4 h-4" style={{ color: "var(--accent)" }} />
        <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>
          Sales target · {monthName(data.month, { month: "long", year: "numeric" })}
        </h2>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          {daysLeft === 0 ? "last day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
        </span>
        <button onClick={() => setEditing((e) => !e)} className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-md"
          style={{ background: "var(--surface2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
          <Icon name="pencil" className="w-3.5 h-3.5" /> {target ? "Change target" : "Set target"}
        </button>
      </div>

      {editing && <TargetForm target={target} onCancel={() => setEditing(false)}
        onSaved={(fresh) => { setData(fresh); setEditing(false); }} />}

      {target ? <Progress data={data} /> : (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>No target set yet.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        <Wins data={data} />
        <History data={data} />
      </div>

      <p className="text-[11px] mt-3" style={{ color: "var(--text-quaternary)" }}>
        Counts products sold this month from the day a client is won, for all owners, before churn. It can differ from New MRR below, which leaves out deals still in onboarding and splits upsells out.
      </p>
    </section>
  );
}

function Progress({ data }: { data: SalesTargetResponse }) {
  const { current, day, days_in_month: daysInMonth } = data;
  const target = current.target!;
  const hit = current.new_mrr >= target.new_mrr;
  const expected = (target.new_mrr * day) / daysInMonth;
  const gap = current.new_mrr - expected;
  // The first few days are too thin to project a whole month from.
  const projected = day >= 7 ? (current.new_mrr / day) * daysInMonth : null;
  const colour = hit ? GOOD : "var(--accent)";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px] items-end">
      <div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-extrabold" style={{ color: "var(--text)" }}>{gbp(current.new_mrr)}</span>
          <span className="text-sm" style={{ color: "var(--text-dim)" }}>of {gbp(target.new_mrr)} new monthly recurring</span>
          {hit && (
            <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: GOOD }}>
              <Icon name="check-circle" className="w-4 h-4" /> Target hit
            </span>
          )}
        </div>
        <div className="relative mt-2 h-3 rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={target.new_mrr}
          aria-valuenow={current.new_mrr} aria-label="New monthly recurring against target" style={{ background: "var(--border)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct(current.new_mrr, target.new_mrr)}%`, background: colour }} />
          {!hit && (
            <span className="absolute" title={`Where you should be by today: ${gbp(Math.round(expected))}`}
              style={{ left: `${(day / daysInMonth) * 100}%`, top: -3, bottom: -3, width: 2, marginLeft: -1, background: "var(--text)" }} />
          )}
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
          {hit
            ? `${gbp(current.new_mrr - target.new_mrr)} over target`
            : `${gbp(Math.round(Math.abs(gap)))} ${gap >= 0 ? "ahead of" : "behind"} pace · ${gbp(target.new_mrr - current.new_mrr)} still to sell`}
          {projected !== null && !hit ? ` · on course for ${gbp(Math.round(projected))}` : ""}
        </p>
      </div>
      <div className="space-y-2.5">
        <Side label="Setup fees" value={gbp(current.setup_fees)} of={gbp(target.setup_fees)} width={pct(current.setup_fees, target.setup_fees)} />
        <Side label="New clients" value={String(current.new_clients)} of={String(target.new_clients)} width={pct(current.new_clients, target.new_clients)} />
      </div>
    </div>
  );
}

function Side({ label, value, of, width }: { label: string; value: string; of: string; width: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span style={{ color: "var(--text-dim)" }}>{label}</span>
        <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{value} / {of}</span>
      </div>
      <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, background: width >= 100 ? GOOD : "var(--accent)" }} />
      </div>
    </div>
  );
}

function Wins({ data }: { data: SalesTargetResponse }) {
  return (
    <div>
      <h3 className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-dim)" }}>Sold this month</h3>
      {data.wins.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-quaternary)" }}>Nothing sold yet this month.</p>
      ) : (
        <ul className="space-y-1 max-h-40 overflow-auto">
          {data.wins.map((w) => (
            <li key={w.project_id} className="flex items-center gap-2 text-xs">
              <span className="truncate cf-name" style={{ color: "var(--text-secondary)" }}>{w.business_name}</span>
              <span className="text-[10px] flex-shrink-0" style={{ color: "var(--text-quaternary)" }}>{w.new_client ? "new client" : "add-on"}</span>
              <span className="ml-auto flex-shrink-0 font-semibold" style={{ color: "var(--text)" }}>
                {w.monthly ? `${gbp(w.monthly)}/mo` : ""}{w.monthly && w.setup ? " + " : ""}{w.setup ? `${gbp(w.setup)} setup` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function History({ data }: { data: SalesTargetResponse }) {
  const { history, streak, current } = data;
  const line = current.target?.new_mrr ?? 0;
  const max = Math.max(line, ...history.map((h) => h.new_mrr), 1);
  const barColour = (h: MonthResult) => (h.hit === true ? GOOD : h.hit === false ? MISS : h.month === data.month ? "var(--accent)" : NEUTRAL);

  return (
    <div>
      <div className="flex items-center gap-3 mb-1.5">
        <h3 className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>New recurring, last 12 months</h3>
        {streak > 0 && <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{streak} month{streak === 1 ? "" : "s"} hit in a row</span>}
        <span className="ml-auto flex items-center gap-2.5 text-[10px]" style={{ color: "var(--text-dim)" }}>
          <Key colour={GOOD} label="Hit" /><Key colour={MISS} label="Missed" /><Key colour={NEUTRAL} label="No target" />
        </span>
      </div>
      <div className="relative" style={{ height: 96 }}>
        {line > 0 && (
          <div className="absolute left-0 right-0" title={`Current target: ${gbp(line)}`}
            style={{ bottom: `calc(${(line / max) * 80}px + 16px)`, borderTop: "1px dashed var(--text-quaternary)" }} />
        )}
        <div className="absolute inset-0 flex items-end" style={{ gap: 2 }}>
          {history.map((h) => (
            <div key={h.month} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" tabIndex={0}
              title={`${monthName(h.month, { month: "long", year: "numeric" })}: ${gbp(h.new_mrr)} new recurring, ${gbp(h.setup_fees)} setup, ${h.new_clients} new client${h.new_clients === 1 ? "" : "s"}${h.target ? `. Target ${gbp(h.target.new_mrr)}` : ""}${h.hit === true ? ", hit" : h.hit === false ? ", missed" : ""}`}>
              <div className="w-full" style={{ maxWidth: 28, height: h.new_mrr ? Math.max(3, (h.new_mrr / max) * 80) : 0, background: barColour(h), borderRadius: "4px 4px 0 0" }} />
              <span className="text-[10px] leading-none mt-1" style={{ height: 12, color: h.month === data.month ? "var(--text)" : "var(--text-dim)", fontWeight: h.month === data.month ? 700 : 400 }}>
                {monthName(h.month, { month: "short" }).charAt(0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block rounded-sm" style={{ width: 8, height: 8, background: colour }} /> {label}
    </span>
  );
}

function TargetForm({ target, onCancel, onSaved }: {
  target: MonthResult["target"];
  onCancel: () => void;
  onSaved: (fresh: SalesTargetResponse) => void;
}) {
  const [newMrr, setNewMrr] = useState(String(target?.new_mrr ?? 2000));
  const [setup, setSetup] = useState(String(target?.setup_fees ?? 2000));
  const [clients, setClients] = useState(String(target?.new_clients ?? 8));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    const res = await fetch("/api/sales-targets", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_mrr: Number(newMrr), setup_fees: Number(setup), new_clients: Number(clients) }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setSaving(false);
    if (res?.ok) onSaved(body); else setError(body.error || "Couldn't save the target, try again");
  };

  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="text-xs" style={{ color: "var(--text-dim)" }}>
      <span className="block mb-1">{label}</span>
      <input type="number" min={0} step={1} value={value} onChange={(e) => set(e.target.value)}
        className="w-28 px-2 py-1 rounded-md text-sm" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }} />
    </label>
  );

  return (
    <form onSubmit={save} className="flex items-end gap-3 flex-wrap mb-4 p-3 rounded-lg" style={{ background: "var(--surface2)" }}>
      {field("New recurring (£/mo)", newMrr, setNewMrr)}
      {field("Setup fees (£)", setup, setSetup)}
      {field("New clients", clients, setClients)}
      <button type="submit" disabled={saving} className="text-xs font-semibold px-3 py-1.5 rounded-md" style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving" : "Save"}
      </button>
      <button type="button" onClick={onCancel} className="text-xs px-2 py-1.5" style={{ color: "var(--text-dim)" }}>Cancel</button>
      <span className="text-[11px] w-full" style={{ color: "var(--text-quaternary)" }}>Applies from this month onward. Past months keep the target they had.</span>
      {error && <span className="text-xs w-full" style={{ color: "#ef4444" }}>{error}</span>}
    </form>
  );
}
