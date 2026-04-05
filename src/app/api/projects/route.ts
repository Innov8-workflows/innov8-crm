import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const stage = request.nextUrl.searchParams.get("stage");
  const completed = request.nextUrl.searchParams.get("completed");

  let sql = `SELECT p.*, l.business_name, l.contact_name, l.email, l.phone, l.business_type, l.location
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

  sql += " ORDER BY p.sort_order ASC, p.created_at DESC";

  const result = await db.execute({ sql, args: args as never[] });
  return NextResponse.json({ projects: all(result) });
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
    { title: "Design mockup / wireframe", stage: "design" },
    { title: "Client design approval", stage: "design" },
    { title: "Collect page content / copy", stage: "content" },
    { title: "Collect product/service photos", stage: "content" },
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
