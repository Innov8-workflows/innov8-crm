import { NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import type { InValue } from "@libsql/client";

export async function GET() {
  await initDb();
  const db = getClient();

  const get = async (sql: string, args?: InValue[]) => {
    const r = first(await db.execute({ sql, args: args || [] }));
    return (r?.v as number) || 0;
  };

  const today = new Date().toISOString().split("T")[0];

  const [total, emailed, messaged, called, meetingsBooked, won, lost, overdue, dueToday] = await Promise.all([
    get("SELECT COUNT(*) as v FROM leads"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'emailed'"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'messaged'"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'called'"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'meeting_booked'"),
    get("SELECT COUNT(*) as v FROM leads WHERE status IN ('won','completed')"),
    get("SELECT COUNT(*) as v FROM leads WHERE status = 'lost'"),
    get("SELECT COUNT(*) as v FROM leads WHERE follow_up_date != '' AND follow_up_date < ? AND status NOT IN ('won','lost','completed')", [today]),
    get("SELECT COUNT(*) as v FROM leads WHERE follow_up_date = ?", [today]),
  ]);

  return NextResponse.json({ total, emailed, messaged, called, meetingsBooked, won, lost, overdue, dueToday });
}
