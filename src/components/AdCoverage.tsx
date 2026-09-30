"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Circle, Tooltip, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Icon from "./Icon";
import LoadingAI from "./LoadingAI";
import { useIsDarkTheme, tileLayerFor, UK_CENTER, UK_ZOOM } from "./mapTheme";

// The Coverage Map's "Ad coverage" tab: every ads client's towns drawn as
// circles, and a "can I run ads here?" check for a prospect. Jay's rule is no
// two ad clients in the SAME trade with overlapping areas.

const METRES_PER_MILE = 1609.344;
const PALETTE = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#ef4444", "#14b8a6", "#eab308", "#ec4899", "#0ea5e9", "#84cc16"];
const COMMON_TRADES = ["roofing", "driveways", "electrical", "plumbing", "landscaping", "glazing", "building", "cleaning"];

interface Area { id: number; place: string; place_label: string; lat: number; lng: number; radius_miles: number }
interface AdClient {
  project_id: number; business_name: string; business_type: string; trade: string;
  platforms: ("google" | "meta")[]; monthly: number; areas: Area[];
}
interface Conflict { project_id: number; business_name: string; trade: string; place: string; distance_miles: number; radius_miles: number; gap_miles: number; overlaps: boolean }
interface CheckResult {
  place: string; matched: string; lat: number; lng: number; radius_miles: number;
  verdict: "clear" | "taken" | "close" | "check"; trade: string;
  conflicts: Conflict[]; unknown_trade: Conflict[];
  clients_without_coverage: { project_id: number; business_name: string }[];
}

const platformLabel = (p: string[]) => p.length === 2 ? "Google + Meta" : p[0] === "google" ? "Google" : p[0] === "meta" ? "Meta" : "";
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : "Trade not set";

