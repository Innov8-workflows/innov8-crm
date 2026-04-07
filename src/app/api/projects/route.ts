import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

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

  // Enrich ALL projects with cover images (single batch query instead of N+1)
  if (projects.length > 0) {
    const ids = projects.map((p: Record<string, unknown>) => p.id);
    const placeholders = ids.map(() => "?").join(",");

    const batchQueries: Promise<unknown>[] = [
      // Explicitly set covers
      db.execute({ sql: `SELECT project_id, url FROM project_files WHERE project_id IN (${placeholders}) AND is_cover = 1`, args: ids as never[] }),
      // Fallback: first image file per project (for when no cover is set)
      db.execute({ sql: `SELECT project_id, url FROM project_files WHERE project_id IN (${placeholders}) AND (file_type LIKE 'image/%' OR url LIKE 'data:image/%') ORDER BY created_at ASC`, args: ids as never[] }),
    ];

    // Task stats only needed for completed projects view
    if (completed === "true") {
      batchQueries.push(
        db.execute({ sql: `SELECT project_id, COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done FROM project_tasks WHERE project_id IN (${placeholders}) GROUP BY project_id`, args: ids as never[] }),
      );
    }

    const results = await Promise.all(batchQueries);
    const coverResult = results[0] as import("@libsql/client").ResultSet;
    const allImagesResult = results[1] as import("@libsql/client").ResultSet;

    const covers: Record<number, string> = {};
    for (const row of all(coverResult)) {
      covers[row.project_id as number] = row.url as string;
    }
    // Fallback to first image if no explicit cover
    for (const row of all(allImagesResult)) {
      const pid = row.project_id as number;
      if (!covers[pid]) covers[pid] = row.url as string;
    }

    for (const p of projects) {
      const pid = p.id as number;
      (p as Record<string, unknown>).cover_image = covers[pid] || null;
    }

    if (completed === "true") {
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

  return NextResponse.json({ projects });
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

  // Create default tasks
  const defaultTasks = [
    { title: "Initial client meeting", stage: "onboarding" },
    { title: "Collect brand assets (logo, colours, photos)", stage: "onboarding" },
    { title: "Domain registration / transfer", stage: "onboarding" },
    { title: "Design mockup / wireframe", stage: "design_content" },
    { title: "Client design approval", stage: "design_content" },
    { title: "Collect page content / copy", stage: "design_content" },
    { title: "Collect product/service photos", stage: "design_content" },
    { title: "Build website", stage: "build" },
    { title: "Mobile responsive check", stage: "build" },
    { title: "SEO setup (meta, sitemap)", stage: "build" },
    { title: "Client review & feedback", stage: "review" },
    { title: "Final revisions", stage: "review" },
    { title: "Go live / DNS switch", stage: "launch" },
    { title: "Client handover & training", stage: "launch" },
  ];

  for (let i = 0; i < defaultTasks.length; i++) {
    await db.execute({
      sql: "INSERT INTO project_tasks (project_id, title, stage, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [result.lastInsertRowid!, defaultTasks[i].title, defaultTasks[i].stage, i, now],
    });
  }

  const project = first(await db.execute({
    sql: `SELECT p.*, l.business_name, l.contact_name, l.email, l.phone, l.business_type, l.location
      FROM projects p JOIN leads l ON p.lead_id = l.id WHERE p.id = ?`,
    args: [result.lastInsertRowid!],
  }));

  return NextResponse.json(project, { status: 201 });
}
