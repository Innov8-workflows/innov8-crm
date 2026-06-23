import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { DEFAULT_PROJECT_TASKS } from "@/lib/projectTasks";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const stage = request.nextUrl.searchParams.get("stage");
  const completed = request.nextUrl.searchParams.get("completed");
  const paying = request.nextUrl.searchParams.get("paying");
  const clientStatus = request.nextUrl.searchParams.get("client_status");

  const ownerFilter = request.nextUrl.searchParams.get("owner");

  let sql = `SELECT p.*, l.business_name, l.contact_name, l.email, l.phone, l.business_type, l.location, l.capex, l.demo_site_url, l.owner
    FROM projects p JOIN leads l ON p.lead_id = l.id`;
  const args: unknown[] = [];

  // ?paying=true → everything past onboarding (subscription has started)
  // ?completed=true → just completed projects (live site delivered)
  if (paying === "true") {
    sql += " WHERE p.stage != 'onboarding'";
  } else if (completed === "true") {
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
  } else if (completed === "true" || paying === "true") {
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
      // Per project, the id of the file the cover endpoint WOULD serve (same WHERE
      // + ORDER BY). We hand this back as cover_version so the card's <img> can
      // cache-bust: /cover is cached immutable, so without a version that changes
      // when the cover changes the browser keeps showing the old image. No base64
      // data is transferred — just the id.
      db.execute({
        sql: `SELECT project_id, id AS cover_id FROM (
                 SELECT project_id, id,
                        ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY is_cover DESC, created_at ASC) AS rn
                 FROM project_files
                 WHERE project_id IN (${placeholders}) AND (file_type LIKE 'image/%' OR url LIKE 'data:image/%' OR is_cover = 1)
               ) WHERE rn = 1`,
        args: ids as never[],
      }),
      // Per project, the latest two SEO report scores (+ latest date) so the client
      // card can show "score/10 + ↑/↓ trend" without an N-call fan-out. rn=1 is the
      // latest, rn=2 the previous. (Same window-function shape as cover_version.)
      db.execute({
        sql: `SELECT project_id, score, logged_at, rn FROM (
                 SELECT project_id, score, logged_at,
                        ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY logged_at DESC, id DESC) AS rn
                 FROM seo_reports
                 WHERE project_id IN (${placeholders})
               ) WHERE rn <= 2`,
        args: ids as never[],
      }),
    ];

    if (completed === "true" || paying === "true") {
      batchQueries.push(
        db.execute({ sql: `SELECT project_id, COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done FROM project_tasks WHERE project_id IN (${placeholders}) GROUP BY project_id`, args: ids as never[] }),
      );
    }

    const results = await Promise.all(batchQueries);
    const hasCoverResult = results[0] as import("@libsql/client").ResultSet;

    const coverId: Record<number, number> = {};
    for (const row of all(hasCoverResult)) {
      coverId[row.project_id as number] = row.cover_id as number;
    }

    for (const p of projects) {
      const pid = p.id as number;
      const cid = coverId[pid];
      (p as Record<string, unknown>).has_cover = cid !== undefined;
      (p as Record<string, unknown>).cover_version = cid ?? 0;
    }

    // Latest + previous SEO report score per project (for the card trend).
    const seoResult = results[1] as import("@libsql/client").ResultSet;
    const seoLatest: Record<number, { score: number; date: string }> = {};
    const seoPrev: Record<number, number> = {};
    for (const row of all(seoResult)) {
      const pid = row.project_id as number;
      if ((row.rn as number) === 1) seoLatest[pid] = { score: Number(row.score), date: String(row.logged_at) };
      else seoPrev[pid] = Number(row.score);
    }
    for (const p of projects) {
      const pid = p.id as number;
      if (seoLatest[pid]) {
        (p as Record<string, unknown>).seo_score = seoLatest[pid].score;
        (p as Record<string, unknown>).seo_report_date = seoLatest[pid].date;
      }
      if (seoPrev[pid] !== undefined) (p as Record<string, unknown>).seo_score_prev = seoPrev[pid];
    }

    if (completed === "true" || paying === "true") {
      const taskResult = results[2] as import("@libsql/client").ResultSet;
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
    // No-store: the list feeds card cover images (cover_version) + stats, so it
    // must reflect a cover/image change on the very next refetch, not up to 10s later.
    headers: { "Cache-Control": "private, no-store" },
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
