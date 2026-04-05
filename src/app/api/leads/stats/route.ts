import { NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

export async function GET() {
  await initDb();
  const db = getClient();

  const get = async (sql: string) => {
    const r = first(await db.execute(sql));
    return (r?.v as number) || 0;
  };

  const total = await get("SELECT COUNT(*) as v FROM leads");
  const emailed = await get("SELECT COUNT(*) as v FROM leads WHERE status = 'emailed'");
  const messaged = await get("SELECT COUNT(*) as v FROM leads WHERE status = 'messaged'");
  const called = await get("SELECT COUNT(*) as v FROM leads WHERE status = 'called'");
  const meetingsBooked = await get("SELECT COUNT(*) as v FROM leads WHERE status = 'meeting_booked'");
  const won = await get("SELECT COUNT(*) as v FROM leads WHERE status IN ('won','completed')");
  const lost = await get("SELECT COUNT(*) as v FROM leads WHERE status = 'lost'");

  const today = new Date().toISOString().split("T")[0];
  const overdue = await get(`SELECT COUNT(*) as v FROM leads WHERE follow_up_date != '' AND follow_up_date < '${today}' AND status NOT IN ('won','lost','completed')`);
  const dueToday = await get(`SELECT COUNT(*) as v FROM leads WHERE follow_up_date = '${today}'`);

  return NextResponse.json({ total, emailed, messaged, called, meetingsBooked, won, lost, overdue, dueToday });
}
