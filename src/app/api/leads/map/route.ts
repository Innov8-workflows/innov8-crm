import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import { GEOCODE_FAILED_SENTINEL } from "@/lib/geocode";
import type { InValue } from "@libsql/client";

// Returns lightweight marker data for the Scrape Map view.
// Only leads with successfully geocoded coordinates are returned.
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const params = request.nextUrl.searchParams;

  const businessType = params.get("business_type");
  const status = params.get("status");
  const ownerFilter = params.get("owner");

  const conditions: string[] = [
    "lat IS NOT NULL",
    "lng IS NOT NULL",
    `lat != ${GEOCODE_FAILED_SENTINEL}`,
  ];
  const values: InValue[] = [];

  if (businessType && businessType !== "All") {
    conditions.push("business_type = ?");
    values.push(businessType);
  }
  if (status && status !== "All") {
    conditions.push("status = ?");
    values.push(status);
  }
  if (ownerFilter === "__unassigned__") {
    conditions.push("(owner = '' OR owner IS NULL)");
  } else if (ownerFilter) {
    conditions.push("owner = ?");
    values.push(ownerFilter);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  // Also return totals for the stats strip — one extra aggregate query is cheap
  const [markersResult, totalsResult] = await Promise.all([
    db.execute({
      sql: `SELECT id, business_name, contact_name, business_type, location, lat, lng, status, owner
            FROM leads ${where}
            ORDER BY id DESC`,
      args: values,
    }),
    db.execute(`SELECT
      COUNT(*) as total_leads,
      SUM(CASE WHEN lat IS NOT NULL AND lat != ${GEOCODE_FAILED_SENTINEL} THEN 1 ELSE 0 END) as geocoded,
      SUM(CASE WHEN lat IS NULL AND location != '' THEN 1 ELSE 0 END) as pending,
      COUNT(DISTINCT location) as unique_locations
      FROM leads`),
  ]);

  const markers = all(markersResult);
  const totalsRow = all(totalsResult)[0] || {};

  return NextResponse.json({
    markers,
    stats: {
      totalLeads: Number(totalsRow.total_leads) || 0,
      geocoded: Number(totalsRow.geocoded) || 0,
      pending: Number(totalsRow.pending) || 0,
      uniqueLocations: Number(totalsRow.unique_locations) || 0,
    },
  }, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
