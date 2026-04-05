import { NextRequest, NextResponse } from "next/server";
import { getDb, persist } from "@/lib/db";

export async function GET(request: NextRequest) {
  const db = await getDb();
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
  const values: (string | number)[] = [];

  if (businessType && businessType !== "All") {
    conditions.push("business_type LIKE ?");
    values.push(`%${businessType}%`);
  }

  if (search) {
    conditions.push("(business_name LIKE ? OR contact_name LIKE ? OR email LIKE ?)");
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM leads ${where} ORDER BY ${sortCol} ${sortDir}`;

  const stmt = db.prepare(sql);
  values.forEach((v, i) => stmt.bind({ [i + 1]: v }));

  const leads = [];
  while (stmt.step()) {
    leads.push(stmt.getAsObject());
  }
  stmt.free();

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM leads ${where}`);
  values.forEach((v, i) => countStmt.bind({ [i + 1]: v }));
  countStmt.step();
  const total = countStmt.getAsObject().total;
  countStmt.free();

  return NextResponse.json({ leads, total });
}

export async function POST(request: NextRequest) {
  const db = await getDb();
  const body = await request.json();

  const {
    business_name, contact_name = "", email = "", phone = "",
    business_type = "", location = "", website_status = 0,
    emailed = 0, messaged = 0, responded = 0, followed_up = 0,
    capex = null, notes = "",
  } = body;

  if (!business_name) {
    return NextResponse.json({ error: "business_name is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  db.run(
    `INSERT INTO leads (business_name, contact_name, email, phone, business_type, location,
      website_status, emailed, messaged, responded, followed_up, capex, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [business_name, contact_name, email, phone, business_type, location,
      website_status, emailed, messaged, responded, followed_up, capex, notes, now, now]
  );

  persist();

  const stmt = db.prepare("SELECT * FROM leads WHERE id = last_insert_rowid()");
  stmt.step();
  const lead = stmt.getAsObject();
  stmt.free();

  return NextResponse.json(lead, { status: 201 });
}
