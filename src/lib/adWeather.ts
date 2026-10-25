import type { Client } from "@libsql/client";
import { all } from "@/lib/db";
import { listAdClients, resolvePlace } from "@/lib/adCoverage";

// Weather for the morning brief's "Ad ideas" section. Roofing leads follow the
// weather: a storm warning is the moment for a "get it checked before it hits"
// ad, the days after are for "storm damage?", a run of heavy rain brings leaks,
// a first frost brings flashing and gutter jobs. So each morning the brief task
// gets a 7-day outlook for every ad client's own towns plus the Met Office's live
// warnings, and Claude turns that into what Jay should prepare and when.
//
// Both sources are free and keyless: Open-Meteo (one request for every town) and
// the Met Office warnings RSS. Either can fail; the brief must still go out, so
// a failure becomes a note in the payload, never an error.

const UA = "innov8-crm/1.0 (contact: jamesrbarlow1997@gmail.com)";
const MAX_POINTS_PER_CLIENT = 4;   // a client's ad towns, sampled: enough to catch a coastal gust
const FORECAST_DAYS = 7;

export interface DayOutlook {
  date: string; gust_mph: number; rain_mm: number; snow_cm: number; min_c: number; flags: string[];
}
export interface AdClientWeather {
  project_id: number; name: string; trade: string; platforms: string[]; client_status: string;
  towns: string[]; location_source: "ad_coverage" | "client_location" | "none";
  days: DayOutlook[];
}
export interface MetOfficeWarning { title: string; detail: string; url: string }

// What turns a day into something worth an ad. Deliberately plain thresholds the
// brief can quote; gusts are the 10 m daily maximum, the figure forecasters use.
function flagsFor(d: Omit<DayOutlook, "flags">): string[] {
  const f: string[] = [];
  if (d.gust_mph >= 60) f.push("damaging gusts");
  else if (d.gust_mph >= 45) f.push("strong gusts");
  if (d.rain_mm >= 20) f.push("heavy rain");
  else if (d.rain_mm >= 10) f.push("wet day");
  if (d.snow_cm > 0) f.push("snow");
  if (d.min_c <= 0) f.push("frost");
  return f;
}

const r1 = (n: unknown) => Math.round((Number(n) || 0) * 10) / 10;

/** The 7-day outlook per ad client, worst value across that client's towns each day. */
async function forecast(points: { lat: number; lng: number }[]): Promise<Record<string, unknown>[]> {
  const url = "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${points.map((p) => p.lat.toFixed(4)).join(",")}` +
    `&longitude=${points.map((p) => p.lng.toFixed(4)).join(",")}` +
    "&daily=wind_gusts_10m_max,precipitation_sum,snowfall_sum,temperature_2m_min" +
    `&timezone=Europe%2FLondon&forecast_days=${FORECAST_DAYS}&wind_speed_unit=mph`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [data];   // one location comes back as an object, several as an array
}

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/** The Met Office's current UK warnings (RSS). Empty when there are none. */
export async function metOfficeWarnings(): Promise<MetOfficeWarning[]> {
  const res = await fetch("https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/UK", {
    headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Met Office ${res.status}`);
  const xml = await res.text();
  const out: MetOfficeWarning[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const pick = (tag: string) => decode((m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "");
    const title = pick("title");
    if (!title) continue;
    const url = pick("link");
    out.push({ title: title.slice(0, 200), detail: pick("description").slice(0, 400), url: /^https:\/\//.test(url) ? url : "" });
  }
  return out.slice(0, 40);
}

/** Every ad client with its towns and a 7-day outlook. A client with no ad towns
 *  falls back to the location on its lead record, so it is never silently skipped. */
export async function adClientWeather(db: Client): Promise<{ clients: AdClientWeather[]; error: string }> {
  const clients = await listAdClients(db);
  if (!clients.length) return { clients: [], error: "" };

  const ids = clients.map((c) => c.project_id);
  const extra = all(await db.execute({
    sql: `SELECT p.id, COALESCE(p.client_status, 'active') AS client_status, COALESCE(l.location, '') AS location
            FROM projects p JOIN leads l ON l.id = p.lead_id WHERE p.id IN (${ids.map(() => "?").join(",")})`,
    args: ids,
  }));
  const meta = new Map(extra.map((r) => [Number(r.id), { status: String(r.client_status), location: String(r.location) }]));

  const out: AdClientWeather[] = [];
  const points: { client: number; lat: number; lng: number }[] = [];
  for (const c of clients) {
    const m = meta.get(c.project_id) || { status: "active", location: "" };
    const row: AdClientWeather = {
      project_id: c.project_id, name: c.business_name, trade: c.trade, platforms: c.platforms,
      client_status: m.status, towns: [], location_source: "none", days: [],
    };
    if (c.areas.length) {
      row.location_source = "ad_coverage";
      row.towns = c.areas.map((a) => a.place_label || a.place);
      // Spread the sample across the list rather than taking the first few towns.
      const step = Math.max(1, Math.floor(c.areas.length / MAX_POINTS_PER_CLIENT));
      for (let i = 0; i < c.areas.length && points.filter((p) => p.client === out.length).length < MAX_POINTS_PER_CLIENT; i += step) {
        points.push({ client: out.length, lat: c.areas[i].lat, lng: c.areas[i].lng });
      }
    } else if (m.location) {
      try {
        const hit = await resolvePlace(m.location);
        if (hit) {
          row.location_source = "client_location";
          row.towns = [hit.label];
          points.push({ client: out.length, lat: hit.lat, lng: hit.lng });
        }
      } catch { /* geocoder down: the client is listed without weather rather than dropped */ }
    }
    out.push(row);
  }
  if (!points.length) return { clients: out, error: "no ad client has a town or location to forecast" };

  try {
    const results = await forecast(points);
    results.forEach((res, i) => {
      const p = points[i];
      const d = (res as { daily?: Record<string, unknown[]> }).daily;
      if (!p || !d || !Array.isArray(d.time)) return;
      const client = out[p.client];
      d.time.forEach((date, k) => {
        const day = {
          date: String(date),
          gust_mph: r1(d.wind_gusts_10m_max?.[k]), rain_mm: r1(d.precipitation_sum?.[k]),
          snow_cm: r1(d.snowfall_sum?.[k]), min_c: r1(d.temperature_2m_min?.[k]),
        };
        const cur = client.days[k];
        if (!cur) { client.days[k] = { ...day, flags: [] }; return; }
        cur.gust_mph = Math.max(cur.gust_mph, day.gust_mph);
        cur.rain_mm = Math.max(cur.rain_mm, day.rain_mm);
        cur.snow_cm = Math.max(cur.snow_cm, day.snow_cm);
        cur.min_c = Math.min(cur.min_c, day.min_c);
      });
    });
    for (const c of out) for (const d of c.days) d.flags = flagsFor(d);
    return { clients: out, error: "" };
  } catch (e) {
    return { clients: out, error: `forecast unavailable: ${e instanceof Error ? e.message : "error"}` };
  }
}
