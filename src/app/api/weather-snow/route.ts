import { NextResponse } from "next/server";

// Is it snowing in Derbyshire right now? Asks Open-Meteo (free, no key) about Matlock,
// the county town, for the CRM's seasonal snow. Session-guarded by the middleware.
// Cached for 30 minutes, and any failure just means no snow on screen.
const MATLOCK = "https://api.open-meteo.com/v1/forecast?latitude=53.14&longitude=-1.56&current=weather_code";
const SNOW_CODES = [71, 73, 75, 77, 85, 86];    // WMO: snowfall, snow grains, snow showers

export async function GET() {
  try {
    const res = await fetch(MATLOCK, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(4000) });
    const data = res.ok ? await res.json() : null;
    return NextResponse.json({ snowing: SNOW_CODES.includes(Number(data?.current?.weather_code)) });
  } catch {
    return NextResponse.json({ snowing: false });
  }
}
