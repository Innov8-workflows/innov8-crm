import { NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";

export async function GET() {
  await initDb();
  const db = getClient();
  const result = await db.execute("SELECT username FROM users ORDER BY username ASC");
  const users = all(result).map((r) => r.username as string);
  return NextResponse.json({ users });
}
