import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { DEFAULT_PROJECT_TASKS } from "@/lib/projectTasks";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const stage = request.nextUrl.searchParams.get("stage");
  const completed = request.nextUrl.searchParams.get("completed");
  const clientStatus = request.nextUrl.searchParams.get("client_status");

  const ownerFilter = request.nextUrl.searchParams.get("owner");

  let sql = `SELECT p.*, l.business_name, l.contact_name, l.email, l.phone, l.business_type, l.location, l.capex, l.demo_site_url, l.owner
    FROM projects p JOIN leads l ON p.lead_id = l.id`;
  const args: unknown[] = [];

  if (completed === "true") {
    sql += " WHERE p.completed_at != ''";
  } else if (completed === "false") {
    sql += " WHERE p.completed_at = ''";
  }

  if (stage) {
    sql += (sql.includes("WHERE") ? " AND" : " WHERE") + " p.stage = ?";
    args.push(stage);
  }

  // Filter by client_status — defaults to active+refine for completed projects
  if (clientStatus === "lost") {
    sql += (sql.includes("WHERE") ? " AND" : " WHERE") + " p.client_status = 'lost'";
  } else if (clientStatus === "active") {
    sql += (sql.includes("WHERE") ? " AND" : " WHERE") + " (p.client_status IN ('active', 'refine') OR p.client_status IS NULL)";
  } else if (completed === "true") {
    sql += " AND (p.client_status IN ('active', 'refine') OR p.client_status IS NULL)";
  }

  // Filter by owner (via lead)
  if (ownerFilter === "__unassigned__") {
    sql += (sql.includes("WHERE") ? " AND" : " WHERE") + " (l.owner = '' OR l.owner IS NULL)";
  } else if (ownerFilter) {
    sql += (sql.includes("WHERE") ? " AND" : " WHERE") + " l.owner = ?";
    args.push(ownerFilter);
  }

  sql += " ORDER BY p.sort_order ASC, p.created_at DESC";

  const result = await db.execute({ sql, args: args as never[] });
  const projects = all(result);

  // Flag projects that HAVE a cover image, but don't include the base64 data.
  // Images are served lazily via /api/projects/[id]/cover with browser caching.
  if (projects.length > 0) {
    const ids = projects.map((p: Record<string, unknown>) => p.id);
    const placeholders = ids.map(() => "?").join(",");

    const batchQueries: Promise<unknown>[] = [
      // Just flag which projects have at least one image — no URL data transferred
      db.execute({
        sql: `SELECT DISTINCT project_id FROM project_files WHERE project_id IN (${placeholders}) AND (file_type LIKE 'image/%' OR url LIKE 'data:image/%' OR is_cover = 1)`,
        args: ids as never[],
      }),
    ];

    if (completed === "true") {
      batchQueries.push(
        db.execute({ sql: `SELECT project_id, COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done FROM project_tasks WHERE project_id IN (${placeholders}) GROUP BY project_id`, args: ids as never[] }),
      );
    }

    const results = await Promise.all(batchQueries);
    const hasCoverResult = results[0] as import("@libsql/client").ResultSet;

    const hasCover: Record<number, boolean> = {};
    for (const row of all(hasCoverResult)) {
      hasCover[row.project_id as number] = true;
    }

    for (const p of projects) {
      const pid = p.id as number;
      (p as Record<string, unknown>).has_cover = hasCover[pid] || false;
    }

    if (completed === "true") {
      const taskResult = results[1] as import("@libsql/client").ResultSet;
      const taskStats: Record<number, { total: number; done: number }> = {};
      for (const row of all(taskResult)) {
        taskStats[row.project_id as number] = { total: row.total as number, done: row.done as number };
      }
      for (const p of projects) {
        const pid = p.id as number;
        (p as Record<string, unknown>).tasks_total = taskStats[pid]?.total || 0;
        (p as Record<string, unknown>).tasks_done = taskStats[pid]?.done || 0;
      }
    }
  }

  return NextResponse.json({ projects }, {
    headers: { "Cache-Control": "private, max-age=10" },
  });
}

// Create project from a won lead
export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { lead_id } = await request.json();

  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  // Check if project already exists for this lead
  const existing = first(await db.execute({ sql: "SELECT id FROM projects WHERE lead_id = ?", args: [lead_id] }));
  if (existing) return NextResponse.json({ error: "Project already exists", project_id: existing.id }, { status: 409 });

  const now = new Date().toISOString();
  const maxOrder = first(await db.execute("SELECT COALESCE(MAX(sort_order), 0) as v FROM projects"));
  const nextOrder = ((maxOrder?.v as number) || 0) + 1;

  const result = await db.execute({
    sql: `INSERT INTO projects (lead_id, stage, sort_order, created_at, updated_at) VALUES (?, 'onboarding', ?, ?, ?)`,
    args: [lead_id, nextOrder, now, now],
  });

  // Update lead status to won
  await db.execute({ sql: "UPDATE leads SET status = 'won', updated_at = ? WHERE id = ?", args: [now, lead_id] });

  // Create default tasks (shared list — see src/lib/projectTasks.ts)
  for (let i = 0; i < DEFAULT_PROJECT_TASKS.length; i++) {
    const t = DEFAULT_PROJECT_TASKS[i];
    await db.execute({
      sql: "INSERT INTO project_tasks (project_id, title, stage, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [result.lastInsertRowid!, t.title, t.stage, i, now],
    });
  }

  const project = first(await db.execute({
    sql: `SELECT p.*, l.business_name, l.contact_name, l.email, l.phone, l.business_type, l.location
      FROM projects p JOIN leads l ON p.lead_id = l.id WHERE p.id = ?`,
    args: [result.lastInsertRowid!],
  }));

  return NextResponse.json(project, { status: 201 });
}
