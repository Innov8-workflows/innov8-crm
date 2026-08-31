import { NextResponse } from "next/server";
import { presign, r2Request, isR2Configured, PART_SIZE } from "@/lib/r2";

// Diagnostic for the R2 wiring. Session-guarded by the middleware like every
// other /api/onboarding route — deliberately NOT in PUBLIC_PATHS.
//
// It exists to answer one question before any UI is built on top of R2:
// does R2 accept a PRESIGNED UploadPart URL? Multipart is what makes a 400MB
// phone video survive a dropped 4G connection, and Cloudflare documents
// presigned GET/HEAD/PUT/DELETE without ever showing an UploadPart example.
// It is a PUT with ?partNumber=&uploadId= so it should presign like any other,
// but "should" is not "does", and the fallback (a Worker relaying parts) is a
// different half-day of work. Cheaper to find out in twenty minutes.
//
// Everything it writes goes under _diagnostic/ and is deleted on the way out,
// including on failure.

export const maxDuration = 60;

interface Step { step: string; ok: boolean; detail: string }

const tag = (xml: string, name: string): string =>
  (xml.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1] || "";

export async function GET() {
  const steps: Step[] = [];
  const add = (step: string, ok: boolean, detail = "") => { steps.push({ step, ok, detail }); return ok; };

  if (!isR2Configured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      hint: "One of R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY is missing in Vercel, or the deployment predates them.",
      steps,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
  const key = `_diagnostic/multipart-${stamp}.bin`;
  const smallKey = `_diagnostic/single-${stamp}.txt`;
  let uploadId = "";

  try {
    // ---- 1. Single presigned PUT (the path every photo under 64MiB takes) ----
    const body = "innov8 onboarding r2 diagnostic";
    const putUrl = presign({
      method: "PUT", key: smallKey, expiresIn: 300,
      signedHeaders: { "content-type": "text/plain" },
    });
    const putRes = await fetch(putUrl, {
      method: "PUT", body, headers: { "content-type": "text/plain" },
    });
    if (!add("single presigned PUT", putRes.ok, `HTTP ${putRes.status}${putRes.ok ? "" : " " + (await putRes.text()).slice(0, 300)}`)) {
      return done(steps, key, smallKey, uploadId);
    }

    // Read it back through a presigned GET — this is how the build machine will
    // pull a client's media down later.
    const getUrl = presign({ method: "GET", key: smallKey, expiresIn: 300 });
    const getRes = await fetch(getUrl);
    const roundTripped = getRes.ok ? await getRes.text() : "";
    add("presigned GET round-trip", roundTripped === body,
        getRes.ok ? `${roundTripped.length} bytes back` : `HTTP ${getRes.status}`);

    // ---- 2. CreateMultipartUpload (server-signed, not presigned) ----
    const createRes = await r2Request("POST", key, {
      query: { uploads: "" },
      contentType: "application/octet-stream",
    });
    const createXml = await createRes.text();
    uploadId = tag(createXml, "UploadId");
    if (!add("CreateMultipartUpload", createRes.ok && !!uploadId,
             createRes.ok ? `uploadId ${uploadId.slice(0, 12)}…` : `HTTP ${createRes.status} ${createXml.slice(0, 300)}`)) {
      return done(steps, key, smallKey, uploadId);
    }

    // ---- 3. THE QUESTION: presigned UploadPart ----
    // Part 1 must be >= 5MiB (S3 rule for any non-final part). PART_SIZE is 8MiB.
    const part1 = Buffer.alloc(PART_SIZE, 0x61);
    const part1Url = presign({
      method: "PUT", key, expiresIn: 900,
      query: { partNumber: "1", uploadId },
    });
    const p1 = await fetch(part1Url, { method: "PUT", body: part1 });
    const etag1 = p1.headers.get("etag") || "";
    if (!add("presigned UploadPart #1 (8MiB)", p1.ok && !!etag1,
             p1.ok ? `ETag ${etag1}` : `HTTP ${p1.status} ${(await p1.text()).slice(0, 300)}`)) {
      return done(steps, key, smallKey, uploadId);
    }

    // Final part may be any size.
    const part2 = Buffer.from("tail");
    const part2Url = presign({ method: "PUT", key, expiresIn: 900, query: { partNumber: "2", uploadId } });
    const p2 = await fetch(part2Url, { method: "PUT", body: part2 });
    const etag2 = p2.headers.get("etag") || "";
    if (!add("presigned UploadPart #2", p2.ok && !!etag2,
             p2.ok ? `ETag ${etag2}` : `HTTP ${p2.status}`)) {
      return done(steps, key, smallKey, uploadId);
    }

    // ---- 4. CompleteMultipartUpload ----
    const completeXml =
      `<CompleteMultipartUpload>` +
      `<Part><PartNumber>1</PartNumber><ETag>${etag1}</ETag></Part>` +
      `<Part><PartNumber>2</PartNumber><ETag>${etag2}</ETag></Part>` +
      `</CompleteMultipartUpload>`;
    const compRes = await r2Request("POST", key, {
      query: { uploadId }, body: completeXml, contentType: "application/xml",
    });
    const compText = await compRes.text();
    // S3 can return 200 with an <Error> body on this call — check both.
    const completed = compRes.ok && !compText.includes("<Error>");
    if (!add("CompleteMultipartUpload", completed,
             completed ? "assembled" : `HTTP ${compRes.status} ${compText.slice(0, 300)}`)) {
      return done(steps, key, smallKey, uploadId);
    }
    uploadId = ""; // completed, nothing left to abort

    // ---- 5. HeadObject: does the assembled object have the right size? ----
    const head = await r2Request("HEAD", key);
    const len = Number(head.headers.get("content-length") || 0);
    const expected = PART_SIZE + part2.length;
    add("HeadObject size check", head.ok && len === expected, `${len} bytes (expected ${expected})`);

    return done(steps, key, smallKey, uploadId);
  } catch (e) {
    add("unexpected error", false, (e as Error).message);
    return done(steps, key, smallKey, uploadId);
  }
}

/** Always clean up: abort a dangling multipart, delete both test objects. */
async function done(steps: Step[], key: string, smallKey: string, uploadId: string) {
  const cleanup: string[] = [];
  if (uploadId) {
    try {
      const r = await r2Request("DELETE", key, { query: { uploadId } });
      cleanup.push(`abort multipart: ${r.status}`);
    } catch (e) { cleanup.push(`abort multipart failed: ${(e as Error).message}`); }
  }
  for (const k of [key, smallKey]) {
    try {
      const r = await r2Request("DELETE", k);
      cleanup.push(`delete ${k.split("/").pop()}: ${r.status}`);
    } catch (e) { cleanup.push(`delete failed: ${(e as Error).message}`); }
  }
  const ok = steps.length > 0 && steps.every((s) => s.ok);
  return NextResponse.json(
    { ok, configured: true, verdict: ok ? "PRESIGNED MULTIPART WORKS — no Worker fallback needed" : "SOMETHING FAILED — see steps", steps, cleanup },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
