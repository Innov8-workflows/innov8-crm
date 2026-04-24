import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import { geocodeUK, sleep, GEOCODE_FAILED_SENTINEL } from "@/lib/geocode";

// Extend Vercel timeout to 60s (Hobby plan max). Default 10s is too short
// for bulk geocoding with Nominatim's 1 req/sec limit.
export const maxDuration = 60;

// Batch-geocodes all leads that have a location but no lat/lng yet.
// Idempotent: safe to re-run. Only picks up NULL lat rows.
// Rate-limited at 1 request per 1.05 seconds to comply with Nominatim policy.
//
// With maxDuration=60s, we safely process ~15 locations per call.
// Client loops calling this until remaining=0.
export async function POST(_request: NextRequest) {
  await initDb();
  const db = getClient();

  // Get all unique locations that need geocoding
  const result = await db.execute({
    sql: `SELECT DISTINCT location FROM leads
          WHERE lat IS NULL AND location IS NOT NULL AND location != ''
          ORDER BY location`,
  });
  const locations = all(result).map((r) => r.location as string);

  if (locations.length === 0) {
    return NextResponse.json({ geocoded: 0, failed: 0, remaining: 0, total_pending: 0 });
  }

  // Within 60s budget: 15 locations × (~1s Nominatim + 1.05s sleep) ≈ 30s, safe margin.
  const MAX_PER_CALL = 15;
  const batch = locations.slice(0, MAX_PER_CALL);

  let geocoded = 0;
  let failed = 0;

  // Hard deadline to abort before Vercel kills us (leave 5s safety margin)
  const startTime = Date.now();
  const DEADLINE_MS = 55_000;

  for (let i = 0; i < batch.length; i++) {
    if (Date.now() - startTime > DEADLINE_MS) break;

    const location = batch[i];
    // Respect 1 req/sec limit
    if (i > 0) await sleep(1050);

    const result = await geocodeUK(location);
    if (result) {
      await db.execute({
        sql: "UPDATE leads SET lat = ?, lng = ? WHERE location = ? AND lat IS NULL",
        args: [result.lat, result.lng, location],
      });
      geocoded++;
    } else {
      // Mark as failed with sentinel so we don't retry this specific location
      await db.execute({
        sql: "UPDATE leads SET lat = ?, lng = ? WHERE location = ? AND lat IS NULL",
        args: [GEOCODE_FAILED_SENTINEL, GEOCODE_FAILED_SENTINEL, location],
      });
      failed++;
    }
  }

  const processed = geocoded + failed;
  return NextResponse.json({
    geocoded,
    failed,
    remaining: Math.max(0, locations.length - processed),
    total_pending: locations.length,
  });
}

// GET returns how many leads still need geocoding — lightweight status check
export async function GET() {
  await initDb();
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT COUNT(DISTINCT location) as v FROM leads
          WHERE lat IS NULL AND location IS NOT NULL AND location != ''`,
  });
  const pending = Number(all(result)[0]?.v) || 0;
  return NextResponse.json({ pending });
}
