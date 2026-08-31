import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { mintToken, mintFetchKey, sqlNow } from "@/lib/onboarding";
import { SCHEMA_ID } from "@/lib/onboardingSchema";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// The shared "anyone" link. One bookmarkable address Jay can send to a prospect
// who isn't in the CRM yet; each person who starts gets their own private,
// resumable link, and Jay attaches the finished submission to a project later.
//
// WHY THIS IS A POST, NOT A GET ON A PAGE. Minting on page load would mean every
// crawler, link-preview scraper and WhatsApp unfurl created a row. A deliberate
// action with a name and an email attached is a real person; a GET is not.
//
// The two fields aren't friction for its own sake: an unassigned submission
// with no name is unattachable — Jay would be looking at a pile of anonymous
// photo sets. They're stored as the first two answers so nobody types twice.

const NO_STORE = { "Cache-Control": "private, no-store" };
const LINK_DAYS = 45;

export async function POST(request: NextRequest) {
  // Deliberately tight. A real person starts one of these, once.
  const rl = rateLimit(`onboard-start:${clientIp(request)}`, 5, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "That's a few too many. Try again in a little while, or ask us for a direct link." },
      { status: 429, headers: NO_STORE },
    );
  }

  let body: { business_name?: string; email?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "bad body" }, { status: 400, headers: NO_STORE }); }

  const business = String(body.business_name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().slice(0, 160);
  if (business.length < 2) {
    return NextResponse.json({ error: "Please put your business name in." }, { status: 400, headers: NO_STORE });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400, headers: NO_STORE });
  }

  await initDb();
  const db = getClient();
  const now = sqlNow();
  const token = mintToken();

  // project_id stays NULL — this submission belongs to nobody until Jay
  // attaches it in the CRM.
  const ins = await db.execute({
    sql: `INSERT INTO onboarding_submissions
            (project_id, token, fetch_key, schema_version, label, status, r2_prefix, expires_at, created_at, updated_at)
          VALUES (NULL, ?, ?, ?, ?, 'open', '', ?, ?, ?)`,
    args: [token, mintFetchKey(), SCHEMA_ID, business, sqlNow(LINK_DAYS), now, now],
  });
  const id = Number(ins.lastInsertRowid);

  await db.batch([
    { sql: "UPDATE onboarding_submissions SET r2_prefix = ? WHERE id = ?", args: [`onboarding/${id}/`, id] },
    // Seed what they've already typed so the form opens part-filled.
    { sql: `INSERT INTO onboarding_answers (submission_id, answers_json, updated_at) VALUES (?, ?, ?)`,
      args: [id, JSON.stringify({ business_name: business, email }), now] },
  ], "write");

  return NextResponse.json({ token }, { status: 201, headers: NO_STORE });
}
