"use client";

import type { LeadStats, ClientStats, ProductRollup, CallRollup } from "@/lib/statsQueries";
import type { ClientLeadRollup } from "@/lib/clientReporting";

// Client-side single-flight cache for /api/bootstrap. The shell (page.tsx),
// ViewNav, LeadGrid and StatsBar all mount in the same render pass and each
// used to fire its own fetches — now the first caller starts the ONE bootstrap
// request and everyone else awaits the same promise. Later mounts (tab
// revisits) reuse the resolved data; hot-path refreshes still hit the
// individual endpoints, so this never serves stale data after user edits.

export interface BootstrapData {
  me: { username: string } | null;
  users: string[];
  columns: { id: string; label: string; col_type: string; visible: number; sort_order: number }[];
  customFields: Record<string, Record<string, string>>;
  productRollup: ProductRollup;
  callRollup: CallRollup;
  clientLeadRollup: ClientLeadRollup;
  leadStats: LeadStats;
  counts: { clients: number; projects: number; todos: number };
  clientStats?: ClientStats;
}

let cached: { owner: string; promise: Promise<BootstrapData> } | null = null;

export function fetchBootstrap(owner: string): Promise<BootstrapData> {
  if (cached && cached.owner === owner) return cached.promise;
  const promise = fetch(`/api/bootstrap${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`)
    .then((r) => {
      if (!r.ok) throw new Error(`bootstrap failed: ${r.status}`);
      return r.json() as Promise<BootstrapData>;
    });
  cached = { owner, promise };
  // A failed bootstrap must not poison the cache — clear it so consumers'
  // fallback fetches (and any retry) get a fresh attempt.
  promise.catch(() => {
    if (cached && cached.promise === promise) cached = null;
  });
  // Persist for instant paint on the NEXT load (see getCachedBootstrap).
  promise.then((b) => {
    try {
      sessionStorage.setItem(`crm_bootstrap_cache_${owner || "all"}`, JSON.stringify(b));
      parsedCache = { key: owner || "all", data: b };
    } catch {}
  }).catch(() => {});
  return promise;
}

// Last-known bootstrap payload from this tab session — lets the grid, stats bar
// and badges paint instantly on reload (stale-while-revalidate: the live
// fetchBootstrap result always replaces it moments later). Parsed once per
// module lifetime — several components read it during the same first render.
let parsedCache: { key: string; data: BootstrapData | null } | null = null;

export function getCachedBootstrap(owner: string): BootstrapData | null {
  const key = owner || "all";
  if (parsedCache && parsedCache.key === key) return parsedCache.data;
  let data: BootstrapData | null = null;
  try {
    const raw = sessionStorage.getItem(`crm_bootstrap_cache_${key}`);
    data = raw ? (JSON.parse(raw) as BootstrapData) : null;
  } catch { data = null; }
  parsedCache = { key, data };
  return data;
}

// --- Initial-leads prefetch -------------------------------------------------
// The leads fetch used to start only after the lazy LeadGrid chunk had
// downloaded and mounted (~0.5s into the load). page.tsx kicks this off at
// module-evaluation time instead, so the request rides in parallel with
// hydration + chunk load; LeadGrid consumes it exactly once on mount (the
// take* call clears it, so every later refetch — edits, imports, tab changes —
// goes straight to the network as before).
let leadsPrefetch: { owner: string; promise: Promise<{ leads: unknown[] }> } | null = null;

export function prefetchLeads(owner: string): void {
  if (leadsPrefetch && leadsPrefetch.owner === owner) return;
  const params = new URLSearchParams();
  if (owner) params.set("owner", owner);
  const promise = fetch(`/api/leads?${params}`).then((r) => {
    if (!r.ok) throw new Error(`leads prefetch failed: ${r.status}`);
    return r.json() as Promise<{ leads: unknown[] }>;
  });
  leadsPrefetch = { owner, promise };
  promise.catch(() => {
    if (leadsPrefetch && leadsPrefetch.promise === promise) leadsPrefetch = null;
  });
}

export function takePrefetchedLeads(owner: string): Promise<{ leads: unknown[] }> | null {
  if (leadsPrefetch && leadsPrefetch.owner === owner) {
    const p = leadsPrefetch.promise;
    leadsPrefetch = null;
    return p;
  }
  return null;
}
