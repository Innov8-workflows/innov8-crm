import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";

// GET: fetch all custom field values (optionally for a specific lead)
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const leadId = request.nextUrl.searchParams.get("lead_id");

  if (leadId) {
    const result = await db.execute({
      sql: "SELECT * FROM custom_field_values WHERE lead_id = ?",
      args: [Number(leadId)],
    });
    return NextResponse.json({ values: all(result) }, {
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }

  // Return all custom field values (legacy fallback — the grid normally gets these
  // via /api/bootstrap). Empty values render identically to missing ones, so
  // don't ship them — on a mature DB they're a large share of the rows.
  const result = await db.execute("SELECT lead_id, field_id, value FROM custom_field_values WHERE value != '' AND value IS NOT NULL");
  return NextResponse.json({ values: all(result) }, {
    headers: { "Cache-Control": "private, max-age=5" },
  });
}

// PUT: set a custom field value for a lead
export async function PUT(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { lead_id, field_id, value } = await request.json();

  if (!lead_id || !field_id) {
    return NextResponse.json({ error: "lead_id and field_id required" }, { status: 400 });
  }

  await db.execute({
    sql: `INSERT INTO custom_field_values (lead_id, field_id, value)
          VALUES (?, ?, ?)
          ON CONFLICT(lead_id, field_id) DO UPDATE SET value = ?`,
    args: [lead_id, field_id, value || "", value || ""],
  });

  return NextResponse.json({ ok: true });
}
