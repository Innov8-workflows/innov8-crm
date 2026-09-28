import crypto from "crypto";
import type { NextRequest } from "next/server";

/**
 * Key check for the agent routes Claude calls (tasks-agent, brief-agent).
 *
 * The service key only, compared in constant time, failing CLOSED: 503 when
 * the key is unset, never a 200. Deliberately NOT a copy of onboarding-fetch's
 * authorise(), which also lets any string shaped like a submission fetch key
 * through and relies on a later lookup to reject it — on these routes there is
 * no later lookup, so that shape would have been full write access for a
 * made-up key.
 */
export function authoriseAgent(request: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const configured = process.env.ONBOARDING_API_KEY;
  if (!configured) return { ok: false, status: 503, error: "ONBOARDING_API_KEY is not set in Vercel — this endpoint is disabled." };
  const key = request.headers.get("x-innov8-key") || "";
  const a = Buffer.from(key), b = Buffer.from(configured);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, status: 401, error: "unknown key" };
  return { ok: true };
}
