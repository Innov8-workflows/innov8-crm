import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { getByToken, GONE, planKey, checkQuota, sqlNow } from "@/lib/onboarding";
import { presign, r2Request, isR2Configured, MULTIPART_THRESHOLD, PART_SIZE } from "@/lib/r2";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { formFor } from "@/lib/onboardingSchema";

// The upload control plane. The BYTES never come here — Vercel caps a function
// request body at 4.5MB and a phone video is routinely 400MB+, so this route
// only ever mints presigned URLs and records what happened. The browser PUTs
// straight to R2.
//
// One route with an `action` discriminator rather than five files: they share
// the token lookup, the rate limit and the asset row, and splitting them would
// mean five PUBLIC_PATHS-adjacent surfaces instead of one.
//
// Under 64MiB: a single presigned PUT.
// At or over:  multipart in 8MiB parts. 8MiB is chosen against 4G rather than
// throughput — roughly 13s per part at 5Mbps is a tolerable unit of work to lose
// and retry, and per-part retry is what stops a dropped connection costing the
// whole video. Part ETags are held server-side so a refresh cannot lose them.

export const maxDuration = 60;
const NO_STORE = { "Cache-Control": "private, no-store" };
/** Long enough for a slow part, short enough that a leaked URL is worthless. */
const PART_URL_TTL = 7200;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });
const tag = (xml: string, name: string): string =>
  (xml.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1] || "";

