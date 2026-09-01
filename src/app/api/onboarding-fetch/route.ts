import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { presign, isR2Configured } from "@/lib/r2";
import { sqlNow } from "@/lib/onboarding";
import { buildExport, type ExportAsset } from "@/lib/onboardingExport";

// The agent API. This is what a Claude Code session (or a cron job, or curl)
// talks to in order to pull a submission and its media down and start building.
//
// AUTH: x-innov8-key, and it FAILS CLOSED. Modelled on webhook/client-leads --
// a real 401 on a bad key -- and explicitly NOT on webhook/prospects, whose
// `if (secret) {...}` shape leaves the endpoint wide open whenever the env var
// happens to be unset. Here, unconfigured returns 503 and never 200.
//
// Two keys are accepted:
//   ONBOARDING_API_KEY  - the service key in Vercel. Sees every submission.
//                         This is what an agent session uses.
//   a submission's own fetch_key - scoped to that one submission, for handing
//                         to something that should only ever see one client.
//
// It lives at /api/onboarding-fetch, a SIBLING of /api/onboarding/. PUBLIC_PATHS
// is matched with startsWith, so a child path would have opened the admin tree.

export const maxDuration = 60;
const NO_STORE = { "Cache-Control": "private, no-store" };
/** An hour is plenty to pull 400MB and short enough that a stale manifest is inert. */
const URL_TTL = 3600;

function authorise(request: NextRequest): { ok: boolean; scopedTo?: string; status?: number; error?: string } {
  const configured = process.env.ONBOARDING_API_KEY;
  if (!configured) {
    return { ok: false, status: 503, error: "ONBOARDING_API_KEY is not set in Vercel — this endpoint is disabled." };
  }
  const key = request.headers.get("x-innov8-key") || "";
  if (!key) return { ok: false, status: 401, error: "missing x-innov8-key header" };
  if (key === configured) return { ok: true };
  if (/^of_[0-9a-f]{32}$/.test(key)) return { ok: true, scopedTo: key };
  return { ok: false, status: 401, error: "unknown key" };
}

