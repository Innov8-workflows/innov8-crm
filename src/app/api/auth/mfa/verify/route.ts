import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import { getPendingSession, createSession, clearPendingSession } from "@/lib/auth";
import { decryptSecret, verifyToken, consumeBackupCode, type BackupCode } from "@/lib/mfa";
import { rateLimit, clearRateLimit, clientIp } from "@/lib/rateLimit";

// Second step of MFA login: the caller holds the pending cookie (password
// already verified) and submits either a 6-digit TOTP code or a backup code.
// Public in the middleware because there is no full session yet — it
// authenticates via the pending cookie it reads here.
export async function POST(request: NextRequest) {
  await initDb();

  const pending = await getPendingSession();
  if (!pending) {
    // Expired or absent — send them back to the password step.
    return NextResponse.json({ error: "Session expired — please sign in again." }, { status: 401 });
  }

  // Limit code guessing the same way as passwords.
  const key = `mfa:${pending.userId}:${clientIp(request)}`;
  const limit = rateLimit(key);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const { code } = await request.json();
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  const db = getClient();
  const user = first(await db.execute({
    sql: "SELECT id, username, totp_secret, mfa_backup_codes, mfa_enabled FROM users WHERE id = ?",
    args: [pending.userId],
  }));
  if (!user || !user.mfa_enabled || !user.totp_secret) {
    return NextResponse.json({ error: "MFA not set up for this account" }, { status: 400 });
  }

  let secret: string;
  try {
    secret = decryptSecret(user.totp_secret as string);
  } catch {
    // Almost always SESSION_SECRET changed since enrolment — the stored secret
    // can no longer be decrypted. Fail closed and say something actionable.
    return NextResponse.json({ error: "MFA is misconfigured on the server. Contact the administrator." }, { status: 500 });
  }

  // Try the TOTP code first; fall back to a one-time backup code.
  if (verifyToken(secret, String(code))) {
    return await succeed(db, key, user.id as number, user.username as string);
  }

  const codes: BackupCode[] = safeParse(user.mfa_backup_codes as string);
  const consumed = consumeBackupCode(String(code), codes);
  if (consumed) {
    await db.execute({
      sql: "UPDATE users SET mfa_backup_codes = ? WHERE id = ?",
      args: [JSON.stringify(consumed), Number(user.id)],
    });
    return await succeed(db, key, user.id as number, user.username as string, consumed);
  }

  return NextResponse.json({ error: "Incorrect code" }, { status: 401 });
}

async function succeed(
  _db: ReturnType<typeof getClient>, key: string, userId: number, username: string, codes?: BackupCode[]
) {
  clearRateLimit(key);
  await clearPendingSession();
  await createSession(userId, username);
  const remaining = codes ? codes.filter((c) => !c.used).length : undefined;
  return NextResponse.json({ ok: true, username, backup_codes_remaining: remaining });
}

function safeParse(s: string): BackupCode[] {
  try { const v = JSON.parse(s || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
