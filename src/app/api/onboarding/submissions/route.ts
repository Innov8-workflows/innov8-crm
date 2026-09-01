import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { mintToken, mintFetchKey, sqlNow } from "@/lib/onboarding";
import { SCHEMA_ID } from "@/lib/onboardingSchema";

// Admin side of onboarding: mint a link, list submissions, revoke one.
// Session-guarded by the middleware — deliberately NOT in PUBLIC_PATHS.

const NO_STORE = { "Cache-Control": "private, no-store" };
const LINK_DAYS = 45;

/**
 * The list is deliberately narrow: it never touches onboarding_answers. That
 * table holds the one wide column, and reading it per row here would put a
 * multi-KB blob walk on the rail's hot path — the same shape as the ~30s
 * incident documented at the top of src/lib/projectCache.ts.
 */
export async function GET(request: NextRequest) {
  // Archived submissions are hidden unless asked for. They are almost always
  // Jay's own tests, and a rail full of those is a rail he stops reading.
  const showArchived = request.nextUrl.searchParams.get("archived") === "1";
  await initDb();
  const db = getClient();
  const rows = all(await db.execute({
    sql: `SELECT s.id, s.project_id, s.token, s.status, s.expires_at, s.submitted_at,
                 s.fetched_at, s.asset_count, s.bytes_declared, s.created_at, s.updated_at,
                 -- LEFT JOIN, and COALESCE onto the label: a submission from the
                 -- shared link has no project, and an inner join would hide it
                 -- entirely — which is precisely the pile Jay needs to see.
                 COALESCE(l.business_name, s.label, '') AS business_name,
                 s.label, s.archived, s.queued_at, s.build_folder, s.build_started_at, s.build_result,
                 (SELECT COUNT(*) FROM onboarding_assets a
                   WHERE a.submission_id = s.id AND a.status = 'stored') AS stored,
                 (SELECT COUNT(*) FROM onboarding_assets a
                   WHERE a.submission_id = s.id AND a.status = 'failed') AS failed
            FROM onboarding_submissions s
            LEFT JOIN projects p ON p.id = s.project_id
            LEFT JOIN leads l    ON l.id = p.lead_id
           WHERE (? = 1 OR s.archived = 0)
           ORDER BY (s.project_id IS NULL) DESC, s.created_at DESC
           LIMIT 200`,
    args: [showArchived ? 1 : 0],
  }));
  return NextResponse.json({ submissions: rows }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  let body: { project_id?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const projectId = Number(body.project_id);
  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });

  await initDb();
  const db = getClient();
  const project = first(await db.execute({ sql: "SELECT id FROM projects WHERE id = ?", args: [projectId] }));
  if (!project) return NextResponse.json({ error: "unknown project" }, { status: 404 });

  // Re-issuing for a project that already has a live link returns the SAME one
  // rather than minting a second — otherwise a client who has half-filled the
  // first would silently lose it when Jay copies the link again.
  const existing = first(await db.execute({
    sql: `SELECT id, token FROM onboarding_submissions
           WHERE project_id = ? AND status IN ('open','submitted') AND expires_at > ?
           ORDER BY created_at DESC LIMIT 1`,
    args: [projectId, sqlNow()],
  }));
  if (existing) {
    return NextResponse.json({ id: existing.id, token: existing.token, reused: true }, { headers: NO_STORE });
  }

  const now = sqlNow();
  const token = mintToken();
  const ins = await db.execute({
    sql: `INSERT INTO onboarding_submissions
            (project_id, token, fetch_key, schema_version, status, r2_prefix, expires_at, created_at, updated_at)
          VALUES (?,?,?,?, 'open', '', ?, ?, ?)`,
    args: [projectId, token, mintFetchKey(), SCHEMA_ID, sqlNow(LINK_DAYS), now, now],
  });
  const id = Number(ins.lastInsertRowid);
  // r2_prefix needs the id, so it's set once the row exists. One place decides
  // object layout; nothing else may compose a key.
  await db.execute({
    sql: "UPDATE onboarding_submissions SET r2_prefix = ? WHERE id = ?",
    args: [`onboarding/${id}/`, id],
  });

  return NextResponse.json({ id, token, reused: false }, { status: 201, headers: NO_STORE });
}

export async function PUT(request: NextRequest) {
  let body: { id?: number; action?: string; project_id?: number; folder?: string; note?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await initDb();
  const db = getClient();
  const now = sqlNow();

  // Attach a shared-link submission to a real project. This is the step the
  // per-client link does automatically; for the shared link Jay does it here.
  if (body.action === "assign") {
    const projectId = Number((body as { project_id?: number }).project_id);
    if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });
    const project = first(await db.execute({ sql: "SELECT id FROM projects WHERE id = ?", args: [projectId] }));
    if (!project) return NextResponse.json({ error: "unknown project" }, { status: 404 });
    await db.execute({
      sql: "UPDATE onboarding_submissions SET project_id = ?, updated_at = ? WHERE id = ?",
      args: [projectId, now, id],
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  // Hand it to the runner. The folder is the client's existing demo folder —
  // the build-out runs inside it rather than starting a new project.
  if (body.action === "queue") {
    const folder = String(body.folder || "").trim().slice(0, 400);
    if (!folder) return NextResponse.json({ error: "folder required" }, { status: 400 });
    await db.execute({
      sql: `UPDATE onboarding_submissions
               SET queued_at = ?, build_folder = ?, build_note = ?,
                   build_started_at = '', build_result = '', updated_at = ?
             WHERE id = ?`,
      args: [now, folder, String(body.note || "").slice(0, 1000), now, id],
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  if (body.action === "unqueue") {
    await db.execute({
      sql: "UPDATE onboarding_submissions SET queued_at = '', build_started_at = '', updated_at = ? WHERE id = ?",
      args: [now, id],
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  if (body.action === "archive" || body.action === "unarchive") {
    await db.execute({
      sql: "UPDATE onboarding_submissions SET archived = ?, updated_at = ? WHERE id = ?",
      args: [body.action === "archive" ? 1 : 0, now, id],
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  if (body.action === "revoke") {
    await db.execute({
      sql: "UPDATE onboarding_submissions SET status = 'revoked', updated_at = ? WHERE id = ?",
      args: [now, id],
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  if (body.action === "accept") {
    await db.execute({
      sql: "UPDATE onboarding_submissions SET status = 'accepted', updated_at = ? WHERE id = ?",
      args: [now, id],
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  if (body.action === "extend") {
    await db.execute({
      sql: "UPDATE onboarding_submissions SET expires_at = ?, status = CASE WHEN status = 'revoked' THEN 'open' ELSE status END, updated_at = ? WHERE id = ?",
      args: [sqlNow(LINK_DAYS), now, id],
    });
    return NextResponse.json({ ok: true, expires_at: sqlNow(LINK_DAYS) }, { headers: NO_STORE });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
