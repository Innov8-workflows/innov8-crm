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
  const contacted = await get("SELECT COUNT(*) as v FROM leads WHERE status != 'new'");
  const demoSent = await get("SELECT COUNT(*) as v FROM leads WHERE status IN ('demo_sent','interested','meeting_booked','won')");
  const responded = await get("SELECT COUNT(*) as v FROM leads WHERE responded = 1");
  const meetingsBooked = await get("SELECT COUNT(*) as v FROM leads WHERE status = 'meeting_booked'");
  const won = await get("SELECT COUNT(*) as v FROM leads WHERE status = 'won'");
  const lost = await get("SELECT COUNT(*) as v FROM leads WHERE status = 'lost'");

  const today = new Date().toISOString().split("T")[0];
  const overdue = await get(`SELECT COUNT(*) as v FROM leads WHERE follow_up_date != '' AND follow_up_date < '${today}' AND status NOT IN ('won','lost')`);
  const dueToday = await get(`SELECT COUNT(*) as v FROM leads WHERE follow_up_date = '${today}'`);

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const emailedThisWeek = await get(`SELECT COUNT(*) as v FROM email_logs WHERE created_at >= '${weekAgo}'`);

  return NextResponse.json({ total, contacted, demoSent, responded, meetingsBooked, won, lost, overdue, dueToday, emailedThisWeek });
}
