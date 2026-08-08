import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getClient, initDb, first } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateSecret, otpauthURI, encryptSecret } from "@/lib/mfa";

// Begin enrolment (must be logged in). Mints a fresh secret, stores it ENCRYPTED
// but leaves mfa_enabled = 0 — it isn't active until /enable confirms the user
// can actually produce a code. Returns the QR + manual key for the authenticator
// app. Re-running before enabling just replaces the not-yet-active secret.
export async function POST() {
  await initDb();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getClient();
  const user = first(await db.execute({
    sql: "SELECT id, username, mfa_enabled FROM users WHERE id = ?",
    args: [session.userId],
  }));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.mfa_enabled) {
    return NextResponse.json({ error: "MFA is already enabled. Disable it first to re-enrol." }, { status: 409 });
  }

  const secret = generateSecret();
  await db.execute({
    sql: "UPDATE users SET totp_secret = ? WHERE id = ?",
    args: [encryptSecret(secret), Number(user.id)],
  });

  const uri = otpauthURI(secret, session.username);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  // The base32 secret is returned for manual entry; it's the same secret now
  // stored (encrypted) server-side, and enrolment isn't active until /enable.
  return NextResponse.json({ ok: true, secret, otpauth_uri: uri, qr: qrDataUrl });
}
