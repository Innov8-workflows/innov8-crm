// Minimal in-memory rate limiter for the login + MFA-verify endpoints.
//
// Same pragmatic model as the middleware's JWT cache (middleware.ts): a plain
// Map that lives for the lambda instance's lifetime and resets on cold start.
// That means it's PER-INSTANCE, not global — a determined attacker hitting many
// warm instances gets more than `max` total attempts. It's a real speed bump
// against ordinary online guessing, not a hard guarantee; a hard limit would
// need DB-backed counters. Adequate for a single-operator CRM, and it stops the
// "unlimited guesses" hole that exists today.

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000; // bound memory against a key-spray attack

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Records an attempt against `key` and reports whether it's allowed. Call once
 * per attempt BEFORE doing the expensive work (bcrypt/TOTP).
 *
 * @param key    identity to limit on, e.g. `login:${username}:${ip}`
 * @param max    attempts permitted within the window (default 5)
 * @param windowMs sliding window length (default 15 min)
 */
export function rateLimit(key: string, max = 5, windowMs = 15 * 60_000): RateLimitResult {
  const now = Date.now();

  // Opportunistic sweep of expired buckets so the Map can't grow unbounded.
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, retryAfterSec: 0 };
  }

  b.count += 1;
  if (b.count > max) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: max - b.count, retryAfterSec: 0 };
}

/** Wipe a key's attempts — call on a SUCCESSFUL auth so a good login resets. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Best-effort client IP from the standard proxy headers (Vercel sets these). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
