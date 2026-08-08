import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "innov8-crm-default-secret-change-me"
);

const COOKIE_NAME = "innov8_session";
// Set after password verification but BEFORE the second factor. It is not a real
// session — getSession() ignores it, and the middleware never reads it — so it
// cannot open any protected route. Only /api/auth/mfa/verify consumes it, trades
// it for a full session, and clears it. Short-lived: a login left half-finished
// shouldn't stay resumable.
const PENDING_COOKIE = "innov8_mfa_pending";
const PENDING_TTL_SEC = 10 * 60;

export async function createSession(userId: number, username: string) {
  const token = await new SignJWT({ userId, username })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });

  return token;
}

export async function getSession(): Promise<{ userId: number; username: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { userId: payload.userId as number, username: payload.username as string };
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ─── MFA pending session (between password and second factor) ────────────────

export async function createPendingSession(userId: number, username: string) {
  const token = await new SignJWT({ userId, username, mfaPending: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${PENDING_TTL_SEC}s`)
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(PENDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: PENDING_TTL_SEC,
    path: "/",
  });
}

export async function getPendingSession(): Promise<{ userId: number; username: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload.mfaPending) return null; // a full session token is not valid here
    return { userId: payload.userId as number, username: payload.username as string };
  } catch {
    return null;
  }
}

export async function clearPendingSession() {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_COOKIE);
}
