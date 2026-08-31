// Cloudflare R2 access over its S3-compatible API, signed with AWS SigV4 by hand.
//
// Raw crypto rather than @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner, for
// the same reason src/lib/email.ts talks to Resend over raw fetch: this is one
// frozen algorithm, and the SDK would mean package.json + lockfile changes in
// both the source tree and the build clone C:\innov8-crm plus an npm install
// there, ~40 transitive packages, and a fatter cold start — to produce four HMACs.
//
// WHY THIS EXISTS AT ALL: media must never reach the database. project_files.url
// holds base64 data URLs in a TEXT column and that made queries take ~30s (see
// the header of src/lib/projectCache.ts). Onboarding puts bytes in R2 and keeps
// only pointers in SQLite.
//
// Uploads go browser -> R2 DIRECTLY, never through a route handler: Vercel caps
// function request bodies at 4.5MB (413 FUNCTION_PAYLOAD_TOO_LARGE) and a single
// phone video is routinely 400MB+.
//
// The three things that are easy to get wrong, all handled below:
//   1. RFC3986 encoding — encodeURIComponent leaves !'()* alone, S3 does not.
//   2. Canonical query params must be sorted by ENCODED key.
//   3. Query-signed (presigned) requests hash the payload as the literal string
//      "UNSIGNED-PAYLOAD"; header-signed requests hash the real body.
//
// Node runtime only — crypto.createHmac does not exist on the edge runtime, so
// never put `export const runtime = "edge"` on a route that imports this.
import crypto from "crypto";

const ALGO = "AWS4-HMAC-SHA256";
const SERVICE = "s3";
// R2 requires literally "auto". Not lhr1, not eu-west-2 — the bucket's location
// hint is a placement concern and has nothing to do with the signing region.
const REGION = "auto";

/** Missing configuration — must never be mistaken for a working upload path. */
export class R2ConfigError extends Error {}
/** Retry-worthy: rate limits, R2 5xx, timeouts, network errors. */
export class TransientR2Error extends Error {}

const hmac = (key: crypto.BinaryLike, data: string): Buffer =>
  crypto.createHmac("sha256", key).update(data, "utf8").digest();
const sha256hex = (s: string): string =>
  crypto.createHash("sha256").update(s, "utf8").digest("hex");

/** RFC3986. encodeURIComponent does not escape !'()*, but S3's canonical form does. */
export const rfc3986 = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
/** Path segments are encoded individually so the separating slashes survive. */
const encPath = (p: string): string => p.split("/").map(rfc3986).join("/");

function signingKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), service), "aws4_request");
}

