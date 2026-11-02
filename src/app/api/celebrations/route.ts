import { NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import { getClientStats } from "@/lib/statsQueries";
import { buildStreak } from "@/lib/salesStreak";

// Live figures for the Celebrations layer and the Today page streak. MRR is the figure
// the Today page shows. The client count includes the onboarding stage, which Today's
// paying-client count leaves out, because a client just won starts there.
// Session-guarded by the middleware.
export async function GET() {
  await initDb();
  const db = getClient();
  const [money, streak, clients] = await Promise.all([
    getClientStats(db, null),
    buildStreak(db),
    db.execute("SELECT COUNT(*) AS n FROM projects WHERE client_status IN ('active','refine') OR client_status IS NULL"),
  ]);
  return NextResponse.json({ mrr: money.mrr, clients: Number(first(clients)?.n) || 0, streak }, { headers: { "Cache-Control": "no-store" } });
}
