import type { Client } from "@libsql/client";
import { all } from "@/lib/db";
import { CLIENT_STAGES } from "@/lib/statsQueries";
import { haversineMiles, type LatLng } from "@/lib/geo";
import { TransientGeocodeError } from "@/lib/geocode";

// Ad coverage: which live clients run ads, where, and whether a prospect's area
// clashes with one of them. Jay's rule: he won't run ads for two clients in the
// SAME TRADE whose areas overlap. Coverage is towns with a radius, drawn as
// circles; two circles overlap when their centres are closer than the radii
// added together.

/** The catalogue products that make a client an ad client — matched by NAME, the ids aren't fixed. */
export const AD_PRODUCTS: Record<string, "google" | "meta"> = {
  "Google PPC Ad Campaign": "google",
  "Meta Ad Campaign": "meta",
};

/** Within this many miles of a same-trade client's edge counts as "close", not clear. */
export const CLOSE_MARGIN_MILES = 5;
export const DEFAULT_RADIUS_MILES = 15;
export const MAX_RADIUS_MILES = 100;

// leads.business_type is free text ("Roofer", "Roofing & Building", "Resin driveways"),
// so compare trades through a small normaliser rather than exact strings.
const TRADES: [RegExp, string][] = [
  [/roof/i, "roofing"],
  [/drive|paving|resin|tarmac|block pav/i, "driveways"],
  [/electric|spark/i, "electrical"],
  [/plumb|heating|gas|boiler/i, "plumbing"],
  [/landscap|garden|fencing/i, "landscaping"],
  [/window|glaz|door/i, "glazing"],
  [/build|construct|extension|brick/i, "building"],
  [/clean|jet ?wash|pressure wash/i, "cleaning"],
  [/caravan|motorhome/i, "caravans"],
];
export function normaliseTrade(s: string): string {
  const t = String(s || "").trim();
  if (!t) return "";
  for (const [re, name] of TRADES) if (re.test(t)) return name;
  return t.toLowerCase();
}

export interface CoverageArea {
  id: number; place: string; place_label: string; lat: number; lng: number; radius_miles: number;
}
export interface AdClient {
  project_id: number; lead_id: number; business_name: string; business_type: string; trade: string;
  platforms: ("google" | "meta")[]; monthly: number; areas: CoverageArea[];
}

/** Live clients with a sold/delivered Google or Meta ads product, with their coverage. */
export async function listAdClients(db: Client): Promise<AdClient[]> {
  const names = Object.keys(AD_PRODUCTS);
  const rows = all(await db.execute({
    sql: `SELECT p.id AS project_id, l.id AS lead_id, COALESCE(l.business_name, '') AS business_name,
                 COALESCE(l.business_type, '') AS business_type, sc.name AS product,
                 COALESCE(es.monthly_upcharge, sc.monthly_price, 0) AS monthly
            FROM entity_solutions es
            JOIN solutions_catalogue sc ON sc.id = es.solution_id
            JOIN leads l ON l.id = es.entity_id
            JOIN projects p ON p.lead_id = l.id
           WHERE es.entity_type = 'lead' AND es.status IN ('sold', 'delivered')
             AND sc.name IN (${names.map(() => "?").join(",")})
             AND p.stage IN ${CLIENT_STAGES}
             AND (p.client_status != 'lost' OR p.client_status IS NULL)
           ORDER BY l.business_name`,
    args: names,
  }));

  const byProject = new Map<number, AdClient>();
  for (const r of rows) {
    const pid = Number(r.project_id);
    let c = byProject.get(pid);
    if (!c) {
      c = {
        project_id: pid, lead_id: Number(r.lead_id), business_name: String(r.business_name),
        business_type: String(r.business_type), trade: normaliseTrade(String(r.business_type)),
        platforms: [], monthly: 0, areas: [],
      };
      byProject.set(pid, c);
    }
    const platform = AD_PRODUCTS[String(r.product)];
    if (platform && !c.platforms.includes(platform)) c.platforms.push(platform);
    c.monthly += Number(r.monthly) || 0;
  }
  if (!byProject.size) return [];

  const ids = [...byProject.keys()];
  const areas = all(await db.execute({
    sql: `SELECT id, project_id, place, place_label, lat, lng, radius_miles
            FROM ad_coverage WHERE project_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`,
    args: ids,
  }));
  for (const a of areas) {
    byProject.get(Number(a.project_id))?.areas.push({
      id: Number(a.id), place: String(a.place), place_label: String(a.place_label || ""),
      lat: Number(a.lat), lng: Number(a.lng), radius_miles: Number(a.radius_miles),
    });
  }
  return [...byProject.values()];
}

