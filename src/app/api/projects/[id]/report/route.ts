import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { buildReportSnapshot, isValidPeriod, currentPeriod } from "@/lib/clientReporting";
import { renderReportHtml, renderReportText, renderReportSubject } from "@/lib/reportTemplate";
import { sendEmailWithRetry, EmailConfigError, isEmailConfigured } from "@/lib/email";

export const maxDuration = 60;

// GET ?period=YYYY-MM[&history=1]
//   default → render the report without writing anything (the preview)
//   history  → past sends for this project
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const db = getClient();
  const params = request.nextUrl.searchParams;

  if (params.get("history")) {
    const reports = all(await db.execute({
      sql: `SELECT id, period, status, recipient, subject, send_count, error, sent_at, sent_by
            FROM client_reports WHERE project_id = ? ORDER BY period DESC LIMIT 24`,
      args: [projectId],
    }));
    return NextResponse.json({ reports }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const period = params.get("period") || currentPeriod();
  if (!isValidPeriod(period)) return NextResponse.json({ error: "bad period" }, { status: 400 });

  // A saved draft's note is the one being edited, so it wins over the query param.
  const existing = first(await db.execute({
    sql: "SELECT snapshot, subject, recipient, cc, status, sent_at, send_count FROM client_reports WHERE project_id = ? AND period = ?",
    args: [projectId, period],
  }));
  let note = params.get("note") || "";
  if (!note && existing?.snapshot) {
    try { note = JSON.parse(String(existing.snapshot))?.note || ""; } catch { /* ignore */ }
  }

  const snapshot = await buildReportSnapshot(db, projectId, period, note);
  if (!snapshot) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Default recipient = the client's own contact email on the lead.
  const lead = first(await db.execute({
    sql: "SELECT l.email FROM projects p JOIN leads l ON p.lead_id = l.id WHERE p.id = ?",
    args: [projectId],
  }));

  return NextResponse.json({
    snapshot,
    subject: String(existing?.subject || renderReportSubject(snapshot)),
    html: renderReportHtml(snapshot),
    text: renderReportText(snapshot),
    recipient: String(existing?.recipient || lead?.email || ""),
    cc: String(existing?.cc || ""),
    report: existing ? { status: existing.status, sent_at: existing.sent_at, send_count: existing.send_count } : null,
    email_configured: isEmailConfigured(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

// POST { period, to?, cc?, subject?, note?, test?, draft? }
//   draft → save the note/recipient without sending
//   test  → send to RESEND_REPLY_TO instead of the client (always do this first)
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const session = await getSession();
  const body = await request.json();
  const period = String(body.period || "");
  if (!isValidPeriod(period)) return NextResponse.json({ error: "bad period" }, { status: 400 });

  const db = getClient();
  const note = String(body.note || "").slice(0, 4000);
  const snapshot = await buildReportSnapshot(db, projectId, period, note);
  if (!snapshot) return NextResponse.json({ error: "not found" }, { status: 404 });

  const subject = String(body.subject || renderReportSubject(snapshot)).slice(0, 300);
  const cc = String(body.cc || "").slice(0, 300);
  const isTest = !!body.test;
  const recipient = isTest
    ? String(process.env.RESEND_REPLY_TO || "")
    : String(body.to || "").trim();

  const now = new Date().toISOString();
  const snapshotJson = JSON.stringify(snapshot);

  // Upsert the row first so a draft (or a failed send) is always recorded.
  const upsertDraft = async (status: string, extra: { provider_id?: string; error?: string; sent?: boolean }) => {
    await db.execute({
      sql: `INSERT INTO client_reports
              (project_id, period, status, recipient, cc, subject, snapshot, provider_id, send_count, error, sent_at, sent_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id, period) DO UPDATE SET
              status = excluded.status,
              recipient = excluded.recipient,
              cc = excluded.cc,
              subject = excluded.subject,
              snapshot = excluded.snapshot,
              provider_id = CASE WHEN excluded.provider_id != '' THEN excluded.provider_id ELSE client_reports.provider_id END,
              send_count = client_reports.send_count + ?,
              error = excluded.error,
              sent_at = CASE WHEN excluded.sent_at != '' THEN excluded.sent_at ELSE client_reports.sent_at END,
              sent_by = CASE WHEN excluded.sent_by != '' THEN excluded.sent_by ELSE client_reports.sent_by END,
              updated_at = excluded.updated_at`,
      args: [
        projectId, period, status, recipient, cc, subject, snapshotJson,
        extra.provider_id || "", extra.sent ? 1 : 0, extra.error || "",
        extra.sent ? now : "", extra.sent ? (session?.username || "") : "", now, now,
        extra.sent ? 1 : 0,
      ],
    });
  };

  if (body.draft) {
    await upsertDraft("draft", {});
    return NextResponse.json({ ok: true, status: "draft" });
  }

  if (!recipient || !recipient.includes("@")) {
    return NextResponse.json({
      ok: false,
      error: isTest
        ? "RESEND_REPLY_TO is not set in Vercel — nowhere to send the test."
        : "No recipient email. Add one on the client's lead or type one in.",
    }, { status: 400 });
  }

  try {
    const result = await sendEmailWithRetry({
      to: recipient,
      cc: isTest ? "" : cc,
      subject: isTest ? `[TEST] ${subject}` : subject,
      html: renderReportHtml(snapshot),
      text: renderReportText(snapshot),
    });

    // A test send must not mark the client's report as delivered.
    if (isTest) return NextResponse.json({ ok: true, test: true, provider_id: result.id, recipient });

    await upsertDraft("sent", { provider_id: result.id, sent: true });

    // Mirror onto the lead timeline that already exists in the UI.
    const proj = first(await db.execute({ sql: "SELECT lead_id FROM projects WHERE id = ?", args: [projectId] }));
    if (proj) {
      await db.execute({
        sql: "INSERT INTO activities (lead_id, type, description, created_at) VALUES (?, 'report_sent', ?, ?)",
        args: [Number(proj.lead_id), `${snapshot.period_label} report sent to ${recipient}`, now],
      });
    }

    return NextResponse.json({ ok: true, status: "sent", provider_id: result.id, recipient, sent_at: now });
  } catch (err) {
    const message = err instanceof EmailConfigError
      ? String(err.message)
      : `Send failed: ${err instanceof Error ? err.message : String(err)}`;
    if (!isTest) await upsertDraft("failed", { error: message.slice(0, 500) });
    // 502, not 200-with-an-error — a failed send must never read as success.
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
