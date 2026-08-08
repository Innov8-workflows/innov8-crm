// TOTP two-factor: secret generation/verification, at-rest encryption of the
// secret, and single-use backup codes.
//
// Why encrypt the secret: a plaintext totp_secret in the DB means a database
// leak alone is an MFA bypass — the whole point of the second factor is that a
// password compromise isn't enough, so the factor mustn't sit in the same store
// in the clear. AES-256-GCM with a key HKDF-derived from SESSION_SECRET: no new
// env var for Jay to set, and proper key separation from the JWT signing use via
// a distinct info label (never feed the same key material to two primitives).
//
// bcryptjs (already a dep) hashes the backup codes — same treatment as the
// login password, since a backup code IS a credential.

import * as OTPAuth from "otpauth";
import bcrypt from "bcryptjs";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomInt } from "node:crypto";

const ISSUER = "innov8 CRM";
const DIGITS = 6;
const PERIOD = 30;
// Accept the adjacent windows (±1 step = ±30s) so a code entered right on the
// boundary, or with a little clock skew between phone and server, still passes.
const VERIFY_WINDOW = 1;

const BACKUP_CODE_COUNT = 8;

// ─── secret ↔ TOTP ──────────────────────────────────────────────────────────

/** A fresh base32 TOTP secret (what the authenticator app stores). */
export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1", // universal — every authenticator app supports it
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** The otpauth:// URI an authenticator app consumes (drives the QR). */
export function otpauthURI(secretBase32: string, accountLabel: string): string {
  return totp(secretBase32, accountLabel).toString();
}

/**
 * True when `token` is a valid current (or adjacent-window) code for the secret.
 * `timestamp` is injectable purely so tests are deterministic — production omits
 * it and OTPAuth uses the real clock.
 */
export function verifyToken(secretBase32: string, token: string, timestamp?: number): boolean {
  const clean = (token || "").replace(/\D/g, "");
  if (clean.length !== DIGITS) return false;
  const delta = totp(secretBase32, "verify").validate({ token: clean, window: VERIFY_WINDOW, timestamp });
  return delta !== null;
}

// ─── secret encryption at rest (AES-256-GCM) ────────────────────────────────

function encryptionKey(): Buffer {
  const material = process.env.SESSION_SECRET || "innov8-crm-default-secret-change-me";
  // Distinct info label = a different derived key than anything else using
  // SESSION_SECRET, so the two never share key bytes.
  return Buffer.from(hkdfSync("sha256", Buffer.from(material), Buffer.alloc(0), Buffer.from("innov8-crm-mfa-totp-v1"), 32));
}

/** Encrypt a base32 secret for storage. Format: base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Reverse of encryptSecret. Throws if the ciphertext or key is wrong (GCM auth). */
export function decryptSecret(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// ─── backup codes ───────────────────────────────────────────────────────────

export interface BackupCode { hash: string; used: boolean }

/** Human-friendly codes like "4F2A-9C7E". */
function oneCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L ambiguity
  const pick = () => alphabet[randomInt(alphabet.length)];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `${block()}-${block()}`;
}

/** Returns the plaintext codes (shown to the user ONCE) and the rows to store. */
export function generateBackupCodes(): { plain: string[]; stored: BackupCode[] } {
  const plain = Array.from({ length: BACKUP_CODE_COUNT }, oneCode);
  const stored = plain.map((c) => ({ hash: bcrypt.hashSync(c.replace(/-/g, "").toUpperCase(), 10), used: false }));
  return { plain, stored };
}

/**
 * Check `input` against the stored codes. On a match returns the updated array
 * with that code marked used (single-use); on no match returns null. Caller
 * persists the returned array.
 */
export function consumeBackupCode(input: string, codes: BackupCode[]): BackupCode[] | null {
  const norm = (input || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (norm.length < 8) return null;
  for (let i = 0; i < codes.length; i++) {
    if (codes[i].used) continue;
    if (bcrypt.compareSync(norm, codes[i].hash)) {
      const next = codes.slice();
      next[i] = { ...next[i], used: true };
      return next;
    }
  }
  return null;
}
