"use client";

import { useCallback, useEffect, useState } from "react";
import Icon, { type IconName } from "./Icon";
import LoadingAI from "./LoadingAI";

// The "Today" view: one screen of what needs Jay this morning. The top half is
// live CRM data from /api/today (no AI). The morning brief from Claude lands
// underneath once it is connected.

type NavTarget = "prospects" | "projects" | "onboarding" | "site_health" | "client_dash" | "clients";

interface TodayData {
  generated_at: string;
  money: { mrr: number; clients: number; overdue_renewals: number };
  enquiries: { window_hours: number; total: number; by_client: { project_id: number; business_name: string; count: number; last_at: string }[] };
  follow_ups: { overdue: number; due_today: number; items: { id: number; business_name: string; follow_up_date: string; status: string }[] };
  sites: { source: string; down: { project_id: number; business_name: string; domain: string }[];
    ssl: { project_id: number; business_name: string; domain: string; days: number }[]; cert_warn_days: number };
  onboarding: { to_review: OnboardingRow[]; to_build: OnboardingRow[] };
  outstanding: { on_me: number; waiting: Record<string, number>; blocked: number;
    items: { id: number; project_id: number; business_name: string; title: string; detail: string }[] };
}
interface OnboardingRow { id: number; kind: string; status: string; business_name: string; submitted_at: string; queued: boolean }

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const ago = (sql: string) => {
  const t = Date.parse(sql.replace(" ", "T") + "Z");
  if (!Number.isFinite(t)) return "";
  const h = Math.round((Date.now() - t) / 3600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export default function Today({ onNavigate }: { onNavigate: (v: NavTarget) => void }) {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/today");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data && !error) return <LoadingAI message="Getting today ready" />;

  const d = data;
  const siteIssues = d ? d.sites.down.length + d.sites.ssl.length : 0;
  const followDue = d ? d.follow_ups.overdue + d.follow_ups.due_today : 0;
  const onboardingWaiting = d ? d.onboarding.to_review.length + d.onboarding.to_build.length : 0;
  const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-5 pt-4 pb-3 sticky top-0 z-10" style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 flex-wrap mb-2.5">
          <Icon name="clock" className="w-5 h-5" style={{ color: "var(--accent)" }} />
          <h1 className="text-lg font-bold" style={{ color: "var(--text)" }}>Today</h1>
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>{dateLabel}</span>
          <button onClick={load} className="ml-auto text-sm font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
            <Icon name="refresh" className="w-4 h-4" /> Refresh
          </button>
        </div>
        {error && <div className="text-xs mb-2" style={{ color: "#ef4444" }}>Couldn&apos;t load today&apos;s status ({error}).</div>}
        {d && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            <Stat label="MRR" value={gbp(d.money.mrr)} sub={`${d.money.clients} clients`} />
            <Stat label={`Enquiries (${d.enquiries.window_hours}h)`} value={d.enquiries.total} good={d.enquiries.total > 0} />
            <Stat label="Sites need attention" value={siteIssues} bad={siteIssues > 0} />
            <Stat label="Follow-ups due" value={followDue} warn={followDue > 0} sub={d.follow_ups.overdue ? `${d.follow_ups.overdue} overdue` : undefined} />
            <Stat label="Onboarding waiting" value={onboardingWaiting} warn={onboardingWaiting > 0} />
            <Stat label="Outstanding on me" value={d.outstanding.on_me}
              sub={`${d.outstanding.waiting.client} client · ${d.outstanding.waiting.google} Google`} />
          </div>
        )}
      </div>

      {d && (
        <div className="px-5 py-4 grid gap-4 lg:grid-cols-2">
          <Card title="Sites" icon="shield-check" empty="Every client site is up and no certificate is close to expiring."
            action={{ label: "Site Health", go: () => onNavigate("site_health") }}
            rows={[
              ...d.sites.down.map((s) => ({ key: `d${s.project_id}`, tone: "bad" as const, main: `${s.business_name} is DOWN`, sub: s.domain })),
              ...d.sites.ssl.map((s) => ({ key: `s${s.project_id}`, tone: "warn" as const,
                main: `${s.business_name}: certificate ${s.days < 0 ? "EXPIRED" : `expires in ${s.days} day${s.days === 1 ? "" : "s"}`}`, sub: s.domain })),
            ]} />

          <Card title="New enquiries" icon="envelope" empty={`No website enquiries in the last ${d.enquiries.window_hours} hours.`}
            action={{ label: "Client Dash", go: () => onNavigate("client_dash") }}
            rows={d.enquiries.by_client.map((e) => ({ key: `e${e.project_id}`, tone: "good" as const,
              main: `${e.business_name}: ${e.count} enquir${e.count === 1 ? "y" : "ies"}`, sub: `latest ${ago(e.last_at)}` }))} />

          <Card title="Outstanding on me" icon="flag"
            empty="Nothing is waiting on you. Items waiting on clients or Google are in Projects → Outstanding."
            action={{ label: "Outstanding", go: () => onNavigate("projects") }}
            rows={d.outstanding.items.map((t) => ({ key: `t${t.id}`, tone: "plain" as const,
              main: `${t.business_name}: ${t.title}`, sub: t.detail }))}
            more={d.outstanding.on_me - d.outstanding.items.length} />

          <Card title="Follow-ups due" icon="phone" empty="No prospect follow-ups due today."
            action={{ label: "Prospects", go: () => onNavigate("prospects") }}
            rows={d.follow_ups.items.map((f) => ({ key: `f${f.id}`, tone: f.follow_up_date < d.generated_at.slice(0, 10) ? "warn" as const : "plain" as const,
              main: f.business_name, sub: `${f.follow_up_date < d.generated_at.slice(0, 10) ? "overdue since" : "due"} ${f.follow_up_date}` }))}
            more={followDue - d.follow_ups.items.length} />

          <Card title="Onboarding" icon="document" empty="No onboarding forms waiting on you."
            action={{ label: "Onboarding", go: () => onNavigate("onboarding") }}
            rows={[
              ...d.onboarding.to_review.map((o) => ({ key: `r${o.id}`, tone: "warn" as const,
                main: `${o.business_name || "Unnamed"}: ${o.kind} form to review`, sub: o.submitted_at ? `sent ${ago(o.submitted_at)}` : "" })),
              ...d.onboarding.to_build.map((o) => ({ key: `b${o.id}`, tone: "plain" as const,
                main: `${o.business_name || "Unnamed"}: accepted, not built yet`, sub: o.queued ? "queued for the runner" : "" })),
            ]} />

          <div className="rounded-xl p-4" style={{ background: "var(--surface2)", border: "1px dashed var(--border-light)" }}>
            <div className="flex items-center gap-2 mb-1">
              <Icon name="light-bulb" className="w-4 h-4" style={{ color: "var(--accent)" }} />
              <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>Morning brief</h2>
            </div>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Not connected yet. Once it is, Claude&apos;s 8am brief (email, calendar, news) appears here, with a Prepare button on each item.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, good, warn, bad }: { label: string; value: string | number; sub?: string; good?: boolean; warn?: boolean; bad?: boolean }) {
  const color = bad ? "#ef4444" : warn ? "#f59e0b" : good ? "#22c55e" : "var(--text)";
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>{sub}</div>}
    </div>
  );
}