export default function AdCoverage({ onOpenClient }: { onOpenClient?: (projectId: number) => void }) {
  const isDark = useIsDarkTheme();
  const tiles = tileLayerFor(isDark);
  const [clients, setClients] = useState<AdClient[] | null>(null);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<number | null>(null);

  const [place, setPlace] = useState("");
  const [trade, setTrade] = useState("roofing");
  const [radius, setRadius] = useState(15);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkError, setCheckError] = useState("");

  useEffect(() => {
    fetch("/api/ad-coverage").then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => setClients(d.clients || []))
      .catch((s) => setError(`Couldn't load ad coverage (${s})`));
  }, []);

  const colour = useMemo(() => {
    const m = new Map<number, string>();
    (clients || []).forEach((c, i) => m.set(c.project_id, PALETTE[i % PALETTE.length]));
    return m;
  }, [clients]);

  const trades = useMemo(() => {
    const set = new Set(COMMON_TRADES);
    for (const c of clients || []) if (c.trade) set.add(c.trade);
    return [...set].sort();
  }, [clients]);

  const runCheck = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!place.trim()) return;
    setChecking(true); setCheckError(""); setResult(null);
    try {
      const qs = new URLSearchParams({ place: place.trim(), trade, radius: String(radius) });
      const r = await fetch(`/api/ad-coverage/check?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d); setFocus(null);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  }, [place, trade, radius]);

  if (error) return <div className="p-6 text-sm" style={{ color: "#ef4444" }}>{error}</div>;
  if (!clients) return <LoadingAI message="Loading ad coverage" />;

  const withAreas = clients.filter((c) => c.areas.length);
  const notSet = clients.filter((c) => !c.areas.length);
  const byTrade = new Map<string, AdClient[]>();
  for (const c of withAreas) byTrade.set(c.trade, [...(byTrade.get(c.trade) || []), c]);

  return (
    <div className="flex-1 flex min-h-0 flex-col md:flex-row">
      {/* ── Side panel ── */}
      <div className="md:w-96 flex-shrink-0 overflow-auto p-4 space-y-4"
        style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>

        <form onSubmit={runCheck} className="rounded-xl p-3 space-y-2" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
          <div className="text-sm font-bold" style={{ color: "var(--text)" }}>Can I run ads here?</div>
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Prospect's town or postcode"
            className="w-full text-sm rounded-lg px-3 py-2"
            style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text)" }} />
          <div className="flex gap-2">
            <select value={trade} onChange={(e) => setTrade(e.target.value)} className="flex-1 text-sm rounded-lg px-2 py-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text)" }}>
              <option value="">Any trade</option>
              {trades.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-dim)" }}>
              <input type="number" min={1} max={100} value={radius} onChange={(e) => setRadius(Math.max(1, Math.min(100, Number(e.target.value) || 15)))}
                className="w-14 text-sm rounded-lg px-2 py-2"
                style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text)" }} />
              miles
            </label>
          </div>
          <button type="submit" disabled={checking || !place.trim()} className="w-full text-sm font-semibold px-3 py-2 rounded-lg"
            style={{ background: "var(--accent)", color: "#fff", opacity: checking || !place.trim() ? 0.6 : 1 }}>
            {checking ? "Checking…" : "Check area"}
          </button>
          {checkError && <div className="text-xs" style={{ color: "#ef4444" }}>{checkError}</div>}
          {result && <Verdict r={result} onOpenClient={onOpenClient} />}
        </form>

        {notSet.length > 0 && (
          <div className="rounded-xl p-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)" }}>
            <div className="text-xs font-bold mb-1" style={{ color: "#f59e0b" }}>
              Coverage not set — {notSet.length} ad client{notSet.length === 1 ? "" : "s"} missing from the check
            </div>
            <ul className="space-y-1">
              {notSet.map((c) => (
                <li key={c.project_id} className="flex items-center gap-2 text-xs">
                  <span className="cf-name flex-1" style={{ color: "var(--text-secondary)" }}>{c.business_name}</span>
                  <span style={{ color: "var(--text-dim)" }}>{platformLabel(c.platforms)}</span>
                  {onOpenClient && (
                    <button onClick={() => onOpenClient(c.project_id)} className="font-semibold" style={{ color: "var(--accent)" }}>Add areas →</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
            Ad clients on the map ({withAreas.length})
          </div>
          {withAreas.length === 0 && (
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>No coverage recorded yet. Add towns from each ad client&apos;s window (Live Clients → client → Details → Ad coverage).</p>
          )}
          {[...byTrade.entries()].sort().map(([t, list]) => (
            <div key={t || "none"} className="mb-3">
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>{cap(t)}</div>
              <ul className="space-y-1.5">
                {list.map((c) => (
                  <li key={c.project_id}>
                    <button onClick={() => { setFocus(c.project_id); setResult(null); }}
                      className="w-full text-left rounded-lg px-2 py-1.5 transition-colors"
                      style={{ background: focus === c.project_id ? "var(--surface3)" : "transparent" }}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colour.get(c.project_id) }} />
                        <span className="cf-name font-semibold truncate" style={{ color: "var(--text)" }}>{c.business_name}</span>
                        <span className="ml-auto text-[11px] flex-shrink-0" style={{ color: "var(--text-dim)" }}>{platformLabel(c.platforms)}</span>
                      </div>
                      <div className="text-[11px] pl-4.5 truncate" style={{ color: "var(--text-dim)", paddingLeft: 18 }}>
                        {c.areas.map((a) => a.place).join(", ")} · {Math.max(...c.areas.map((a) => a.radius_miles))} mi
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative min-h-[420px]" style={{ background: "var(--bg)" }}>
        <MapContainer center={UK_CENTER} zoom={UK_ZOOM} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer url={tiles.url} attribution={tiles.attribution} />
          {withAreas.map((c) => c.areas.map((a) => {
            const col = colour.get(c.project_id) || "#f97316";
            const dim = focus !== null && focus !== c.project_id;
            return (
              <Circle key={a.id} center={[a.lat, a.lng]} radius={a.radius_miles * METRES_PER_MILE}
                pathOptions={{ color: col, fillColor: col, fillOpacity: dim ? 0.03 : 0.12, opacity: dim ? 0.25 : 0.8, weight: 1.5 }}>
                <Tooltip sticky>{c.business_name} · {a.place} · {a.radius_miles} mi</Tooltip>
                <Popup>
                  <div style={{ minWidth: 190 }}>
                    <div className="cf-name" style={{ fontWeight: 700 }}>{c.business_name}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{cap(c.trade)} · {platformLabel(c.platforms)}</div>
                    <div style={{ fontSize: 12, margin: "4px 0" }}>{a.place} — {a.radius_miles} miles{a.place_label ? ` (${a.place_label})` : ""}</div>
                    {onOpenClient && (
                      <button onClick={() => onOpenClient(c.project_id)} style={{ fontSize: 12, fontWeight: 600, color: "#ea580c" }}>
                        Open client card →
                      </button>
                    )}
                  </div>
                </Popup>
              </Circle>
            );
          }))}
          {result && (
            <Circle center={[result.lat, result.lng]} radius={result.radius_miles * METRES_PER_MILE}
              pathOptions={{ color: isDark ? "#ffffff" : "#111827", weight: 2, dashArray: "6 6", fillOpacity: 0.05 }}>
              <Tooltip permanent direction="top">Prospect: {result.matched}</Tooltip>
            </Circle>
          )}
          <FitTo clients={withAreas} focus={focus} result={result} />
        </MapContainer>
        <div className="absolute bottom-3 left-3 text-[11px] px-2 py-1 rounded" style={{ zIndex: 500, background: "var(--surface)", color: "var(--text-dim)", border: "1px solid var(--border)" }}>
          <Icon name="map-pin" className="w-3 h-3 inline mr-1" />Each circle is one town and its ad radius
        </div>
      </div>
    </div>
  );
}

/** Zooms to whatever is being looked at: a checked prospect, one client, or everyone. */
function FitTo({ clients, focus, result }: { clients: AdClient[]; focus: number | null; result: CheckResult | null }) {
  const map = useMap();
  useEffect(() => {
    const circles: [number, number, number][] = [];
    const add = (lat: number, lng: number, miles: number) => circles.push([lat, lng, miles]);
    if (result) {
      add(result.lat, result.lng, result.radius_miles);
      const near = new Set([...result.conflicts, ...result.unknown_trade].map((c) => c.project_id));
      for (const c of clients) if (near.has(c.project_id)) for (const a of c.areas) add(a.lat, a.lng, a.radius_miles);
    } else {
      for (const c of clients) if (focus === null || c.project_id === focus) for (const a of c.areas) add(a.lat, a.lng, a.radius_miles);
    }
    if (!circles.length) return;
    let bounds: L.LatLngBounds | null = null;
    for (const [lat, lng, miles] of circles) {
      const b = L.latLng(lat, lng).toBounds(miles * METRES_PER_MILE * 2);
      bounds = bounds ? bounds.extend(b) : b;
    }
    if (bounds) map.flyToBounds(bounds, { padding: [30, 30], duration: 0.6 });
  }, [map, clients, focus, result]);
  return null;
}

function Verdict({ r, onOpenClient }: { r: CheckResult; onOpenClient?: (id: number) => void }) {
  // "Clear" is only honest if every same-trade ad client has coverage recorded.
  const unchecked = r.verdict === "clear" && r.clients_without_coverage.length > 0;
  const verdict = unchecked ? "check" : r.verdict;
  const style = {
    clear: { bg: "rgba(34,197,94,0.1)", bd: "rgba(34,197,94,0.4)", fg: "#22c55e", text: "Clear" },
    taken: { bg: "rgba(239,68,68,0.1)", bd: "rgba(239,68,68,0.4)", fg: "#ef4444", text: "Taken" },
    close: { bg: "rgba(245,158,11,0.1)", bd: "rgba(245,158,11,0.4)", fg: "#f59e0b", text: "Close" },
    check: { bg: "rgba(245,158,11,0.1)", bd: "rgba(245,158,11,0.4)", fg: "#f59e0b", text: "Check" },
  }[verdict];
  const tradeWord = r.trade ? `${r.trade} ` : "";
  const lead =
    unchecked ? `No clash among the ${tradeWord}ad clients that have coverage set — but not every one does yet.`
    : r.verdict === "clear" ? `No ${tradeWord}ad client covers ${r.matched} within ${r.radius_miles} miles.`
    : r.verdict === "taken" ? `Overlaps an existing ${tradeWord}ad client.`
    : r.verdict === "close" ? `No overlap, but a ${tradeWord}ad client is within 5 miles of the edge.`
    : "No same-trade clash, but a nearby ad client has no trade recorded — check who they are.";
  const rows = [...r.conflicts, ...r.unknown_trade];
  return (
    <div className="rounded-lg p-2.5 text-xs space-y-1.5" style={{ background: style.bg, border: `1px solid ${style.bd}` }}>
      <div className="font-bold text-sm" style={{ color: style.fg }}>{style.text}</div>
      <div style={{ color: "var(--text-secondary)" }}>{lead}</div>
      <div style={{ color: "var(--text-dim)" }}>Matched: {r.matched}</div>
      {rows.map((c) => (
        <div key={c.project_id} className="flex items-center gap-2">
          <span className="cf-name font-semibold" style={{ color: "var(--text)" }}>{c.business_name}</span>
          <span style={{ color: "var(--text-dim)" }}>
            {c.place}, {c.distance_miles} mi away ({c.radius_miles} mi radius){c.overlaps ? "" : ` · ${c.gap_miles} mi gap`}
          </span>
          {onOpenClient && <button type="button" onClick={() => onOpenClient(c.project_id)} className="ml-auto font-semibold" style={{ color: "var(--accent)" }}>Open</button>}
        </div>
      ))}
      {r.clients_without_coverage.length > 0 && (
        <div style={{ color: "#f59e0b" }}>
          Not checked: {r.clients_without_coverage.map((c) => c.business_name).join(", ")} — their coverage isn&apos;t set.
        </div>
      )}
    </div>
  );
}