export async function GET(request: NextRequest) {
  const auth = authorise(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  await initDb();
  const db = getClient();
  const id = Number(request.nextUrl.searchParams.get("id") || 0);

  // ---- the build queue ----------------------------------------------------
  // What the runner polls. Only ever returns work that is queued and NOT already
  // claimed by another run, so two runners cannot build the same site at once.
  if (!id && request.nextUrl.searchParams.get("queued") === "1") {
    const rows = all(await db.execute({
      sql: `SELECT s.id, s.build_folder, s.build_note, s.queued_at,
                   COALESCE(l.business_name, s.label, '') AS business_name
              FROM onboarding_submissions s
              LEFT JOIN projects p ON p.id = s.project_id
              LEFT JOIN leads l    ON l.id = p.lead_id
             WHERE s.queued_at != '' AND s.build_started_at = ''
               AND s.archived = 0 AND s.status != 'revoked'
             ORDER BY s.queued_at ASC LIMIT 10`,
    }));
    return NextResponse.json({ queued: rows }, { headers: NO_STORE });
  }

  // ---- list ---------------------------------------------------------------
  if (!id) {
    const status = request.nextUrl.searchParams.get("status") || "";
    const rows = all(await db.execute({
      sql: `SELECT s.id, s.project_id, s.status, s.submitted_at, s.fetched_at, s.created_at,
                   COALESCE(l.business_name, s.label, '') AS business_name,
                   (SELECT COUNT(*) FROM onboarding_assets a
                     WHERE a.submission_id = s.id AND a.status = 'stored') AS files
              FROM onboarding_submissions s
              LEFT JOIN projects p ON p.id = s.project_id
              LEFT JOIN leads l    ON l.id = p.lead_id
             WHERE s.status != 'revoked' AND s.archived = 0
               AND (? = '' OR s.status = ?)
               AND (? = '' OR s.fetch_key = ?)
             ORDER BY s.created_at DESC LIMIT 100`,
      args: [status, status, auth.scopedTo || "", auth.scopedTo || ""],
    }));
    return NextResponse.json({ submissions: rows }, { headers: NO_STORE });
  }

  // ---- one, in full -------------------------------------------------------
  const sub = first(await db.execute({
    sql: `SELECT s.*, COALESCE(l.business_name, s.label, '') AS business_name
            FROM onboarding_submissions s
            LEFT JOIN projects p ON p.id = s.project_id
            LEFT JOIN leads l    ON l.id = p.lead_id
           WHERE s.id = ? AND s.status != 'revoked' AND s.archived = 0 LIMIT 1`,
    args: [id],
  }));
  if (!sub) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  // A scoped key may only ever see its own submission.
  if (auth.scopedTo && sub.fetch_key !== auth.scopedTo) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  }

  const answersRow = first(await db.execute({
    sql: "SELECT answers_json FROM onboarding_answers WHERE submission_id = ?",
    args: [id],
  }));
  const answers = JSON.parse((answersRow?.answers_json as string) || "{}");

  const rows = all(await db.execute({
    sql: `SELECT role, pair_id, sort_order, r2_key, original_name, caption,
                 content_type, actual_size
            FROM onboarding_assets
           WHERE submission_id = ? AND status = 'stored'
           ORDER BY role, sort_order, id`,
    args: [id],
  }));

  const prefix = String(sub.r2_prefix || `onboarding/${id}/`);
  const assets: ExportAsset[] = rows.map((a) => ({
    role: String(a.role),
    pair_id: String(a.pair_id || ""),
    // The prefix is stripped so the LOCAL folder layout falls straight out of
    // the key layout — the download script mirrors, it never maps.
    path: String(a.r2_key).startsWith(prefix) ? String(a.r2_key).slice(prefix.length) : String(a.r2_key),
    filename: String(a.original_name || ""),
    caption: String(a.caption || ""),
    bytes: Number(a.actual_size || 0),
    content_type: String(a.content_type || ""),
    url: isR2Configured() ? presign({ method: "GET", key: String(a.r2_key), expiresIn: URL_TTL }) : null,
  }));

  await db.execute({
    sql: "UPDATE onboarding_submissions SET fetched_at = ? WHERE id = ?",
    args: [sqlNow(), id],
  });

  return NextResponse.json(
    { ...buildExport(sub, answers, assets), url_expires_in: URL_TTL },
    { headers: NO_STORE },
  );
}

/** Record that a site was built from this submission, so the CRM shows it. */
export async function POST(request: NextRequest) {
  const auth = authorise(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  let body: { id?: number; action?: string; url?: string; result?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const id = Number(body.id);
  const action = String(body.action || "");
  if (!id || !["claim", "built", "failed"].includes(action)) {
    return NextResponse.json({ error: "expected { id, action: 'claim' | 'built' | 'failed' }" },
      { status: 400, headers: NO_STORE });
  }

  await initDb();
  const db = getClient();
  const now = sqlNow();

  // Claiming is conditional on build_started_at still being empty, so if two
  // runners race, exactly one of them wins and the other is told to move on.
  if (action === "claim") {
    const res = await db.execute({
      sql: `UPDATE onboarding_submissions SET build_started_at = ?, updated_at = ?
             WHERE id = ? AND queued_at != '' AND build_started_at = ''`,
      args: [now, now, id],
    });
    const won = Number(res.rowsAffected) > 0;
    return NextResponse.json({ ok: won, claimed: won },
      { status: won ? 200 : 409, headers: NO_STORE });
  }

  if (action === "failed") {
    await db.execute({
      sql: `UPDATE onboarding_submissions
               SET build_result = ?, build_started_at = '', updated_at = ?
             WHERE id = ?`,
      args: [String(body.result || "failed").slice(0, 500), now, id],
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  await db.execute({
    sql: `UPDATE onboarding_submissions
             SET status = 'built', queued_at = '', build_result = ?, updated_at = ?
           WHERE id = ?`,
    args: [String(body.result || "built").slice(0, 500), now, id],
  });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
