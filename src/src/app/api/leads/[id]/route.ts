import { NextRequest, NextResponse } from "next/server";
import { getDb, persist } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();

  const stmt = db.prepare("SELECT * FROM leads WHERE id = ?");
  stmt.bind([Number(id)]);

  if (!stmt.step()) {
    stmt.free();
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lead = stmt.getAsObject();
  stmt.free();
  return NextResponse.json(lead);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();
  const body = await request.json();

  const allowedFields = [
    "business_name", "contact_name", "email", "phone", "business_type",
    "location", "website_status", "emailed", "messaged", "responded",
    "followed_up", "capex", "notes",
  ];

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(Number(id));

  db.run(`UPDATE leads SET ${updates.join(", ")} WHERE id = ?`, values);
  persist();

  const stmt = db.prepare("SELECT * FROM leads WHERE id = ?");
  stmt.bind([Number(id)]);
  stmt.step();
  const lead = stmt.getAsObject();
  stmt.free();

  return NextResponse.json(lead);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();

  db.run("DELETE FROM leads WHERE id = ?", [Number(id)]);
  persist();

  return NextResponse.json({ ok: true });
}
