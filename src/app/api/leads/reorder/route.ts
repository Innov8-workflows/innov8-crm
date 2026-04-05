import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { orderedIds } = await request.json();

  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: "orderedIds array required" }, { status: 400 });
  }

  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute({ sql: "UPDATE leads SET sort_order = ? WHERE id = ?", args: [i, orderedIds[i]] });
  }

  return NextResponse.json({ ok: true });
}
