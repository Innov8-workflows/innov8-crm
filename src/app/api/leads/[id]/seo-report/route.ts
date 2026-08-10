import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

// SEO reports attached to a PROSPECT, opened from the Intel popover before a
// cold call. Mirrors /api/projects/[id]/seo-reports, minus the score history —
// a prospect report is an artefact to read, not a trend to chart (the prospect's
// 0-10 score is one custom-field value, custom_intel_seoscore).

// GET → list (metadata only). GET ?file=N → the stored bytes.
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const leadId = Number(id);
  if (!leadId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const db = getClient();

  // ?file=N → serve the bytes lazily so the list never ships multi-MB base64.
  // Scoped by lead_id as well as id so a guessed report id can't be pulled from
  // another lead.
  const fileId = req.nextUrl.searchParams.get("file");
  if (fileId) {
    const row = first(await db.execute({
      sql: "SELECT report_url, report_name FROM lead_seo_reports WHERE id = ? AND lead_id = ? LIMIT 1",
      args: [Number(fileId), leadId],
    }));
    if (!row) return new NextResponse("Not found", { status: 404 });
    const url = String(row.report_url || "");
    const m = url.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return new NextResponse("Not a stored file", { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(m[2], "base64")), {
      headers: {
        "Content-Type": m[1] || "application/octet-stream",
        "Cache-Control": "private, max-age=86400, immutable",
        // inline so a PDF opens in the browser's viewer rather than downloading
        "Content-Disposition": `inline; filename="${String(row.report_name || "report").replace(/[\r\n"]/g, "")}"`,
      },
    });
  }

  // List omits the blob; is_file=1 → open via ?file=<id>, otherwise it's a link.
  const r = await db.execute({
    sql: `SELECT id, report_name, report_type, created_at,
                 CASE WHEN report_type = 'link' THEN report_url ELSE '' END AS report_url,
                 CASE WHEN report_type = 'link' THEN 0 ELSE 1 END AS is_file
          FROM lead_seo_reports WHERE lead_id = ? ORDER BY created_at DESC, id DESC`,
    args: [leadId],
  });
  return NextResponse.json({ reports: all(r) }, { headers: { "Cache-Control": "private, no-store" } });
}

// POST → attach a report. Either an uploaded file (multipart/form-data: file) or
// a link (JSON: url, name).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const leadId = Number(id);
  if (!leadId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const db = getClient();
  const contentType = request.headers.get("content-type") || "";

  let report_url = "", report_name = "", report_type = "";

  if (contentType.includes("multipart/form-data")) {
    const fd = await request.formData();
    const file = fd.get("file") as File;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    // 5MB matches the project uploader. Bigger reports go in as a link — a
    // base64 blob past this starts bloating the row and the response.
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 5MB — paste a link instead.` }, { status: 400 });
    }
    const ftype = file.type;
    if (!(ftype === "application/pdf" || ftype.startsWith("image/"))) {
      return NextResponse.json({ error: `File type "${ftype || "unknown"}" not allowed. Use a PDF or image, or paste a link.` }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    report_url = `data:${ftype};base64,${buffer.toString("base64")}`;
    report_type = ftype;
    report_name = (file.name || "report").slice(0, 300);
  } else {
    const body = await request.json();
    const url = (body.url || "").trim();
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
    report_url = url;
    report_type = "link";
    report_name = (body.name || url).slice(0, 300);
  }

  const result = await db.execute({
    sql: `INSERT INTO lead_seo_reports (lead_id, report_url, report_name, report_type, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [leadId, report_url, report_name, report_type, new Date().toISOString()],
  });

  // Echo metadata only — never the just-uploaded blob (it would double the payload).
  const saved = first(await db.execute({
    sql: `SELECT id, report_name, report_type, created_at,
                 CASE WHEN report_type = 'link' THEN report_url ELSE '' END AS report_url,
                 CASE WHEN report_type = 'link' THEN 0 ELSE 1 END AS is_file
          FROM lead_seo_reports WHERE id = ?`,
    args: [result.lastInsertRowid!],
  }));
  return NextResponse.json(saved, { status: 201 });
}

// DELETE /api/leads/[id]/seo-report?report_id=N
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const leadId = Number(id);
  const reportId = Number(request.nextUrl.searchParams.get("report_id"));
  if (!leadId || !reportId) return NextResponse.json({ error: "bad params" }, { status: 400 });
  const db = getClient();
  await db.execute({ sql: "DELETE FROM lead_seo_reports WHERE id = ? AND lead_id = ?", args: [reportId, leadId] });
  return NextResponse.json({ ok: true });
}
