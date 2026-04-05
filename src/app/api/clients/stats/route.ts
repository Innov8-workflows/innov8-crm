import { NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

export async function GET() {
  await initDb();
  const db = getClient();

  const today = new Date().toISOString().split("T")[0];

  // All stats in parallel
  const [mrrResult, capexResult, countResult, overdueResult] = await Promise.all([
    // Total MRR from completed projects
    db.execute("SELECT COALESCE(SUM(monthly_fee), 0) as total FROM projects WHERE completed_at != ''"),
    // Total CAPEX from leads with completed projects
    db.execute(
      "SELECT COALESCE(SUM(l.capex), 0) as total FROM leads l JOIN projects p ON p.lead_id = l.id WHERE p.completed_at != ''"
    ),
    // Client count
    db.execute("SELECT COUNT(*) as total FROM projects WHERE completed_at != ''"),
    // Overdue renewals
    db.execute({
      sql: "SELECT COUNT(*) as total FROM projects WHERE completed_at != '' AND renewal_date != '' AND renewal_date < ?",
      args: [today],
    }),
  ]);

  return NextResponse.json({
    mrr: (first(mrrResult)?.total as number) || 0,
    capex: (first(capexResult)?.total as number) || 0,
    clientCount: (first(countResult)?.total as number) || 0,
    overdueRenewals: (first(overdueResult)?.total as number) || 0,
  });
}
