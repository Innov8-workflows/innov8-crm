import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptSecret, verifyToken, generateBackupCodes } from "@/lib/mfa";

// Finish enrolment (must be logged in): confirm the user can produce a valid
// code from the secret minted by /setup, then flip mfa_enabled on and hand back
// the backup codes. The plaintext codes are returned ONCE here and never again —
// only their hashes are stored.
export async function POST(request: NextRequest) {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await request.json();
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  const db = getClient();
  const user = first(await db.execute({
    sql: "SELECT id, totp_secret, mfa_enabled FROM users WHERE id = ?",
    args: [session.userId],
  }));
  if (!user || !user.totp_secret) {
    return NextResponse.json({ error: "Start setup first" }, { status: 400 });
  }
  if (user.mfa_enabled) {
    return NextResponse.json({ error: "MFA is already enabled" }, { status: 409 });
  }

  let secret: string;
  try {
    secret = decryptSecret(user.totp_secret as string);
  } catch {
    return NextResponse.json({ error: "Server MFA key misconfigured" }, { status: 500 });
  }

  if (!verifyToken(secret, String(code))) {
    // Wrong code at confirmation — don't enable, so a mis-scanned QR can't lock
    // the user out of their own account.
    return NextResponse.json({ error: "That code didn't match. Check your authenticator app and try again." }, { status: 401 });
  }

  const { plain, stored } = generateBackupCodes();
  await db.execute({
    sql: "UPDATE users SET mfa_enabled = 1, mfa_backup_codes = ?, mfa_enrolled_at = ? WHERE id = ?",
    args: [JSON.stringify(stored), new Date().toISOString(), Number(user.id)],
  });

  return NextResponse.json({ ok: true, backup_codes: plain });
}