/** "20260831T120000Z" — SigV4's only accepted timestamp shape. */
export function amzStamp(now: Date): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalQuery(q: Record<string, string>): string {
  // Sorted by ENCODED key, per spec — not by the raw key.
  return Object.keys(q)
    .map((k) => [rfc3986(k), rfc3986(q[k])] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function canonicalHeaderBlock(headers: Record<string, string>): { block: string; names: string } {
  const lower: Record<string, string> = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = String(headers[k]).trim();
  const names = Object.keys(lower).sort();
  return { block: names.map((h) => `${h}:${lower[h]}\n`).join(""), names: names.join(";") };
}

// ---------------------------------------------------------------------------
// The pure signer. Everything is explicit so it can be checked against AWS's own
// published test vector without touching an account — scripts/r2-sigv4-check.mjs.
// ---------------------------------------------------------------------------

export interface PresignParams {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  host: string;
  /** Unencoded path INCLUDING any leading bucket segment, e.g. "/bucket/a b.jpg". */
  path: string;
  query?: Record<string, string>;
  /** Extra headers to sign. `host` is added automatically. */
  signedHeaders?: Record<string, string>;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  amzDate: string;
  expiresIn: number;
}

/** A bearer token in URL form. Treat it as one: short TTL, one object, one verb. */
export function buildPresignedUrl(p: PresignParams): string {
  const dateStamp = p.amzDate.slice(0, 8);
  const scope = `${dateStamp}/${p.region}/${p.service}/aws4_request`;
  const canonicalUri = encPath(p.path);

  const { block, names } = canonicalHeaderBlock({ host: p.host, ...(p.signedHeaders ?? {}) });

  const q: Record<string, string> = {
    ...(p.query ?? {}),
    "X-Amz-Algorithm": ALGO,
    "X-Amz-Credential": `${p.accessKeyId}/${scope}`,
    "X-Amz-Date": p.amzDate,
    "X-Amz-Expires": String(p.expiresIn),
    "X-Amz-SignedHeaders": names,
  };
  const cq = canonicalQuery(q);

  // Presigned requests always declare the payload unsigned — the bytes are
  // streamed by the browser and are not known at signing time.
  const canonicalRequest = [p.method, canonicalUri, cq, block, names, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [ALGO, p.amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = crypto
    .createHmac("sha256", signingKey(p.secretAccessKey, dateStamp, p.region, p.service))
    .update(stringToSign, "utf8")
    .digest("hex");

  return `https://${p.host}${canonicalUri}?${cq}&X-Amz-Signature=${signature}`;
}

// ---------------------------------------------------------------------------
// R2 bindings over the pure signer
// ---------------------------------------------------------------------------

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new R2ConfigError(`${name} is not set in Vercel — no R2 URL was issued.`);
  return v;
}

export function isR2Configured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET &&
            process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

const r2Host = (): string => `${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
/** Path-style: R2's S3 endpoint carries the bucket in the path, not the hostname. */
const r2Path = (key: string): string => `/${env("R2_BUCKET")}/${key}`;

export interface PresignOpts {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  /** Object key, no leading slash. ALWAYS derived server-side — never taken from a client. */
  key: string;
  expiresIn: number;
  /** e.g. { partNumber: "7", uploadId: "..." } for a multipart UploadPart. */
  query?: Record<string, string>;
  /** Signing content-type pins the upload to the type we chose, not the one the phone claimed. */
  signedHeaders?: Record<string, string>;
}

export function presign(o: PresignOpts, now: Date = new Date()): string {
  return buildPresignedUrl({
    method: o.method,
    host: r2Host(),
    path: r2Path(o.key),
    query: o.query,
    signedHeaders: o.signedHeaders,
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    region: REGION,
    service: SERVICE,
    amzDate: amzStamp(now),
    expiresIn: o.expiresIn,
  });
}

const TIMEOUT_MS = 15_000;

/**
 * Server-to-server S3 call, header-signed — for the multipart control messages
 * (CreateMultipartUpload / CompleteMultipartUpload / AbortMultipartUpload) and
 * for HeadObject / DeleteObject.
 *
 * Bodies here are small XML documents and they are OUTBOUND from the lambda,
 * where Vercel's 4.5MB *request* cap does not apply. Structured like
 * src/lib/email.ts: explicit timeout, transient failures separated from
 * permanent ones so the caller can retry the first and surface the second.
 */
export async function r2Request(
  method: "GET" | "PUT" | "POST" | "HEAD" | "DELETE",
  key: string,
  opts: { query?: Record<string, string>; body?: string; contentType?: string } = {},
): Promise<Response> {
  const host = r2Host();
  const canonicalUri = encPath(r2Path(key));
  const amzDate = amzStamp(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  // Header-signed requests hash the REAL body, unlike the presigned path above.
  const payloadHash = sha256hex(opts.body ?? "");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(opts.contentType ? { "content-type": opts.contentType } : {}),
  };
  const { block, names } = canonicalHeaderBlock(headers);
  const cq = canonicalQuery(opts.query ?? {});

  const canonicalRequest = [method, canonicalUri, cq, block, names, payloadHash].join("\n");
  const stringToSign = [ALGO, amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = crypto
    .createHmac("sha256", signingKey(env("R2_SECRET_ACCESS_KEY"), dateStamp, REGION, SERVICE))
    .update(stringToSign, "utf8")
    .digest("hex");

  let res: Response;
  try {
    res = await fetch(`https://${host}${canonicalUri}${cq ? "?" + cq : ""}`, {
      method,
      headers: {
        ...headers,
        Authorization:
          `${ALGO} Credential=${env("R2_ACCESS_KEY_ID")}/${scope}, ` +
          `SignedHeaders=${names}, Signature=${signature}`,
      },
      body: opts.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Timeout or network failure — always worth a retry.
    throw new TransientR2Error(`R2 ${method} ${key} failed: ${(e as Error).message}`);
  }
  if (res.status === 429 || res.status >= 500) {
    throw new TransientR2Error(`R2 ${method} ${key} returned ${res.status}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Upload policy
// ---------------------------------------------------------------------------

/**
 * SVG is deliberately absent, carried over from mitech-erp/src/attachments.ts:
 * an SVG served inline from our own origin can execute script, which would be a
 * stored XSS hole dressed up as a photo upload.
 *
 * HEIC/HEIF are present because that is what a modern iPhone hands over.
 */
export const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
  "video/mp4", "video/quicktime",
  "application/pdf",
]);

/** Same shape as mitech-erp's, so keys stay predictable across both systems. */
export function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

/**
 * Content type is decided HERE from the extension, never trusted from the
 * browser's File.type — Android is inconsistent on HEIC and sometimes sends "".
 * The chosen type is then signed into the presigned URL, so the upload cannot be
 * swapped for something else after the fact.
 */
export function contentTypeFor(filename: string): string | null {
  const ext = (filename.match(/\.([A-Za-z0-9]+)$/)?.[1] || "").toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", heic: "image/heic", heif: "image/heif",
    mp4: "video/mp4", mov: "video/quicktime", pdf: "application/pdf",
  };
  const type = map[ext];
  return type && ALLOWED_UPLOAD_TYPES.has(type) ? type : null;
}

/** Below this a single PUT is fine; at or above it we go multipart. */
export const MULTIPART_THRESHOLD = 64 * 1024 * 1024;
/**
 * 8MiB is chosen against 4G, not throughput: ~13s per part at 5Mbps is a
 * tolerable unit of work to lose and retry. 8MiB x 10,000 parts = 78GiB, well
 * above any phone video, so this stays a constant and there is no part-sizing
 * algorithm to get wrong.
 */
export const PART_SIZE = 8 * 1024 * 1024;