type Tone = "good" | "warn" | "bad" | "plain";
const TONE: Record<Tone, string> = { good: "#22c55e", warn: "#f59e0b", bad: "#ef4444", plain: "var(--text-dim)" };

function Card({ title, icon, rows, empty, action, more = 0 }: {
  title: string; icon: IconName; empty: string; more?: number;
  rows: { key: string; tone: Tone; main: string; sub?: string }[];
  action?: { label: string; go: () => void };
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon name={icon} className="w-4 h-4" style={{ color: "var(--accent)" }} />
        <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>{title}</h2>
        {rows.length > 0 && <span className="text-xs font-bold px-1.5 rounded-full" style={{ background: "var(--surface3)", color: "var(--text-secondary)" }}>{rows.length + Math.max(0, more)}</span>}
        {action && (
          <button onClick={action.go} className="ml-auto text-xs font-semibold" style={{ color: "var(--accent)" }}>
            {action.label} →
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: TONE[r.tone] }} />
              <div className="min-w-0">
                <div className="cf-name" style={{ color: "var(--text)" }}>{r.main}</div>
                {r.sub && <div className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{r.sub}</div>}
              </div>
            </li>
          ))}
          {more > 0 && <li className="text-xs" style={{ color: "var(--text-dim)" }}>+ {more} more</li>}
        </ul>
      )}
    </div>
  );
}
