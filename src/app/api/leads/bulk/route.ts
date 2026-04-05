import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { action, ids, field, value } = await request.json();

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const placeholders = ids.map(() => "?").join(",");

  if (action === "update" && field && value !== undefined) {
    const allowed = ["status", "emailed", "messaged", "responded", "followed_up", "business_type", "follow_up_date", "website_status"];
    if (!allowed.includes(field)) return NextResponse.json({ error: "field not allowed" }, { status: 400 });
    await db.execute({ sql: `UPDATE leads SET ${field} = ?, updated_at = ? WHERE id IN (${placeholders})`, args: [value, now, ...ids] });
  } else if (action === "delete") {
    await db.execute({ sql: `DELETE FROM leads WHERE id IN (${placeholders})`, args: ids });
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, affected: ids.length });
}
