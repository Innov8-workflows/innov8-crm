import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const name = request.nextUrl.searchParams.get("name");
  const email = request.nextUrl.searchParams.get("email");

  let duplicates: Record<string, unknown>[] = [];

  if (name) {
    const r = await db.execute({ sql: "SELECT id, business_name, email FROM leads WHERE business_name LIKE ? COLLATE NOCASE", args: [`%${name}%`] });
    duplicates = all(r);
  }

  if (email && email.length > 3) {
    const r = await db.execute({ sql: "SELECT id, business_name, email FROM leads WHERE email = ? COLLATE NOCASE", args: [email] });
    const emailDups = all(r);
    for (const d of emailDups) {
      if (!duplicates.find((x) => x.id === d.id)) duplicates.push(d);
    }
  }

  return NextResponse.json({ duplicates, hasDuplicates: duplicates.length > 0 });
}
