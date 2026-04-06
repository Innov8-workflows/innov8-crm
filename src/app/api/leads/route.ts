import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import type { InValue } from "@libsql/client";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const params = request.nextUrl.searchParams;

  const businessType = params.get("business_type");
  const search = params.get("search");
  const sort = params.get("sort") || "business_name";
  const order = params.get("order") || "asc";

  const allowedSorts = [
    "business_name", "contact_name", "email", "business_type",
    "location", "emailed", "responded", "followed_up", "created_at", "updated_at",
  ];
  const sortCol = allowedSorts.includes(sort) ? sort : "business_name";
  const sortDir = order === "desc" ? "DESC" : "ASC";

  const conditions: string[] = [];
  const values: InValue[] = [];

  if (businessType && businessType !== "All") {
    conditions.push("business_type LIKE ?");
    values.push(`%${businessType}%`);
  }

  if (search) {
    conditions.push("(business_name LIKE ? OR contact_name LIKE ? OR email LIKE ?)");
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const ownerFilter = params.get("owner");
  if (ownerFilter === "__unassigned__") {
    conditions.push("(owner = '' OR owner IS NULL)");
  } else if (ownerFilter) {
    conditions.push("owner = ?");
    values.push(ownerFilter);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.execute({
    sql: `SELECT * FROM leads ${where} ORDER BY sort_order ASC, ${sortCol} ${sortDir}`,
    args: values,
  });

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as total FROM leads ${where}`,
    args: values,
  });

  return NextResponse.json({ leads: all(result), total: first(countResult)?.total });
}

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const body = await request.json();

  const {
    business_name, contact_name = "", email = "", phone = "",
    business_type = "", location = "", website_status = 0,
    emailed = 0, messaged = 0, responded = 0, followed_up = 0,
    capex = null, notes = "", status = "new", follow_up_date = "", demo_site_url = "",
    owner = "",
  } = body;

  if (!business_name) {
    return NextResponse.json({ error: "business_name is required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Always append at bottom: set sort_order to max + 1
  const maxOrder = first(await db.execute("SELECT COALESCE(MAX(sort_order), 0) as v FROM leads"));
  const nextOrder = ((maxOrder?.v as number) || 0) + 1;

  const result = await db.execute({
    sql: `INSERT INTO leads (business_name, contact_name, email, phone, business_type, location,
      website_status, emailed, messaged, responded, followed_up, capex, notes, status, follow_up_date, demo_site_url, owner, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [business_name, contact_name, email, phone, business_type, location,
      website_status, emailed, messaged, responded, followed_up, capex, notes, status, follow_up_date, demo_site_url, owner, nextOrder, now, now],
  });

  const lead = first(await db.execute({ sql: "SELECT * FROM leads WHERE id = ?", args: [result.lastInsertRowid!] }));
  return NextResponse.json(lead, { status: 201 });
}
