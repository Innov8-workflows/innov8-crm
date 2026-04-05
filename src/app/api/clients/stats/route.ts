import { NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

const ACTIVE_FILTER = "completed_at != '' AND (client_status IN ('active', 'refine') OR client_status IS NULL)";

export async function GET() {
  await initDb();
  const db = getClient();

  const today = new Date().toISOString().split("T")[0];

  const [mrrResult, capexResult, countResult, overdueResult, lostResult] = await Promise.all([
    // MRR from active clients only
    db.execute(`SELECT COALESCE(SUM(monthly_fee), 0) as total FROM projects WHERE ${ACTIVE_FILTER}`),
    // CAPEX from active clients only
    db.execute(
      `SELECT COALESCE(SUM(l.capex), 0) as total FROM leads l JOIN projects p ON p.lead_id = l.id WHERE p.${ACTIVE_FILTER}`
    ),
    // Active client count
    db.execute(`SELECT COUNT(*) as total FROM projects WHERE ${ACTIVE_FILTER}`),
    // Overdue renewals (active only)
    db.execute({
      sql: `SELECT COUNT(*) as total FROM projects WHERE ${ACTIVE_FILTER} AND renewal_date != '' AND renewal_date < ?`,
      args: [today],
    }),
    // Lost client count
    db.execute("SELECT COUNT(*) as total FROM projects WHERE completed_at != '' AND client_status = 'lost'"),
  ]);

  return NextResponse.json({
    mrr: (first(mrrResult)?.total as number) || 0,
    capex: (first(capexResult)?.total as number) || 0,
    clientCount: (first(countResult)?.total as number) || 0,
    overdueRenewals: (first(overdueResult)?.total as number) || 0,
    lostClients: (first(lostResult)?.total as number) || 0,
  });
}
