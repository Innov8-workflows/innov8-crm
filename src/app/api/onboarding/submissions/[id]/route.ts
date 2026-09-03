import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { presign, isR2Configured, r2Request } from "@/lib/r2";
import { sqlNow } from "@/lib/onboarding";
import { formFor, missingFor } from "@/lib/onboardingSchema";

// One submission in full, for the CRM's Onboarding view. Session-guarded.
//
// This is the ONLY place that reads onboarding_answers, and only ever for a
// single row — the list endpoint deliberately never touches it. See the header
// of src/lib/projectCache.ts for why a wide column must not sit on a list path.

const NO_STORE = { "Cache-Control": "private, no-store" };
/** Short: these are handed to a browser and land in a page Jay leaves open. */
const VIEW_URL_TTL = 3600;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const subId = Number(id);
  if (!subId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  await initDb();
  const db = getClient();

  const sub = first(await db.execute({
    sql: `SELECT s.*, COALESCE(l.business_name, s.label, '') AS business_name
            FROM onboarding_submissions s
            LEFT JOIN projects p ON p.id = s.project_id
            LEFT JOIN leads l    ON l.id = p.lead_id
           WHERE s.id = ? LIMIT 1`,
    args: [subId],
  }));
  if (!sub) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Opening it is what "seen" means, so the badge clears by reading, not by a
  // separate dismiss action nobody would remember to press.
  if (!sub.seen_at) {
    await db.execute({
      sql: "UPDATE onboarding_submissions SET seen_at = ? WHERE id = ? AND seen_at = ''",
      args: [sqlNow(), subId],
    });
  }

  const answersRow = first(await db.execute({
    sql: "SELECT answers_json FROM onboarding_answers WHERE submission_id = ?",
    args: [subId],
  }));
  const answers = JSON.parse((answersRow?.answers_json as string) || "{}") as Record<string, unknown>;

  const assets = all(await db.execute({
    sql: `SELECT id, role, pair_id, sort_order, original_name, content_type, caption,
                 declared_size, actual_size, status, r2_key, parts_done, parts_total
            FROM onboarding_assets WHERE submission_id = ?
           ORDER BY role, sort_order, id`,
    args: [subId],
  }));

  // Thumbnails/previews are short-lived signed URLs. The bucket stays private:
  // there is no stable address for any of these objects, ever.
  const withUrls = assets.map((a) => ({
    ...a,
    r2_key: undefined,
    url: isR2Configured() && a.status === "stored"
      ? presign({ method: "GET", key: String(a.r2_key), expiresIn: VIEW_URL_TTL })
      : null,
  }));

  // What Jay would otherwise have to work out by eye before chasing the client.
  const form = formFor(String(sub.kind || ""));
  const missing = missingFor(
    form,
    answers,
    assets.filter((a) => a.status === "stored").map((a) => String(a.role)),
  );

  // Answers that are evidence for a claim are reported for confirmation, never
  // promoted automatically. A claim means Jay saw the certificate — the whole
  // safety model in site-kit's check.js rests on that, and two live clients are
  // on record as NOT insured.
  const claimAnswers = Object.entries(answers)
    .filter(([k]) => form.fields[k]?.claimGated)
    .filter(([, v]) => String(v ?? "").trim() !== "")
    .map(([k, v]) => ({ id: k, label: form.fields[k].label, value: String(v) }));

  delete (sub as Record<string, unknown>).fetch_key;   // never to the browser

  return NextResponse.json({
    submission: sub,
    answers,
    assets: withUrls,
    missing,
    confirm: claimAnswers,
    server_time: sqlNow(),
  }, { headers: NO_STORE });
}


/**
 * Delete a submission for good: its R2 objects, its media rows, its answers and
 * the submission itself.
 *
 * ONLY works on an ARCHIVED submission. That is the whole safety design — it
 * makes deletion a deliberate two-step (archive, then delete) instead of one
 * mis-click next to "Revoke", and there is no undo here at all.
 *
 * The files are cleared FIRST and explicitly. Two reasons:
 *   1. Orphaned objects in R2 are invisible and cost money forever, because
 *      nothing else in the system knows their keys once the rows are gone.
 *   2. SQLite foreign keys are OFF by default on this database — verified when
 *      the schema was written, where a cascade only fired after an explicit
 *      PRAGMA. So ON DELETE CASCADE cannot be relied on, and every child table
 *      is deleted by hand and in order.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const subId = Number(id);
  if (!subId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  // The PIN lives in Vercel, never in this repo — the repo is public.
  //
  // What it is for: stopping Jay destroying a real client's submission by
  // mis-clicking. It is NOT an access control. Anyone reaching this route has
  // already passed the session check and could hold the PIN too; the value is
  // that permanent deletion needs a deliberate act rather than a stray click
  // next to Revoke.
  //
  // Fails CLOSED when unset — 503, never "allow because it isn't configured",
  // which is the shape that quietly left /api/webhook/prospects wide open.
  const pin = process.env.ONBOARDING_DELETE_PIN;
  if (!pin) {
    return NextResponse.json(
      { error: "ONBOARDING_DELETE_PIN is not set in Vercel, so nothing can be deleted." },
      { status: 503, headers: NO_STORE },
    );
  }
  if ((request.headers.get("x-delete-pin") || "") !== pin) {
    return NextResponse.json({ error: "Wrong PIN." }, { status: 401, headers: NO_STORE });
  }

  await initDb();
  const db = getClient();

  const sub = first(await db.execute({
    sql: "SELECT id, archived, label FROM onboarding_submissions WHERE id = ? LIMIT 1",
    args: [subId],
  }));
  if (!sub) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (Number(sub.archived) !== 1) {
    return NextResponse.json(
      { error: "Archive it first. Deleting is only possible on an archived submission." },
      { status: 409, headers: NO_STORE },
    );
  }

  const assets = all(await db.execute({
    sql: "SELECT id, r2_key, upload_id, status FROM onboarding_assets WHERE submission_id = ?",
    args: [subId],
  }));

  let filesDeleted = 0;
  const fileErrors: string[] = [];
  if (isR2Configured()) {
    for (const a of assets) {
      const key = String(a.r2_key || "");
      if (!key) continue;
      try {
        // An upload that never completed leaves parts behind that a plain
        // DELETE does not touch; abort it so R2 releases them now rather than
        // waiting on the 7-day lifecycle rule.
        if (a.upload_id && a.status !== "stored") {
          await r2Request("DELETE", key, { query: { uploadId: String(a.upload_id) } });
        }
        const res = await r2Request("DELETE", key);
        if (res.ok || res.status === 404) filesDeleted++;
        else fileErrors.push(`${key}: ${res.status}`);
      } catch (e) {
        fileErrors.push(`${key}: ${(e as Error).message}`);
      }
    }
  }

  // Children first, parent last — see the note above about cascades.
  for (const a of assets) {
    await db.execute({ sql: "DELETE FROM onboarding_asset_parts WHERE asset_id = ?", args: [Number(a.id)] });
  }
  await db.batch([
    { sql: "DELETE FROM onboarding_assets WHERE submission_id = ?", args: [subId] },
    { sql: "DELETE FROM onboarding_answers WHERE submission_id = ?", args: [subId] },
    { sql: "DELETE FROM onboarding_submissions WHERE id = ?", args: [subId] },
  ], "write");

  return NextResponse.json(
    { ok: true, deleted: { submission: subId, assets: assets.length, files: filesDeleted },
      file_errors: fileErrors },
    { headers: NO_STORE },
  );
}
