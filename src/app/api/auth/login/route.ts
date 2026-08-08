import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getClient, initDb, first } from "@/lib/db";
import { createSession, createPendingSession } from "@/lib/auth";
import { rateLimit, clearRateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }

  // Brute-force guard. Keyed on username+IP so one attacker can't lock out a
  // real user, and one user's fat-fingering doesn't help an attacker elsewhere.
  const key = `login:${String(username).toLowerCase()}:${clientIp(request)}`;
  const limit = rateLimit(key);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const user = first(await db.execute({
    sql: "SELECT * FROM users WHERE username = ?",
    args: [username],
  }));
  // Same generic message + same bcrypt cost whether the user exists or not, so
  // response timing/wording doesn't reveal valid usernames.
  const hash = (user?.password_hash as string) || "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Password is correct — the guess budget is spent, reset it.
  clearRateLimit(key);

  // Second factor required: issue only the short-lived pending cookie. The real
  // session is minted in /api/auth/mfa/verify once the code checks out.
  if (user.mfa_enabled) {
    await createPendingSession(user.id as number, user.username as string);
    return NextResponse.json({ ok: true, mfa_required: true });
  }

  await createSession(user.id as number, user.username as string);
  return NextResponse.json({ ok: true, username: user.username });
}
