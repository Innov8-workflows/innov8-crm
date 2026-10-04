"use client";

import { useCallback, useEffect, useState } from "react";

// "Ad coverage" in the client window: the towns this client's ads run in and
// the radius around each. Feeds the Coverage Map's "can I run ads here?" check.
// Shown for ad clients (Google Sponsored PPC / Meta Ads Management attached); for anyone
// else it collapses to a one-line note so it doesn't clutter the window.

interface Area { id: number; place: string; place_label: string; radius_miles: number }
interface Data { is_ad_client: boolean; platforms: string[]; trade: string; areas: Area[] }
interface Proposal { towns: string[]; excluded: string[]; radius_text: string; radius_miles: number; radius_guessed: boolean }

const splitTowns = (s: string) => s.split(/[\n,;]/).map((t) => t.trim()).filter(Boolean);

export default function AdCoverageEditor({ projectId, refreshKey = 0, onChanged }: {
  projectId: number; refreshKey?: number; onChanged?: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [adding, setAdding] = useState("");
  const [radius, setRadius] = useState(15);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [proposal, setProposal] = useState<(Proposal & { picked: Set<string> }) | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/ad-coverage?project_id=${projectId}`);
    if (!r.ok) return;
    const d: Data = await r.json();
    setData(d);
    if (d.areas.length) setRadius(Math.max(...d.areas.map((a) => a.radius_miles)));
  }, [projectId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const save = async (places: string[], miles: number) => {
    if (!places.length) return;
    setBusy(`Looking up ${places.length} town${places.length === 1 ? "" : "s"}…`); setMsg(null);
    try {
      const r = await fetch("/api/ad-coverage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, places, radius_miles: miles }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const parts = [`Saved ${d.saved.length}`];
      if (d.not_found.length) parts.push(`couldn't find: ${d.not_found.join(", ")} — try a nearby town or postcode`);
      if (d.failed.length) parts.push(`lookup busy, try again: ${d.failed.join(", ")}`);
      setMsg({ tone: d.not_found.length || d.failed.length ? "warn" : "ok", text: parts.join(" · ") });
      setAdding(""); setProposal(null);
      await load(); onChanged?.();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally { setBusy(""); }
  };

  const remove = async (a: Area) => {
    const r = await fetch("/api/ad-coverage", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id }) });
    if (r.ok) { await load(); onChanged?.(); }
  };

  const setAllRadius = async () => {
    setBusy("Updating radius…");
    const r = await fetch("/api/ad-coverage", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, radius_miles: radius }) });
    setBusy("");
    if (r.ok) { setMsg({ tone: "ok", text: `Every town now ${radius} miles` }); await load(); onChanged?.(); }
  };

  const importFromForm = async () => {
    setBusy("Reading their ad form…"); setMsg(null);
    try {
      const r = await fetch("/api/ad-coverage/import", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      if (!d.towns.length) throw new Error("Their ad form has no target towns filled in.");
      setProposal({ ...d, picked: new Set(d.towns) });
      setRadius(d.radius_miles);
    } catch (e) {
      setMsg({ tone: "warn", text: e instanceof Error ? e.message : "Import failed" });
    } finally { setBusy(""); }
  };

  if (!data) return null;

  if (!data.is_ad_client && !data.areas.length) {
    return (
      <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
        Ad coverage: add a Google Sponsored PPC or Meta Ads Management product above and this client&apos;s ad towns can be recorded here for the Coverage Map.
      </p>
    );
  }

  const tone = { ok: "#22c55e", warn: "#f59e0b", err: "#ef4444" };
  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface2)", border: `1px solid ${data.areas.length ? "var(--border)" : "rgba(245,158,11,0.45)"}` }}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Ad coverage</span>
        <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          {data.platforms.map((p) => p === "google" ? "Google" : "Meta").join(" + ") || "no ad product"}{data.trade ? ` · ${data.trade}` : " · trade not set"}
        </span>
        <button onClick={importFromForm} disabled={!!busy} className="ml-auto text-xs font-semibold" style={{ color: "var(--accent)" }}>
          Import from their ad form
        </button>
      </div>
      {!data.trade && (
        <p className="text-[11px]" style={{ color: "#f59e0b" }}>No business type on this client, so the same-trade check can&apos;t tell who they compete with — set it on the lead.</p>
      )}
      {!data.areas.length && !proposal && (
        <p className="text-[11px]" style={{ color: "#f59e0b" }}>No towns yet — until there are, the Coverage Map can&apos;t check prospects against this client.</p>
      )}

      {data.areas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.areas.map((a) => (
            <span key={a.id} title={a.place_label} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: "var(--surface3)", color: "var(--text-secondary)" }}>
              {a.place} <span style={{ color: "var(--text-dim)" }}>{a.radius_miles}mi</span>
              <button onClick={() => remove(a)} title="Remove" style={{ color: "var(--text-dim)" }}>×</button>
            </span>
          ))}
        </div>
      )}

      {proposal && (
        <div className="rounded-md p-2 space-y-1.5" style={{ background: "var(--surface)", border: "1px solid var(--border-light)" }}>
          <div className="text-xs font-semibold" style={{ color: "var(--text)" }}>From their ad form — untick any you don&apos;t want, then save</div>
          <div className="flex flex-wrap gap-2">
            {proposal.towns.map((t) => (
              <label key={t} className="text-xs flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={proposal.picked.has(t)} onChange={(e) => {
                  const next = new Set(proposal.picked); if (e.target.checked) next.add(t); else next.delete(t);
                  setProposal({ ...proposal, picked: next });
                }} />{t}
              </label>
            ))}
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            Radius they gave: {proposal.radius_text || "none"}{proposal.radius_guessed ? ` — using ${proposal.radius_miles} miles, change it below` : ""}
            {proposal.excluded.length ? ` · Excluded: ${proposal.excluded.join(", ")}` : ""}
          </div>
          <div className="flex gap-2">
            <button onClick={() => save([...proposal.picked], radius)} disabled={!!busy || !proposal.picked.size}
              className="text-xs font-semibold px-2.5 py-1 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
              Save {proposal.picked.size} town{proposal.picked.size === 1 ? "" : "s"} at {radius} miles
            </button>
            <button onClick={() => setProposal(null)} className="text-xs px-2.5 py-1 rounded" style={{ background: "var(--surface3)", color: "var(--text-secondary)" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add towns or postcodes, comma separated"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(splitTowns(adding), radius); } }}
          className="flex-1 min-w-[180px] text-sm rounded px-2 py-1"
          style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text)" }} />
        <label className="text-xs flex items-center gap-1" style={{ color: "var(--text-dim)" }}>
          <input type="number" min={1} max={100} value={radius} onChange={(e) => setRadius(Math.max(1, Math.min(100, Number(e.target.value) || 15)))}
            className="w-14 text-sm rounded px-2 py-1" style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text)" }} />
          miles
        </label>
        <button onClick={() => save(splitTowns(adding), radius)} disabled={!!busy || !adding.trim()}
          className="text-xs font-semibold px-2.5 py-1 rounded" style={{ background: "var(--accent)", color: "#fff", opacity: busy || !adding.trim() ? 0.6 : 1 }}>
          Add
        </button>
        {data.areas.length > 0 && (
          <button onClick={setAllRadius} disabled={!!busy} className="text-xs px-2.5 py-1 rounded"
            style={{ background: "var(--surface3)", color: "var(--text-secondary)" }}>Set all to {radius} mi</button>
        )}
      </div>
      {busy && <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>{busy}</div>}
      {msg && <div className="text-[11px]" style={{ color: tone[msg.tone] }}>{msg.text}</div>}
    </div>
  );
}
