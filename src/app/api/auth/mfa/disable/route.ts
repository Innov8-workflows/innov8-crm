import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptSecret, verifyToken, consumeBackupCode, type BackupCode } from "@/lib/mfa";

// Turn MFA off (must be logged in). Requires a current code — being logged in
// isn't enough on its own, so someone on an already-open session can't silently
// strip the second factor. Clears the secret and backup codes so a later
// re-enrol starts clean.
export async function POST(request: NextRequest) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await request.json();
  if (!code) return NextResponse.json({ error: "Enter a current code to turn MFA off" }, { status: 400 });

  const db = getClient();
  const user = first(await db.execute({
    sql: "SELECT id, totp_secret, mfa_backup_codes, mfa_enabled FROM users WHERE id = ?",
    args: [session.userId],
  }));
  if (!user || !user.mfa_enabled) {
    return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
  }

  let ok = false;
  try {
    ok = verifyToken(decryptSecret(user.totp_secret as string), String(code));
  } catch { /* fall through to backup-code check */ }

  if (!ok) {
    let codes: BackupCode[] = [];
    try { const v = JSON.parse((user.mfa_backup_codes as string) || "[]"); codes = Array.isArray(v) ? v : []; } catch {}
    ok = consumeBackupCode(String(code), codes) !== null;
  }

  if (!ok) return NextResponse.json({ error: "Incorrect code" }, { status: 401 });

  await db.execute({
    sql: "UPDATE users SET mfa_enabled = 0, totp_secret = '', mfa_backup_codes = '', mfa_enrolled_at = '' WHERE id = ?",
    args: [Number(user.id)],
  });
  return NextResponse.json({ ok: true });
}
