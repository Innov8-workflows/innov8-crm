import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClient, initDb, first } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  await initDb();
  const db = getClient();
  const user = first(await db.execute({
    sql: "SELECT mfa_enabled FROM users WHERE id = ?",
    args: [session.userId],
  }));
  return NextResponse.json(
    { username: session.username, mfa_enabled: !!user?.mfa_enabled },
    // no-store: the Security modal must see enrolment changes immediately, not a
    // 60s-stale "MFA off".
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
