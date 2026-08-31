import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { getByToken, GONE, sqlNow } from "@/lib/onboarding";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// Marking a submission finished.
//
// Submit is NEVER blocked by pending or failed media. A client who has 18 of
// 30 photos in and a video that won't go can still finish; the link stays live
// until it expires so they can come back. Blocking here would mean the most
// common real-world state — a phone on bad signal — has no way out except
// abandoning the form, and Jay would rather have 18 photos and a note than
// nothing at all. The CRM shows him what's outstanding so he can chase
// specifics rather than asking "did it work?".

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  const rl = rateLimit(`onboard-submit:${clientIp(request)}`, 30, 15 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });

  let body: { token?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "bad body" }, { status: 400, headers: NO_STORE }); }

  await initDb();
  const db = getClient();
  const sub = await getByToken(db, String(body.token || ""));
  if (!sub) return NextResponse.json(GONE, { status: 404, headers: NO_STORE });

  const now = sqlNow();
  // Idempotent: re-submitting keeps the FIRST submitted_at, so "when did they
  // send it" survives a client coming back to add another photo.
  await db.execute({
    sql: `UPDATE onboarding_submissions
             SET status = CASE WHEN status = 'open' THEN 'submitted' ELSE status END,
                 submitted_at = CASE WHEN submitted_at = '' THEN ? ELSE submitted_at END,
                 updated_at = ?
           WHERE id = ?`,
    args: [now, now, sub.id],
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