export interface Conflict {
  project_id: number; business_name: string; trade: string; place: string;
  distance_miles: number; radius_miles: number; gap_miles: number; overlaps: boolean;
}
export type Verdict = "clear" | "taken" | "close" | "check";

/**
 * Is a prospect's area free for a new ad client in this trade?
 * "check" = no clash found, but a same-area ad client has no trade recorded,
 * so the answer can't honestly be "clear".
 */
export function checkArea(clients: AdClient[], centre: LatLng, trade: string, radius: number) {
  const want = normaliseTrade(trade);
  const conflicts: Conflict[] = [];
  const unknownTrade: Conflict[] = [];
  for (const c of clients) {
    const sameTrade = !want || !c.trade || c.trade === want;
    if (!sameTrade) continue;
    // Nearest of this client's towns, measured edge to edge.
    let best: Conflict | null = null;
    for (const a of c.areas) {
      const d = haversineMiles(centre, a);
      const gap = d - (radius + a.radius_miles);
      if (!best || gap < best.gap_miles) {
        best = {
          project_id: c.project_id, business_name: c.business_name, trade: c.trade, place: a.place,
          distance_miles: Math.round(d * 10) / 10, radius_miles: a.radius_miles,
          gap_miles: Math.round(gap * 10) / 10, overlaps: gap < 0,
        };
      }
    }
    if (!best || best.gap_miles > CLOSE_MARGIN_MILES) continue;
    (c.trade ? conflicts : unknownTrade).push(best);
  }
  conflicts.sort((a, b) => a.gap_miles - b.gap_miles);
  unknownTrade.sort((a, b) => a.gap_miles - b.gap_miles);
  const verdict: Verdict = conflicts.some((c) => c.overlaps) ? "taken"
    : conflicts.length ? "close"
    : unknownTrade.length ? "check" : "clear";
  return { verdict, trade: want, conflicts, unknown_trade: unknownTrade };
}

// ── Geocoding a town or postcode ──────────────────────────────────────────────
// Postcodes go to postcodes.io (exact, free, no key); town names to Nominatim,
// the same service src/lib/geocode.ts uses, with the matched name kept so a
// wrong match is visible to Jay.

const USER_AGENT = "innov8-crm/1.0 (contact: jamesrbarlow1997@gmail.com)";
const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export interface Resolved { lat: number; lng: number; label: string }

export async function resolvePlace(input: string): Promise<Resolved | null> {
  const q = input.trim();
  if (!q) return null;
  try {
    if (FULL_POSTCODE.test(q) || OUTCODE.test(q)) {
      const compact = q.replace(/\s+/g, "").toUpperCase();
      const url = FULL_POSTCODE.test(q)
        ? `https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`
        : `https://api.postcodes.io/outcodes/${encodeURIComponent(compact)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.status >= 500 || res.status === 429) throw new TransientGeocodeError(`postcodes.io ${res.status}`);
      if (!res.ok) return null;
      const r = (await res.json())?.result;
      if (!r || !Number.isFinite(r.latitude)) return null;
      const where = r.admin_district ? (Array.isArray(r.admin_district) ? r.admin_district[0] : r.admin_district) : "";
      return { lat: r.latitude, lng: r.longitude, label: `${compact}${where ? `, ${where}` : ""}` };
    }
    const query = /\b(uk|united kingdom|england|scotland|wales|northern ireland)\b/i.test(q) ? q : `${q}, UK`;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=gb`,
      { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-GB" }, signal: AbortSignal.timeout(5000) },
    );
    if (res.status === 429 || res.status >= 500) throw new TransientGeocodeError(`Nominatim ${res.status}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
    if (!Array.isArray(data) || !data.length) return null;
    const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // "Kilmarnock, East Ayrshire, Scotland, KA1 1HB, United Kingdom" → first three parts
    const label = String(data[0].display_name || q).split(",").slice(0, 3).map((s) => s.trim()).join(", ");
    return { lat, lng, label };
  } catch (e) {
    if (e instanceof TransientGeocodeError) throw e;
    throw new TransientGeocodeError(e instanceof Error ? e.message : "lookup failed");
  }
}

/** "25 miles", "25mi", "40km", "30 minutes" → miles, or null when it isn't a distance. */
export function parseRadiusMiles(text: string): number | null {
  const m = String(text || "").toLowerCase().match(/(\d+(?:\.\d+)?)\s*(miles?|mi\b|km|kilomet)/);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2].startsWith("k") ? 0.621371 : 1);
  return n > 0 && n <= MAX_RADIUS_MILES ? Math.round(n) : null;
}
