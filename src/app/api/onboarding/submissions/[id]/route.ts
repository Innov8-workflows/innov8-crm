import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { presign, isR2Configured } from "@/lib/r2";
import { sqlNow } from "@/lib/onboarding";
import { REQUIRED, FIELDS } from "@/lib/onboardingSchema";

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
  const missing = REQUIRED.filter((fid) => {
    const f = FIELDS[fid];
    if (f?.type === "upload") {
      return !assets.some((a) => a.role === f.upload!.role && a.status === "stored");
    }
    const v = answers[fid];
    return v === undefined || v === null || String(v).trim() === "";
  }).map((fid) => ({ id: fid, label: FIELDS[fid]?.label || fid }));

  // Answers that are evidence for a claim are reported for confirmation, never
  // promoted automatically. A claim means Jay saw the certificate — the whole
  // safety model in site-kit's check.js rests on that, and two live clients are
  // on record as NOT insured.
  const claimAnswers = Object.entries(answers)
    .filter(([k]) => FIELDS[k]?.claimGated)
    .filter(([, v]) => String(v ?? "").trim() !== "")
    .map(([k, v]) => ({ id: k, label: FIELDS[k].label, value: String(v) }));

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
