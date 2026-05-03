import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import { DEFAULT_PROJECT_TASKS } from "@/lib/projectTasks";

// POST /api/projects/[id]/sync-tasks
// Adds any default tasks that aren't already on this project. Existing tasks
// (completed or not) are left untouched. Idempotent — safe to call repeatedly.
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const db = getClient();
  const existing = all(await db.execute({
    sql: "SELECT title FROM project_tasks WHERE project_id = ?",
    args: [projectId],
  }));
  const existingTitles = new Set(existing.map((r) => (r.title as string).toLowerCase().trim()));

  // Get max sort_order so we append, not overwrite
  const maxOrderResult = await db.execute({
    sql: "SELECT COALESCE(MAX(sort_order), 0) as v FROM project_tasks WHERE project_id = ?",
    args: [projectId],
  });
  let nextOrder = ((maxOrderResult.rows[0] as unknown as { v: number })?.v) || 0;

  const now = new Date().toISOString();
  let added = 0;

  for (const t of DEFAULT_PROJECT_TASKS) {
    if (existingTitles.has(t.title.toLowerCase().trim())) continue;
    nextOrder += 1;
    await db.execute({
      sql: "INSERT INTO project_tasks (project_id, title, stage, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [projectId, t.title, t.stage, nextOrder, now],
    });
    added += 1;
  }

  return NextResponse.json({ added, total_in_catalogue: DEFAULT_PROJECT_TASKS.length });
}
