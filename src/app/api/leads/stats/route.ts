import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { getLeadStats } from "@/lib/statsQueries";

// Aggregate SQL lives in src/lib/statsQueries.ts — shared with /api/bootstrap.
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  const stats = await getLeadStats(db, request.nextUrl.searchParams.get("owner"));

  const response = NextResponse.json(stats);
  // no-store: prospect monthly/capex are now product-driven — must reflect picker changes immediately.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
