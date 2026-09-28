import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

// The morning brief for the Today view. Session-guarded by the middleware; the
// key-authenticated write side is /api/brief-agent.

const NO_STORE = { "Cache-Control": "private, no-store" };
const sqlNow = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** GET ?date=YYYY-MM-DD (default: the latest brief) */
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const asked = request.nextUrl.searchParams.get("date") || "";

  const runs = all(await db.execute(
    "SELECT brief_date, headline, received_at, item_count FROM brief_runs ORDER BY brief_date DESC LIMIT 14"));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : String(runs[0]?.brief_date || "");
  if (!date) return NextResponse.json({ run: null, runs: [], items: [] }, { headers: NO_STORE });

  const [run, items] = await Promise.all([
    db.execute({ sql: "SELECT * FROM brief_runs WHERE brief_date = ?", args: [date] }).then(first),
    db.execute({
      sql: `SELECT b.*, COALESCE(l.business_name, '') AS business_name,
                   COALESCE(t.title, '') AS task_title, COALESCE(t.completed, 0) AS task_done
              FROM brief_items b
              LEFT JOIN projects p ON p.id = b.project_id
              LEFT JOIN leads l ON l.id = p.lead_id
              LEFT JOIN project_tasks t ON t.id = b.task_id
             WHERE b.brief_date = ?
             ORDER BY CASE b.section WHEN 'attention' THEN 0 WHEN 'calendar' THEN 1 WHEN 'status' THEN 2 ELSE 3 END,
                      b.sort_order, b.id`,
      args: [date],
    }).then(all),
  ]);

  return NextResponse.json({
    run: run || null,
    runs: runs.map((r) => ({ date: String(r.brief_date), items: Number(r.item_count) })),
    items,
  }, { headers: NO_STORE });
}

/** PUT { id, dismissed: boolean } */
export async function PUT(request: NextRequest) {
  let b: { id?: number; dismissed?: boolean };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const id = Number(b.id || 0);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await initDb();
  const db = getClient();
  const res = await db.execute({
    sql: "UPDATE brief_items SET dismissed_at = ? WHERE id = ?",
    args: [b.dismissed ? sqlNow() : "", id],
  });
  if (!res.rowsAffected) return NextResponse.json({ error: "no such item" }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
