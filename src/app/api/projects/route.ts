import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { DEFAULT_PROJECT_TASKS } from "@/lib/projectTasks";
import { computeAndStoreCover, computeAndStoreSeo, parseSeoCache } from "@/lib/projectCache";

// Headroom for the one-off lazy backfill of cover/SEO caches on projects that
// predate those columns (each backfilled project persists individually, so even
// a timeout mid-way just resumes on the next request).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const stage = request.nextUrl.searchParams.get("stage");
  const completed = request.nextUrl.searchParams.get("completed");
  const paying = request.nextUrl.searchParams.get("paying");
  const clientStatus = request.nextUrl.searchParams.get("client_status");

  const ownerFilter = request.nextUrl.searchParams.get("owner");

  // Lightweight nav-badge count — one COUNT(*), no row data and no cover/SEO/task
  // enrichment. The shell only needs `.length` for the badge; fetching + enriching
  // the whole project list for that was a ~2s request on every app load.
  if (request.nextUrl.searchParams.get("count") === "1") {
    let csql = "SELECT COUNT(*) as count FROM projects p JOIN leads l ON p.lead_id = l.id";
    const cargs: unknown[] = [];
    if (paying === "true") csql += " WHERE p.stage != 'onboarding'";
    else if (completed === "true") csql += " WHERE p.completed_at != ''";
    else if (completed === "false") csql += " WHERE p.completed_at = ''";
    if (stage) { csql += (csql.includes("WHERE") ? " AND" : " WHERE") + " p.stage = ?"; cargs.push(stage); }
    if (clientStatus === "lost") csql += (csql.includes("WHERE") ? " AND" : " WHERE") + " p.client_status = 'lost'";
    else if (clientStatus === "active") csql += (csql.includes("WHERE") ? " AND" : " WHERE") + " (p.client_status IN ('active','refine') OR p.client_status IS NULL)";
    else if (completed === "true" || paying === "true") csql += " AND (p.client_status IN ('active','refine') OR p.client_status IS NULL)";
    if (ownerFilter === "__unassigned__") csql += (csql.includes("WHERE") ? " AND" : " WHERE") + " (l.owner = '' OR l.owner IS NULL)";
    else if (ownerFilter) { csql += (csql.includes("WHERE") ? " AND" : " WHERE") + " l.owner = ?"; cargs.push(ownerFilter); }
    const c = first(await db.execute({ sql: csql, args: cargs as never[] }));
    return NextResponse.json({ count: Number(c?.count) || 0 }, { headers: { "Cache-Control": "private, max-age=5" } });
  }

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

  // Cover + SEO-trend info comes from the cached columns on projects — the old
  // per-request window queries over project_files/seo_reports walked every
  // stored base64 blob's overflow pages and took ~30s (see src/lib/projectCache.ts).
  // NULL/'' caches (projects predating the columns) are computed per-project and
  // persisted right here — each one survives independently, so a slow first
  // request after deploy self-heals and every later request skips the blobs.
  if (projects.length > 0) {
    const ids = projects.map((p: Record<string, unknown>) => p.id);
    const placeholders = ids.map(() => "?").join(",");

    await Promise.all(projects.map(async (p) => {
      const pid = p.id as number;
      let coverId = p.cover_file_id as number | null;
      if (coverId === null || coverId === undefined) {
        try { coverId = await computeAndStoreCover(db, pid); } catch { coverId = 0; }
      }
      (p as Record<string, unknown>).has_cover = Number(coverId) > 0;
      (p as Record<string, unknown>).cover_version = Number(coverId) || 0;

      let seo = parseSeoCache(p.seo_cache);
      if (seo === null) {
        try { seo = await computeAndStoreSeo(db, pid); } catch { seo = {}; }
      }
      if (seo.s !== undefined) {
        (p as Record<string, unknown>).seo_score = seo.s;
        (p as Record<string, unknown>).seo_report_date = seo.d;
      }
      if (seo.p !== undefined) (p as Record<string, unknown>).seo_score_prev = seo.p;
      delete (p as Record<string, unknown>).seo_cache;
    }));

    if (completed === "true" || paying === "true") {
      const taskResult = await db.execute({ sql: `SELECT project_id, COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done FROM project_tasks WHERE project_id IN (${placeholders}) GROUP BY project_id`, args: ids as never[] });
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
