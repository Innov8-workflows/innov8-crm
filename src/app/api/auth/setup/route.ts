import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getClient, initDb, first } from "@/lib/db";

// One-time setup endpoint to create users
// Protected by a setup secret so only you can call it
export async function POST(request: NextRequest) {
  const setupSecret = process.env.SETUP_SECRET;
  if (!setupSecret) {
    return NextResponse.json({ error: "SETUP_SECRET not configured" }, { status: 500 });
  }

  const { secret, username, password } = await request.json();
  if (secret !== setupSecret) {
    return NextResponse.json({ error: "Invalid setup secret" }, { status: 401 });
  }

  if (!username || !password || password.length < 6) {
    return NextResponse.json({ error: "Username and password (min 6 chars) required" }, { status: 400 });
  }

  await initDb();
  const db = getClient();

  // Check if user already exists
  const existing = first(await db.execute({ sql: "SELECT id FROM users WHERE username = ?", args: [username] }));
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 12);
  await db.execute({
    sql: "INSERT INTO users (username, password_hash) VALUES (?, ?)",
    args: [username, hash],
  });

  return NextResponse.json({ ok: true, message: `User '${username}' created` });
}
