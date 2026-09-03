// Server-side onboarding: tokens, submission lookup, object keys, quotas.
//
// The security model in one line: THE BROWSER NEVER CHOOSES AN OBJECT KEY.
// It sends {role, filename, size}; the key is derived here from the token's own
// submission id. That is what stops a token holder writing outside their own
// prefix, overwriting anything, or using a leaked link as free file hosting.
//
// Dates are written in the datetime('now') shape ("YYYY-MM-DD HH:MM:SS"), never
// toISOString() — a space sorts before 'T', so mixing the two silently drops the
// boundary day in any range query. See the doctrine at the top of
// src/lib/clientReporting.ts.
import crypto from "crypto";
import type { Client } from "@libsql/client";
import { first } from "@/lib/db";
import { safeName, contentTypeFor } from "@/lib/r2";
import { formFor } from "@/lib/onboardingSchema";

/** 128 bits. It is in a client's WhatsApp message, and it authorises writes. */
export const mintToken = () => "ob_" + crypto.randomBytes(16).toString("hex");
/** Jay's read key for the agent API. Never returned to the onboarding page. */
export const mintFetchKey = () => "of_" + crypto.randomBytes(16).toString("hex");

const pad = (n: number) => String(n).padStart(2, "0");
export function sqlNow(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export interface Submission {
  id: number;
  /** NULL until Jay attaches it — submissions from the shared link start life unowned. */
  project_id: number | null;
  status: string;
  /** Which questionnaire: 'website' or 'meta_ads'. Decides the questions, the
   *  upload roles that are allowed, and the quota. */
  kind: string;
  r2_prefix: string;
  expires_at: string;
  schema_version: string;
  label: string;
  bytes_declared: number;
  asset_count: number;
}

/**
 * Look up a submission by its client-held token.
 *
 * Returns null for unknown, expired AND revoked alike — the caller must render
 * one identical message for all three. Confirming that a token merely expired
 * tells an attacker the token was real.
 */
export async function getByToken(db: Client, token: string): Promise<Submission | null> {
  if (!/^ob_[0-9a-f]{32}$/.test(token)) return null;
  const row = first(await db.execute({
    sql: `SELECT id, project_id, status, kind, r2_prefix, expires_at, schema_version,
                 label, bytes_declared, asset_count
            FROM onboarding_submissions
           WHERE token = ? AND status != 'revoked' AND expires_at > ?
           LIMIT 1`,
    args: [token, sqlNow()],
  }));
  return row ? (row as unknown as Submission) : null;
}

export interface KeyPlan {
  key: string;
  contentType: string;
}

/**
 * Derive the R2 object key. The <rand> matters: a retry after a partial failure
 * must not collide with the corpse of the previous attempt, which the unique
 * index on (submission_id, r2_key) would otherwise reject.
 */
export function planKey(submissionId: number, role: string, sortOrder: number, filename: string): KeyPlan | null {
  const contentType = contentTypeFor(filename);
  if (!contentType) return null;
  const rand = crypto.randomBytes(2).toString("hex");
  const n = String(Math.max(0, Math.min(999, sortOrder))).padStart(3, "0");
  return { key: `onboarding/${submissionId}/${role}/${n}-${rand}-${safeName(filename)}`, contentType };
}

export interface QuotaVerdict { ok: boolean; error?: string }

/**
 * Checked at begin, before a single byte moves. A leaked token's worst case is
 * this much junk in one prefix, which is one lifecycle rule to clear.
 */
export function checkQuota(sub: Submission, size: number, isVideo: boolean, videoCount: number): QuotaVerdict {
  // Per-form, not global: the website form wants a lot of photos and a handful
  // of videos; a Meta ad-creative form is the other way round, because Grade A
  // is all video. Resolved from the submission rather than passed in, so a
  // caller cannot pair one form's submission with another form's ceilings.
  const QUOTA = formFor(sub.kind).quota;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "bad file size" };
  if (size > QUOTA.maxBytesPerObject) {
    return { ok: false, error: `That file is ${(size / 1073741824).toFixed(1)}GB. The limit is 2GB per file — send it over separately and we'll add it.` };
  }
  if (sub.asset_count >= QUOTA.maxObjects) {
    return { ok: false, error: "That's the maximum number of files for one submission. Send anything else over separately." };
  }
  if (isVideo && videoCount >= QUOTA.maxVideos) {
    return { ok: false, error: "That's the maximum number of videos." };
  }
  if (sub.bytes_declared + size > QUOTA.maxBytesPerSubmission) {
    return { ok: false, error: "That would go over the total upload limit for one submission." };
  }
  return { ok: true };
}

/** Same response for every rejection, so nothing leaks about why. */
export const GONE = {
  error: "This link has expired or is no longer valid. Please ask for a new one.",
};
