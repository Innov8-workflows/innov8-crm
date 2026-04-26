import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import type { InValue } from "@libsql/client";

// GET options:
//   ?entity_type=lead&entity_id=42 → solutions for one entity, joined to catalogue
//   ?view=matrix                    → all entity_solutions joined with business_name (for matrix)
//   ?solution_id=5                  → all entities for a single solution
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const params = request.nextUrl.searchParams;
  const view = params.get("view");
  const entityType = params.get("entity_type");
  const entityId = params.get("entity_id");
  const solutionId = params.get("solution_id");

  if (view === "matrix") {
    // Return all rows joined with business_name from leads (works for both lead and project)
    const sql = `
      SELECT es.*,
        sc.name as solution_name,
        sc.category as category,
        CASE
          WHEN es.entity_type = 'lead' THEN l.business_name
          WHEN es.entity_type = 'project' THEN pl.business_name
        END as business_name
      FROM entity_solutions es
      JOIN solutions_catalogue sc ON sc.id = es.solution_id
      LEFT JOIN leads l ON es.entity_type = 'lead' AND l.id = es.entity_id
      LEFT JOIN projects p ON es.entity_type = 'project' AND p.id = es.entity_id
      LEFT JOIN leads pl ON p.lead_id = pl.id
    `;
    const result = await db.execute(sql);
    return NextResponse.json({ entity_solutions: all(result) }, {
      headers: { "Cache-Control": "private, max-age=10" },
    });
  }

  if (entityType && entityId) {
    const result = await db.execute({
      sql: `SELECT es.*, sc.name as solution_name, sc.category, sc.upfront_price as catalogue_upfront, sc.monthly_price as catalogue_monthly
            FROM entity_solutions es
            JOIN solutions_catalogue sc ON sc.id = es.solution_id
            WHERE es.entity_type = ? AND es.entity_id = ?`,
      args: [entityType, Number(entityId)],
    });
    return NextResponse.json({ entity_solutions: all(result) }, {
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }

  if (solutionId) {
    const result = await db.execute({
      sql: `SELECT * FROM entity_solutions WHERE solution_id = ?`,
      args: [Number(solutionId)],
    });
    return NextResponse.json({ entity_solutions: all(result) });
  }

  return NextResponse.json({ error: "entity_type+entity_id or view=matrix required" }, { status: 400 });
}

// PUT — upsert (create or update by entity_type + entity_id + solution_id)
// Auto-stamps proposed_at / sold_at / delivered_at when status transitions.
export async function PUT(request: NextRequest) {
  await initDb();
  const db = getClient();
  const body = await request.json();

  const { entity_type, entity_id, solution_id, status, monthly_upcharge, upfront_charged, notes } = body;
  if (!entity_type || !entity_id || !solution_id) {
    return NextResponse.json({ error: "entity_type, entity_id, solution_id required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const newStatus = status || "proposed";

  // Look up existing row to detect status transitions
  const existing = first(await db.execute({
    sql: "SELECT * FROM entity_solutions WHERE entity_type = ? AND entity_id = ? AND solution_id = ?",
    args: [entity_type, Number(entity_id), Number(solution_id)],
  }));

  // Compute timestamps based on transitions
  const proposed_at = (existing?.proposed_at as string) || now; // first sight = proposed
  const sold_at = newStatus === "sold" || newStatus === "delivered"
    ? ((existing?.sold_at as string) || now)
    : (existing?.sold_at as string) || "";
  const delivered_at = newStatus === "delivered"
    ? ((existing?.delivered_at as string) || now)
    : (existing?.delivered_at as string) || "";

  // Use catalogue defaults if upcharge not provided
  let mu = monthly_upcharge;
  let uc = upfront_charged;
  if (mu === undefined || uc === undefined) {
    const cat = first(await db.execute({
      sql: "SELECT upfront_price, monthly_price FROM solutions_catalogue WHERE id = ?",
      args: [Number(solution_id)],
    }));
    if (mu === undefined) mu = (cat?.monthly_price as number) || 0;
    if (uc === undefined) uc = (cat?.upfront_price as number) || 0;
  }

  await db.execute({
    sql: `INSERT INTO entity_solutions
      (entity_type, entity_id, solution_id, status, monthly_upcharge, upfront_charged, notes, proposed_at, sold_at, delivered_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_type, entity_id, solution_id) DO UPDATE SET
        status = excluded.status,
        monthly_upcharge = excluded.monthly_upcharge,
        upfront_charged = excluded.upfront_charged,
        notes = excluded.notes,
        sold_at = excluded.sold_at,
        delivered_at = excluded.delivered_at,
        updated_at = excluded.updated_at`,
    args: [
      entity_type, Number(entity_id), Number(solution_id),
      newStatus,
      Number(mu) || 0,
      Number(uc) || 0,
      notes || "",
      proposed_at,
      sold_at,
      delivered_at,
      (existing?.created_at as string) || now,
      now,
    ] as InValue[],
  });

  return NextResponse.json({ ok: true });
}

// DELETE ?id=
export async function DELETE(request: NextRequest) {
  await initDb();
  const db = getClient();
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.execute({ sql: "DELETE FROM entity_solutions WHERE id = ?", args: [Number(id)] });
  return NextResponse.json({ ok: true });
}
