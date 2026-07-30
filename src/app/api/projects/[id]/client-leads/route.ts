import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { monthRange, isValidPeriod } from "@/lib/clientReporting";

// The enquiries a client's own website has produced. Read/marked/deleted from
// the Client Dashboard's leads table.

// GET ?period=YYYY-MM&limit=&offset=  — omit period for "all time"
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const params = request.nextUrl.searchParams;
  const period = params.get("period") || "";
  const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 100));
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  const db = getClient();
  const where: string[] = ["project_id = ?"];
  const args: (string | number)[] = [projectId];
  if (period) {
    if (!isValidPeriod(period)) return NextResponse.json({ error: "bad period" }, { status: 400 });
    const r = monthRange(period);
    where.push("received_at >= ?", "received_at < ?");
    args.push(r.start, r.end);
  }
  const whereSql = where.join(" AND ");

  const [rows, count] = await Promise.all([
    db.execute({
      sql: `SELECT id, project_id, received_at, submitted_at, name, email, phone, message,
                   source, form_name, page_url, status
            FROM client_leads WHERE ${whereSql}
            ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    }).then(all),
    db.execute({ sql: `SELECT COUNT(*) AS total FROM client_leads WHERE ${whereSql}`, args }).then(first),
  ]);

  return NextResponse.json({ leads: rows, total: Number(count?.total) || 0 }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

// PUT { ids: number[], status: 'seen' | 'new' } — clears the unseen dot
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  const { ids, status } = await request.json();

  if (!projectId || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  const next = status === "new" ? "new" : "seen";
  const clean = ids.map(Number).filter(Boolean).slice(0, 500);
  if (clean.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const db = getClient();
  const placeholders = clean.map(() => "?").join(",");
  const res = await db.execute({
    sql: `UPDATE client_leads SET status = ? WHERE project_id = ? AND id IN (${placeholders})`,
    args: [next, projectId, ...clean],
  });
  return NextResponse.json({ ok: true, updated: Number(res.rowsAffected) || 0 });
}

// DELETE ?lead_id=N — for spam / test rows
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  const leadId = Number(request.nextUrl.searchParams.get("lead_id"));
  if (!projectId || !leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const db = getClient();
  await db.execute({ sql: "DELETE FROM client_leads WHERE id = ? AND project_id = ?", args: [leadId, projectId] });
  return NextResponse.json({ ok: true });
}
