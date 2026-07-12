"use client";

import type { LeadStats, ClientStats, ProductRollup } from "@/lib/statsQueries";

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
  return promise;
}
