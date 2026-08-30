import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import { CLIENT_STAGES } from "@/lib/statsQueries";

// Every client with its won date, the date we GUESSED for it, and its current MRR —
// the data behind the "fix won dates" chore. Won dates were backfilled from
// date(created_at), which is right for most clients and wrong for any created by
// hand or by import, so Jay corrects them once.
//
// GET only. Writes go through the existing PUT /api/projects/[id], which already
// whitelists and validates these fields — no new write surface for the sake of one
// modal.

export async function GET(_request: NextRequest) {
  await initDb();
  const db = getClient();

  const rows = all(await db.execute({
    sql: `SELECT p.id AS project_id,
                 l.business_name,
                 COALESCE(p.won_at,'')        AS won_at,
                 COALESCE(p.lost_at,'')       AS lost_at,
                 COALESCE(p.client_status,'') AS client_status,
                 COALESCE(date(p.created_at),'') AS suggested_won_at,
                 COALESCE((SELECT SUM(es.monthly_upcharge) FROM entity_solutions es
                           WHERE es.entity_type = 'lead' AND es.entity_id = l.id
                             AND es.status != 'declined'), 0) AS monthly
          FROM projects p JOIN leads l ON p.lead_id = l.id
          WHERE p.stage IN ${CLIENT_STAGES}
          ORDER BY COALESCE(NULLIF(p.won_at,''), date(p.created_at)) ASC, l.business_name ASC`,
    args: [],
  }));

  return NextResponse.json({
    clients: rows.map((r) => ({
      project_id: Number(r.project_id),
      business_name: String(r.business_name || ""),
      won_at: String(r.won_at || ""),
      lost_at: String(r.lost_at || ""),
      client_status: String(r.client_status || ""),
      suggested_won_at: String(r.suggested_won_at || ""),
      monthly: Number(r.monthly) || 0,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
