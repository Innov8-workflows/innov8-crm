import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb();
  const { id } = await params;
  const db = getClient();

  const lead = first(await db.execute({ sql: "SELECT * FROM leads WHERE id = ?", args: [Number(id)] }));
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb();
  const { id } = await params;
  const db = getClient();
  const body = await request.json();

  const allowedFields = [
    "business_name", "contact_name", "email", "phone", "business_type",
    "location", "website_status", "emailed", "messaged", "responded",
    "followed_up", "capex", "notes", "status", "follow_up_date", "demo_site_url", "owner",
  ];

  const updates: string[] = [];
  const values: unknown[] = [];

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

  await db.execute({ sql: `UPDATE leads SET ${updates.join(", ")} WHERE id = ?`, args: values as never[] });

  const lead = first(await db.execute({ sql: "SELECT * FROM leads WHERE id = ?", args: [Number(id)] }));
  return NextResponse.json(lead);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb();
  const { id } = await params;
  const db = getClient();
  await db.execute({ sql: "DELETE FROM leads WHERE id = ?", args: [Number(id)] });
  return NextResponse.json({ ok: true });
}
