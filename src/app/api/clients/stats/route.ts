import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { getClientStats } from "@/lib/statsQueries";

// Aggregate SQL lives in src/lib/statsQueries.ts — shared with /api/bootstrap.
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  const stats = await getClientStats(db, request.nextUrl.searchParams.get("owner"));

  const response = NextResponse.json(stats);
  // no-store: now product-driven (hot-write via the picker) — must reflect changes immediately.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
