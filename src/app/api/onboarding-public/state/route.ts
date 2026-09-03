import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { getByToken, GONE, sqlNow } from "@/lib/onboarding";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// Everything the onboarding page needs to render, including a part-finished one.
//
// This route lives under /api/onboarding-public/ — a SIBLING of the admin tree,
// not a child. PUBLIC_PATHS is matched with startsWith, so an entry of
// "/api/onboarding" would open every admin endpoint under it. Keep them apart.

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const rl = rateLimit(`onboard-state:${clientIp(request)}`, 120, 15 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });

  await initDb();
  const db = getClient();
  const sub = await getByToken(db, token);
  // Unknown, expired and revoked all land here with one identical message.
  if (!sub) return NextResponse.json(GONE, { status: 404, headers: NO_STORE });

  const answers = first(await db.execute({
    sql: "SELECT answers_json FROM onboarding_answers WHERE submission_id = ?",
    args: [sub.id],
  }));

  // Assets carry enough for the UI to redraw a part-finished upload queue:
  // parts_done/parts_total is what turns "restart the 400MB video" into
  // "carry on from 62%".
  const assets = all(await db.execute({
    sql: `SELECT id, role, pair_id, sort_order, original_name, content_type, caption,
                 declared_size, actual_size, status, parts_done, parts_total, part_size
            FROM onboarding_assets
           WHERE submission_id = ? AND status != 'orphaned'
           ORDER BY role, sort_order, id`,
    args: [sub.id],
  }));

  // Attached submissions take the client's name from the CRM; ones that came in
  // through the shared link have no project yet, so they show what was typed on
  // the start page.
  const business = sub.project_id
    ? first(await db.execute({
        sql: `SELECT l.business_name FROM projects p
                JOIN leads l ON l.id = p.lead_id WHERE p.id = ? LIMIT 1`,
        args: [sub.project_id],
      }))
    : null;

  return NextResponse.json({
    status: sub.status,
    // Which questionnaire to render. Without this the form has no way to know,
    // and every token would open the website questions.
    kind: sub.kind,
    schema_version: sub.schema_version,
    business_name: (business?.business_name as string) || sub.label || "",
    answers: JSON.parse((answers?.answers_json as string) || "{}"),
    assets,
    server_time: sqlNow(),
  }, { headers: NO_STORE });
}
