import { NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { getClientLeadRollup } from "@/lib/clientReporting";

// Per-project lead counts for the client cards. Query lives in
// src/lib/clientReporting.ts — shared with /api/bootstrap so the first paint
// needs no extra round-trip; this route is the refresh path (LiveClients
// re-fetches it alongside the product rollup).
export async function GET() {
  await initDb();
  const db = getClient();
  const rollup = await getClientLeadRollup(db);
  return NextResponse.json({ rollup }, { headers: { "Cache-Control": "private, no-store" } });
}
