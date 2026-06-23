import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

// GET → SEO reports for a project, oldest first (so the modal trend chart reads left→right)
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const db = getClient();
  const r = await db.execute({
    sql: "SELECT id, score, report_url, report_name, report_type, notes, logged_at FROM seo_reports WHERE project_id = ? ORDER BY logged_at ASC, id ASC",
    args: [projectId],
  });
  return NextResponse.json({ reports: all(r) }, { headers: { "Cache-Control": "private, no-store" } });
}

// POST → add a report. Either an uploaded file (multipart/form-data: file, score,
// logged_at, notes) stored as a base64 data URL, OR a link (JSON: url, name, score,
// logged_at, notes). Mirrors /api/project-files for the file branch.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const db = getClient();
  const contentType = request.headers.get("content-type") || "";

  let report_url = "", report_name = "", report_type = "", notes = "", score = 0, logged_at = "";

  if (contentType.includes("multipart/form-data")) {
    const fd = await request.formData();
    score = Number(fd.get("score") || 0);
    notes = ((fd.get("notes") as string) || "").slice(0, 1000);
    logged_at = (fd.get("logged_at") as string) || "";
    const file = fd.get("file") as File;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 5MB — paste a link instead for big reports.` }, { status: 400 });
    }
    const ftype = file.type;
    if (!(ftype.startsWith("image/") || ftype === "application/pdf")) {
      return NextResponse.json({ error: `File type "${ftype}" not allowed. Use a PDF or image, or paste a link.` }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    report_url = `data:${ftype};base64,${buffer.toString("base64")}`;
    report_type = ftype;
    report_name = file.name || "report";
  } else {
    const body = await request.json();
    score = Number(body.score || 0);
    notes = (body.notes || "").slice(0, 1000);
    logged_at = body.logged_at || "";
    const url = (body.url || "").trim();
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
    report_url = url;
    report_type = "link";
    report_name = (body.name || url).slice(0, 300);
  }

  score = Math.min(10, Math.max(0, isNaN(score) ? 0 : score));
  if (!logged_at) logged_at = new Date().toISOString();
  const now = new Date().toISOString();

  const result = await db.execute({
    sql: `INSERT INTO seo_reports (project_id, score, report_url, report_name, report_type, notes, logged_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [projectId, score, report_url, report_name, report_type, notes, logged_at, now],
  });
  const saved = first(await db.execute({
    sql: "SELECT id, score, report_url, report_name, report_type, notes, logged_at FROM seo_reports WHERE id = ?",
    args: [result.lastInsertRowid!],
  }));
  return NextResponse.json(saved, { status: 201 });
}

// DELETE /api/projects/[id]/seo-reports?report_id=N
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  const reportId = Number(request.nextUrl.searchParams.get("report_id"));
  if (!projectId || !reportId) return NextResponse.json({ error: "bad params" }, { status: 400 });
  const db = getClient();
  await db.execute({ sql: "DELETE FROM seo_reports WHERE id = ? AND project_id = ?", args: [reportId, projectId] });
  return NextResponse.json({ ok: true });
}
