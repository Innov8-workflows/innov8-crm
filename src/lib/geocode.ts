// OpenStreetMap Nominatim geocoding wrapper.
// Free, no API key, rate-limited to 1 req/sec.
// Always appends ", UK" to constrain results to the United Kingdom.

const USER_AGENT = "innov8-crm/1.0 (contact: jamesrbarlow1997@gmail.com)";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Sentinel value stored in lat when geocoding definitively fails.
// Prevents the batch endpoint from re-trying the same unresolvable location forever.
export const GEOCODE_FAILED_SENTINEL = -999;

export interface GeocodeResult {
  lat: number;
  lng: number;
}

export async function geocodeUK(location: string): Promise<GeocodeResult | null> {
  const trimmed = location.trim();
  if (!trimmed) return null;

  // Append ", UK" if not already present to bias to UK results
  const q = /\b(uk|united kingdom|england|scotland|wales)\b/i.test(trimmed)
    ? trimmed
    : `${trimmed}, UK`;

  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=gb`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-GB" },
      // 10s timeout via AbortController — Nominatim can be slow
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;

    const { lat, lon } = data[0];
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lon);
    if (!isFinite(latNum) || !isFinite(lngNum)) return null;

    return { lat: latNum, lng: lngNum };
  } catch {
    return null;
  }
}

// Sleep helper used between geocode calls to stay under the 1 req/sec limit.
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
