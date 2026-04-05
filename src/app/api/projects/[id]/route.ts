import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb();
  const { id } = await params;
  const db = getClient();

  const project = first(await db.execute({
    sql: `SELECT p.*, l.business_name, l.contact_name, l.email, l.phone, l.business_type, l.location, l.demo_site_url
      FROM projects p JOIN leads l ON p.lead_id = l.id WHERE p.id = ?`,
    args: [Number(id)],
  }));

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb();
  const { id } = await params;
  const db = getClient();
  const body = await request.json();

  const allowed = ["stage", "sort_order", "domain", "hosting_info", "monthly_fee", "renewal_date", "login_details", "project_notes", "completed_at"];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowed) {
    if (field in body) { updates.push(`${field} = ?`); values.push(body[field]); }
  }

  if (updates.length === 0) return NextResponse.json({ error: "No fields" }, { status: 400 });

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(Number(id));

  await db.execute({ sql: `UPDATE projects SET ${updates.join(", ")} WHERE id = ?`, args: values as never[] });

  // If completing the project, also update the lead
  if (body.completed_at) {
    const project = first(await db.execute({ sql: "SELECT lead_id FROM projects WHERE id = ?", args: [Number(id)] }));
    if (project) {
      await db.execute({ sql: "UPDATE leads SET status = 'completed', updated_at = ? WHERE id = ?", args: [new Date().toISOString(), project.lead_id as number] });
    }
  }

  const updated = first(await db.execute({
    sql: `SELECT p.*, l.business_name, l.contact_name, l.email, l.phone FROM projects p JOIN leads l ON p.lead_id = l.id WHERE p.id = ?`,
    args: [Number(id)],
  }));

  return NextResponse.json(updated);
}
