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
  // Never ship the Apps Script write key to the browser (see db.ts migration note).
  delete project.lead_ingest_key;
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

  const allowed = ["stage", "sort_order", "domain", "hosting_info", "monthly_fee", "renewal_date", "login_details", "project_notes", "completed_at", "won_at", "lost_at", "client_status", "invoice_status", "ga4_embedded", "ga4_conversions", "search_console_verified", "bing_console", "gbp_setup", "mobile_optimised", "link_card", "secure_file", "google_sheet", "google_rating", "google_review_count", "facebook_rating", "facebook_review_count"];
  const updates: string[] = [];
  const values: unknown[] = [];

  // won_at/lost_at feed every revenue range query, and the loop below is blind —
  // one toISOString written here poisons every date comparison downstream, and a
  // FUTURE date makes the row invisible in today's snapshot, silently breaking the
  // "snapshot as at today == live MRR" guarantee. Validate before the loop runs.
  const today = new Date().toISOString().slice(0, 10);
  for (const field of ["won_at", "lost_at"] as const) {
    if (field in body) {
      const v = String(body[field] ?? "");
      if (v !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return NextResponse.json({ error: `${field} must be YYYY-MM-DD` }, { status: 400 });
      }
      if (v > today) {
        return NextResponse.json({ error: `${field} cannot be in the future` }, { status: 400 });
      }
    }
  }

  for (const field of allowed) {
    if (field in body) { updates.push(`${field} = ?`); values.push(body[field]); }
  }

  // Churn date, stamped on the transition. Read the CURRENT status first — the
  // lead-status mirror further down runs after the UPDATE, so by then it's too late
  // to tell whether this is a genuine transition or a no-op re-save. Skipped when the
  // caller set lost_at explicitly (the won-dates modal correcting history).
  if ("client_status" in body && !("lost_at" in body)) {
    const cur = first(await db.execute({ sql: "SELECT client_status FROM projects WHERE id = ?", args: [Number(id)] }));
    const was = String(cur?.client_status || "");
    if (body.client_status === "lost" && was !== "lost") {
      updates.push("lost_at = ?"); values.push(today);
    } else if (body.client_status !== "lost" && was === "lost") {
      updates.push("lost_at = ?"); values.push("");   // reactivated
    }
  }

  // Handle capex — stored on the lead, not the project
  if ("capex" in body) {
    const proj = first(await db.execute({ sql: "SELECT lead_id FROM projects WHERE id = ?", args: [Number(id)] }));
    if (proj) {
      await db.execute({ sql: "UPDATE leads SET capex = ?, updated_at = ? WHERE id = ?", args: [body.capex, new Date().toISOString(), proj.lead_id as number] });
    }
  }

  if (updates.length === 0 && !("capex" in body)) return NextResponse.json({ error: "No fields" }, { status: 400 });

  if (updates.length > 0) {
    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(Number(id));
    await db.execute({ sql: `UPDATE projects SET ${updates.join(", ")} WHERE id = ?`, args: values as never[] });
  }

  // If completing the project, also update the lead
  if (body.completed_at) {
    const project = first(await db.execute({ sql: "SELECT lead_id FROM projects WHERE id = ?", args: [Number(id)] }));
    if (project) {
      await db.execute({ sql: "UPDATE leads SET status = 'completed', updated_at = ? WHERE id = ?", args: [new Date().toISOString(), project.lead_id as number] });
    }
  }

  // If marking as lost/reactivating, update the lead status too
  if (body.client_status) {
    const project = first(await db.execute({ sql: "SELECT lead_id FROM projects WHERE id = ?", args: [Number(id)] }));
    if (project) {
      const leadStatus = body.client_status === "lost" ? "lost" : "completed";
      await db.execute({ sql: "UPDATE leads SET status = ?, updated_at = ? WHERE id = ?", args: [leadStatus, new Date().toISOString(), project.lead_id as number] });
    }
  }

  const updated = first(await db.execute({
    sql: `SELECT p.*, l.business_name, l.contact_name, l.email, l.phone FROM projects p JOIN leads l ON p.lead_id = l.id WHERE p.id = ?`,
    args: [Number(id)],
  }));
  if (updated) delete updated.lead_ingest_key;

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb();
  const { id } = await params;
  const db = getClient();

  // Get the lead_id before deleting
  const project = first(await db.execute({ sql: "SELECT lead_id FROM projects WHERE id = ?", args: [Number(id)] }));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const leadId = project.lead_id as number;

  // Delete project (project_tasks and project_files cascade)
  await db.execute({ sql: "DELETE FROM projects WHERE id = ?", args: [Number(id)] });

  // Delete lead and all associated data (activities, notes, custom_field_values cascade)
  await db.execute({ sql: "DELETE FROM activities WHERE lead_id = ?", args: [leadId] });
  await db.execute({ sql: "DELETE FROM lead_notes WHERE lead_id = ?", args: [leadId] });
  await db.execute({ sql: "DELETE FROM custom_field_values WHERE lead_id = ?", args: [leadId] });
  await db.execute({ sql: "DELETE FROM email_logs WHERE lead_id = ?", args: [leadId] });
  await db.execute({ sql: "DELETE FROM leads WHERE id = ?", args: [leadId] });

  return NextResponse.json({ ok: true });
}
