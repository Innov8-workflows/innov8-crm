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

// Thrown for transient errors (rate limits, timeouts, 5xx) so callers can
// skip the FAILED_SENTINEL write and retry on the next batch.
export class TransientGeocodeError extends Error {}

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
      // 5s timeout — keeps the batch endpoint within Vercel's 60s budget
      signal: AbortSignal.timeout(5_000),
    });
    // Distinguish transient (retry-worthy) from definitive failure
    if (res.status === 429 || res.status >= 500) {
      throw new TransientGeocodeError(`Nominatim ${res.status}`);
    }
    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;

    const { lat, lon } = data[0];
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lon);
    if (!isFinite(latNum) || !isFinite(lngNum)) return null;

    return { lat: latNum, lng: lngNum };
  } catch (err) {
    // Re-throw transient errors so the batch endpoint can skip the sentinel write
    if (err instanceof TransientGeocodeError) throw err;
    // Network errors, abort/timeout — also treat as transient (don't burn the location)
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new TransientGeocodeError("Nominatim timeout");
    }
    if (err instanceof TypeError) {
      // Network failure (fetch typeerror) — transient
      throw new TransientGeocodeError("Nominatim network error");
    }
    return null;
  }
}

// Sleep helper used between geocode calls to stay under the 1 req/sec limit.
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
