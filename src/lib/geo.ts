// Distance on the Earth's surface. No dependencies — this is all the CRM needs.

export interface LatLng { lat: number; lng: number }

const EARTH_RADIUS_MILES = 3958.8;
export const METRES_PER_MILE = 1609.344;

/** Great-circle distance in miles (haversine). */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}
