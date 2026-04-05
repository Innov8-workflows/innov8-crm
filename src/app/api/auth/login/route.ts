import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getClient, initDb, first } from "@/lib/db";
import { createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }

  const result = await db.execute({
    sql: "SELECT * FROM users WHERE username = ?",
    args: [username],
  });

  const user = first(result);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash as string);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await createSession(user.id as number, user.username as string);

  return NextResponse.json({ ok: true, username: user.username });
}
