import { NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { getClientStats } from "@/lib/statsQueries";
import { buildStreak } from "@/lib/salesStreak";

// Live figures for the Celebrations layer and the Today page streak. MRR and the client
// count are the same numbers the Today page shows. Session-guarded by the middleware.
export async function GET() {
  await initDb();
  const db = getClient();
  const [money, streak] = await Promise.all([getClientStats(db, null), buildStreak(db)]);
  return NextResponse.json({ mrr: money.mrr, clients: money.clientCount, streak }, { headers: { "Cache-Control": "no-store" } });
}
