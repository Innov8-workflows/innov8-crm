import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";

// GET /api/projects/[id]/seo  → list of completion log entries (newest first)
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const db = getClient();
  const r = await db.execute({
    sql: "SELECT id, task_ids, notes, completed_at FROM seo_geo_logs WHERE project_id = ? ORDER BY completed_at DESC",
    args: [projectId],
  });
  return NextResponse.json({ logs: all(r) }, {
    headers: { "Cache-Control": "private, max-age=5" },
  });
}

// POST body { task_ids: string[]; notes?: string }
// Records one log entry containing every task the user ticked + bumps the
// project's last_seo_date so the Live Clients card shows the new timestamp.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await request.json();
  const taskIds: string[] = Array.isArray(body?.task_ids) ? body.task_ids : [];
  if (taskIds.length === 0) return NextResponse.json({ error: "task_ids required" }, { status: 400 });
  const notes = (body?.notes || "").slice(0, 1000);

  const now = new Date().toISOString();
  const db = getClient();

  await db.execute({
    sql: "INSERT INTO seo_geo_logs (project_id, task_ids, notes, completed_at) VALUES (?, ?, ?, ?)",
    args: [projectId, taskIds.join(","), notes, now],
  });
  await db.execute({
    sql: "UPDATE projects SET last_seo_date = ?, updated_at = ? WHERE id = ?",
    args: [now, now, projectId],
  });

  return NextResponse.json({ ok: true, completed_at: now });
}

// DELETE /api/projects/[id]/seo?log_id=N — undo a log entry
// Also recomputes last_seo_date to the next most-recent log's timestamp.
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  const logId = Number(request.nextUrl.searchParams.get("log_id"));
  if (!projectId || !logId) return NextResponse.json({ error: "bad params" }, { status: 400 });

  const db = getClient();
  await db.execute({ sql: "DELETE FROM seo_geo_logs WHERE id = ? AND project_id = ?", args: [logId, projectId] });

  // Recompute last_seo_date from remaining logs (or '' if none)
  const remaining = await db.execute({
    sql: "SELECT completed_at FROM seo_geo_logs WHERE project_id = ? ORDER BY completed_at DESC LIMIT 1",
    args: [projectId],
  });
  const nextDate = remaining.rows[0] ? (remaining.rows[0] as unknown as { completed_at: string }).completed_at : "";
  await db.execute({
    sql: "UPDATE projects SET last_seo_date = ?, updated_at = ? WHERE id = ?",
    args: [nextDate, new Date().toISOString(), projectId],
  });

  return NextResponse.json({ ok: true, last_seo_date: nextDate });
}
