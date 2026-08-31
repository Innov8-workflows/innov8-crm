import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { getByToken, GONE, sqlNow } from "@/lib/onboarding";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// Autosave for the text answers.
//
// Deliberately shares NOTHING with the media path. A tradesman filling this in
// on a phone in a yard will lose signal; losing typed text because a video
// upload failed would be unforgivable, and it is the single thing most likely
// to make someone give up on the form. Text is a few KB and saves on a debounce,
// on blur, and on visibilitychange.

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_ANSWERS_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const rl = rateLimit(`onboard-answers:${clientIp(request)}`, 300, 15 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });

  let body: { token?: string; answers?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "bad body" }, { status: 400, headers: NO_STORE }); }

  const token = String(body.token || "");
  if (!body.answers || typeof body.answers !== "object") {
    return NextResponse.json({ error: "bad body" }, { status: 400, headers: NO_STORE });
  }

  await initDb();
  const db = getClient();
  const sub = await getByToken(db, token);
  if (!sub) return NextResponse.json(GONE, { status: 404, headers: NO_STORE });

  const json = JSON.stringify(body.answers);
  if (json.length > MAX_ANSWERS_BYTES) {
    return NextResponse.json({ error: "That's more text than the form can store." },
      { status: 413, headers: NO_STORE });
  }

  const now = sqlNow();
  await db.batch([
    { sql: `INSERT INTO onboarding_answers (submission_id, answers_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(submission_id) DO UPDATE SET answers_json = excluded.answers_json,
                                                     updated_at   = excluded.updated_at`,
      args: [sub.id, json, now] },
    { sql: "UPDATE onboarding_submissions SET updated_at = ? WHERE id = ?", args: [now, sub.id] },
  ], "write");

  return NextResponse.json({ ok: true, saved_at: now }, { headers: NO_STORE });
}