export async function POST(request: NextRequest) {
  const rl = rateLimit(`onboard-upload:${clientIp(request)}`, 400, 15 * 60_000);
  if (!rl.ok) return bad("Too many requests.", 429);
  if (!isR2Configured()) return bad("Uploads aren't configured yet. Tell Jay.", 503);

  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return bad("bad body"); }

  await initDb();
  const db = getClient();
  const sub = await getByToken(db, String(b.token || ""));
  if (!sub) return NextResponse.json(GONE, { status: 404, headers: NO_STORE });

  const action = String(b.action || "");

  // ---------------------------------------------------------------- begin ---
  if (action === "begin") {
    // `role` decides the folder an upload lands in — onboarding/<id>/<role>/… —
    // and it arrives from the browser. It is NOT just a label. It flows into the
    // R2 key, back out through /api/onboarding-fetch as the asset's `path`, and
    // from there into path.join() on whichever machine downloads the assets.
    // path.join RESOLVES "..", so a role of "../../.." wrote files outside the
    // download folder entirely. safeName() guards the filename; nothing guarded
    // this.
    //
    // Refused outright rather than stripped: a role that isn't a plain
    // identifier is a bug in our own form, and it should surface as an error
    // instead of quietly creating a folder nobody meant to exist. Every role the
    // schema actually uses (logo, hero, gallery, before_after, certificate,
    // about, areas, video) matches.
    const role = String(b.role || "gallery");
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(role)) return bad("Unrecognised upload type.");

    // …and it must be a role THIS form actually asks for. The character check
    // above stops the key being weaponised; this stops a token for one
    // questionnaire filing uploads under the other one's roles, which the
    // export would then read as photos that were never sent.
    if (!formFor(sub.kind).roles.includes(role)) return bad("Unrecognised upload type.");
    const filename = String(b.filename || "").slice(0, 200);
    const size = Number(b.size || 0);
    const sortOrder = Number(b.sort_order || 0);

    const plan = planKey(sub.id, role, sortOrder, filename);
    if (!plan) {
      return bad(`We can't accept "${filename.split(".").pop() || "that"}" files. Photos, videos and PDFs only.`);
    }
    const isVideo = plan.contentType.startsWith("video/");
    const vids = first(await db.execute({
      sql: "SELECT COUNT(*) c FROM onboarding_assets WHERE submission_id = ? AND content_type LIKE 'video/%' AND status != 'failed'",
      args: [sub.id],
    }));
    const verdict = checkQuota(sub, size, isVideo, Number(vids?.c) || 0);
    if (!verdict.ok) return bad(verdict.error!, 429);

    const now = sqlNow();
    const multipart = size >= MULTIPART_THRESHOLD;
    const partsTotal = multipart ? Math.ceil(size / PART_SIZE) : 0;
    let uploadId = "";

    if (multipart) {
      const res = await r2Request("POST", plan.key, {
        query: { uploads: "" }, contentType: plan.contentType,
      });
      const xml = await res.text();
      uploadId = tag(xml, "UploadId");
      if (!res.ok || !uploadId) return bad("Couldn't start that upload. Try again.", 502);
    }

    const ins = await db.execute({
      sql: `INSERT INTO onboarding_assets
              (submission_id, role, pair_id, sort_order, r2_key, original_name, content_type,
               caption, declared_size, upload_id, part_size, parts_total, status, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'uploading', ?, ?)`,
      args: [sub.id, role, String(b.pair_id || "").slice(0, 40), sortOrder, plan.key, filename,
             plan.contentType, String(b.caption || "").slice(0, 300), size, uploadId,
             multipart ? PART_SIZE : 0, partsTotal, now, now],
    });
    const assetId = Number(ins.lastInsertRowid);

    await db.execute({
      sql: `UPDATE onboarding_submissions
               SET bytes_declared = bytes_declared + ?, asset_count = asset_count + 1,
                   status = CASE WHEN status = 'open' THEN 'open' ELSE status END, updated_at = ?
             WHERE id = ?`,
      args: [size, now, sub.id],
    });

    if (!multipart) {
      return NextResponse.json({
        mode: "put", asset_id: assetId, content_type: plan.contentType,
        url: presign({ method: "PUT", key: plan.key, expiresIn: PART_URL_TTL,
                       signedHeaders: { "content-type": plan.contentType } }),
      }, { headers: NO_STORE });
    }
    return NextResponse.json({
      mode: "multipart", asset_id: assetId, upload_id: uploadId,
      part_size: PART_SIZE, parts_total: partsTotal, content_type: plan.contentType,
    }, { headers: NO_STORE });
  }

  // ---------------------------------------------------------------- parts ---
  // Minted in small batches rather than all at once: presigning is local HMAC
  // and costs nothing, but a URL minted at the start of a 90-minute upload would
  // be stale long before part 250.
  if (action === "parts") {
    const asset = await loadAsset(db, sub.id, Number(b.asset_id));
    if (!asset) return bad("unknown upload");
    const from = Math.max(1, Number(b.from || 1));
    const count = Math.max(1, Math.min(16, Number(b.count || 8)));
    const urls: { part_number: number; url: string }[] = [];
    for (let n = from; n < from + count && n <= Number(asset.parts_total); n++) {
      urls.push({
        part_number: n,
        url: presign({ method: "PUT", key: String(asset.r2_key), expiresIn: PART_URL_TTL,
                       query: { partNumber: String(n), uploadId: String(asset.upload_id) } }),
      });
    }
    return NextResponse.json({ urls, ttl: PART_URL_TTL }, { headers: NO_STORE });
  }

  // ------------------------------------------------------------ part-done ---
  if (action === "part-done") {
    const asset = await loadAsset(db, sub.id, Number(b.asset_id));
    if (!asset) return bad("unknown upload");
    const partNumber = Number(b.part_number);
    const etag = String(b.etag || "").slice(0, 100);
    if (!partNumber || !etag) return bad("bad part");
    await db.execute({
      sql: `INSERT INTO onboarding_asset_parts (asset_id, part_number, etag, size)
            VALUES (?,?,?,?)
            ON CONFLICT(asset_id, part_number) DO UPDATE SET etag = excluded.etag, size = excluded.size`,
      args: [asset.id, partNumber, etag, Number(b.size || 0)],
    });
    const done = first(await db.execute({
      sql: "SELECT COUNT(*) c FROM onboarding_asset_parts WHERE asset_id = ?", args: [asset.id],
    }));
    await db.execute({
      sql: "UPDATE onboarding_assets SET parts_done = ?, updated_at = ? WHERE id = ?",
      args: [Number(done?.c) || 0, sqlNow(), asset.id],
    });
    return NextResponse.json({ ok: true, parts_done: Number(done?.c) || 0 }, { headers: NO_STORE });
  }

  // ------------------------------------------------------------- complete ---
  if (action === "complete") {
    const asset = await loadAsset(db, sub.id, Number(b.asset_id));
    if (!asset) return bad("unknown upload");
    const key = String(asset.r2_key);

    if (asset.upload_id) {
      const parts = all(await db.execute({
        sql: "SELECT part_number, etag FROM onboarding_asset_parts WHERE asset_id = ? ORDER BY part_number",
        args: [asset.id],
      }));
      if (parts.length !== Number(asset.parts_total)) {
        return bad(`Only ${parts.length} of ${asset.parts_total} pieces arrived.`, 409);
      }
      const xml = "<CompleteMultipartUpload>" +
        parts.map((p) => `<Part><PartNumber>${p.part_number}</PartNumber><ETag>${p.etag}</ETag></Part>`).join("") +
        "</CompleteMultipartUpload>";
      const res = await r2Request("POST", key, {
        query: { uploadId: String(asset.upload_id) }, body: xml, contentType: "application/xml",
      });
      const text = await res.text();
      // S3 can return 200 with an <Error> body on this call — check both.
      if (!res.ok || text.includes("<Error>")) {
        await failAsset(db, asset.id, `assemble failed ${res.status}`);
        return bad("Couldn't finish that upload. Try sending it again.", 502);
      }
    }

    // Verify what actually landed rather than trusting the declared size. A
    // mismatch means a truncated upload, which would otherwise reach a build as
    // a corrupt photo.
    const head = await r2Request("HEAD", key);
    const actual = Number(head.headers.get("content-length") || 0);
    if (!head.ok || (Number(asset.declared_size) > 0 && actual !== Number(asset.declared_size))) {
      await failAsset(db, asset.id, `size mismatch: ${actual} vs ${asset.declared_size}`);
      try { await r2Request("DELETE", key); } catch { /* best effort */ }
      return bad("That file didn't arrive in one piece. Please try it again.", 409);
    }

    await db.execute({
      sql: `UPDATE onboarding_assets SET status = 'stored', actual_size = ?, etag = ?, updated_at = ?
             WHERE id = ?`,
      args: [actual, (head.headers.get("etag") || "").slice(0, 100), sqlNow(), asset.id],
    });
    return NextResponse.json({ ok: true, asset_id: asset.id, bytes: actual }, { headers: NO_STORE });
  }

  // --------------------------------------------------------------- remove ---
  // The client changed their mind, or a failed upload needs clearing.
  if (action === "remove") {
    const asset = await loadAsset(db, sub.id, Number(b.asset_id));
    if (!asset) return bad("unknown upload");
    if (asset.upload_id && asset.status !== "stored") {
      try { await r2Request("DELETE", String(asset.r2_key), { query: { uploadId: String(asset.upload_id) } }); }
      catch { /* the 7-day lifecycle rule will clear it */ }
    }
    try { await r2Request("DELETE", String(asset.r2_key)); } catch { /* best effort */ }
    await db.batch([
      { sql: "DELETE FROM onboarding_assets WHERE id = ?", args: [asset.id] },
      { sql: `UPDATE onboarding_submissions
                 SET asset_count = MAX(0, asset_count - 1),
                     bytes_declared = MAX(0, bytes_declared - ?), updated_at = ?
               WHERE id = ?`,
        args: [Number(asset.declared_size) || 0, sqlNow(), sub.id] },
    ], "write");
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  // ---------------------------------------------------------------- meta ----
  // A caption arriving after the bytes — the client types it while it uploads.
  if (action === "caption") {
    const asset = await loadAsset(db, sub.id, Number(b.asset_id));
    if (!asset) return bad("unknown upload");
    await db.execute({
      sql: "UPDATE onboarding_assets SET caption = ?, updated_at = ? WHERE id = ?",
      args: [String(b.caption || "").slice(0, 300), sqlNow(), asset.id],
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  return bad("unknown action");
}

interface AssetRow {
  id: number; r2_key: string; upload_id: string;
  parts_total: number; declared_size: number; status: string;
}

/**
 * Scoped to the submission on purpose — an asset id from another token is a
 * miss, not a permission error. Returns a TYPED row: first() hands back
 * Record<string, unknown>, and feeding those straight into query args is a type
 * error waiting at build time, so the coercion happens once here rather than at
 * every call site.
 */
async function loadAsset(
  db: ReturnType<typeof getClient>, submissionId: number, assetId: number,
): Promise<AssetRow | null> {
  if (!assetId) return null;
  const r = first(await db.execute({
    sql: `SELECT id, r2_key, upload_id, parts_total, declared_size, status
            FROM onboarding_assets WHERE id = ? AND submission_id = ? LIMIT 1`,
    args: [assetId, submissionId],
  }));
  if (!r) return null;
  return {
    id: Number(r.id),
    r2_key: String(r.r2_key ?? ""),
    upload_id: String(r.upload_id ?? ""),
    parts_total: Number(r.parts_total ?? 0),
    declared_size: Number(r.declared_size ?? 0),
    status: String(r.status ?? ""),
  };
}

async function failAsset(db: ReturnType<typeof getClient>, assetId: number, why: string) {
  await db.execute({
    sql: "UPDATE onboarding_assets SET status = 'failed', error = ?, updated_at = ? WHERE id = ?",
    args: [why.slice(0, 200), sqlNow(), assetId],
  });
}
