import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first, all } from "@/lib/db";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { formFor, missingFor, missingLabel } from "@/lib/onboardingSchema";
import { getByToken, GONE, sqlNow } from "@/lib/onboarding";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// Marking a submission finished.
//
// Submit is NEVER blocked by pending or failed media. A client who has 18 of
// 30 photos in and a video that won't go can still finish; the link stays live
// until it expires so they can come back. Blocking here would mean the most
// common real-world state — a phone on bad signal — has no way out except
// abandoning the form, and Jay would rather have 18 photos and a note than
// nothing at all. The CRM shows him what's outstanding so he can chase
// specifics rather than asking "did it work?".

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  const rl = rateLimit(`onboard-submit:${clientIp(request)}`, 30, 15 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });

  let body: { token?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "bad body" }, { status: 400, headers: NO_STORE }); }

  await initDb();
  const db = getClient();
  const sub = await getByToken(db, String(body.token || ""));
  if (!sub) return NextResponse.json(GONE, { status: 404, headers: NO_STORE });

  const before = first(await db.execute({
    sql: "SELECT submitted_at FROM onboarding_submissions WHERE id = ?", args: [sub.id],
  }));
  const alreadySubmitted = String(before?.submitted_at || "");

  const now = sqlNow();
  // Idempotent: re-submitting keeps the FIRST submitted_at, so "when did they
  // send it" survives a client coming back to add another photo.
  await db.execute({
    sql: `UPDATE onboarding_submissions
             SET status = CASE WHEN status = 'open' THEN 'submitted' ELSE status END,
                 submitted_at = CASE WHEN submitted_at = '' THEN ? ELSE submitted_at END,
                 updated_at = ?
           WHERE id = ?`,
    args: [now, now, sub.id],
  });

  // Tell Jay. Deliberately AFTER the status update and wrapped, because the
  // client's submit must succeed whether or not the alert does — an email
  // outage is not a reason to lose a submission.
  //
  // But it is recorded rather than swallowed: notified_at only gets stamped on a
  // real send, so a submitted row with an empty notified_at is a visible failure
  // in the CRM. A caught exception with nothing written is how you end up
  // believing alerts work when they have been dead for months.
  if (alreadySubmitted !== "" ) {
    // Re-submissions (a client coming back to add a photo) don't re-notify.
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  try {
    await notify(db, sub.id);
    await db.execute({
      sql: "UPDATE onboarding_submissions SET notified_at = ? WHERE id = ?",
      args: [sqlNow(), sub.id],
    });
  } catch (e) {
    console.error("onboarding submit: alert email failed —", (e as Error).message);
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

const ALERT_TO = "jamie@innov8workflows.co.uk";

/** Plain, scannable, and honest about what is missing. */
async function notify(db: ReturnType<typeof getClient>, id: number) {
  if (!isEmailConfigured()) throw new Error("Resend is not configured (RESEND_API_KEY / RESEND_FROM)");

  const row = first(await db.execute({
    sql: `SELECT COALESCE(l.business_name, s.label, '') AS name, s.project_id, s.kind
            FROM onboarding_submissions s
            LEFT JOIN projects p ON p.id = s.project_id
            LEFT JOIN leads l    ON l.id = p.lead_id
           WHERE s.id = ? LIMIT 1`,
    args: [id],
  }));
  const answersRow = first(await db.execute({
    sql: "SELECT answers_json FROM onboarding_answers WHERE submission_id = ?", args: [id],
  }));
  const answers = JSON.parse((answersRow?.answers_json as string) || "{}") as Record<string, unknown>;
  const assets = all(await db.execute({
    sql: "SELECT role FROM onboarding_assets WHERE submission_id = ? AND status = 'stored'", args: [id],
  }));

  const name = String(row?.name || "A business");
  const form = formFor(String(row?.kind || ""));
  const missing = missingFor(form, answers, assets.map((a) => String(a.role))).map(missingLabel);

  // Driven by the form rather than hard-coded, so a second questionnaire's
  // alert summarises its own answers instead of reporting a row of em-dashes
  // for fields it never asked about.
  const rows: [string, string][] = [
    ["Business", name],
    ...form.summaryFields.map((fid): [string, string] => [
      form.fields[fid]?.label || fid,
      String(answers[fid] ?? "").trim().split("\n").filter(Boolean).join(", ") || "—",
    ]),
    ["Files", `${assets.length} uploaded`],
    ["Attached to", row?.project_id ? "a project" : "NOT attached to a project yet"],
  ];

  // Inline styles and a table: the house report template does the same, because
  // every serious mail client strips <style> blocks.
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#14161a;max-width:560px">` +
    `<p style="font-size:17px;font-weight:700;margin:0 0 4px">${name} has sent their onboarding form.</p>` +
    `<table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;margin:16px 0">` +
    rows.map(([k, v]) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#8a9099;vertical-align:top;white-space:nowrap">${k}</td>` +
      `<td style="padding:6px 0;color:#14161a">${String(v).replace(/[<>]/g, "")}</td></tr>`).join("") +
    `</table>` +
    (missing.length
      ? `<p style="font-size:14px;color:#c8321f;margin:0 0 16px">Still missing: ${missing.join(", ")}</p>`
      : `<p style="font-size:14px;color:#12885a;margin:0 0 16px">Nothing required is missing.</p>`) +
    `<a href="https://crm.innov8workflows.co.uk/" style="display:inline-block;background:#f47b20;color:#fff;` +
    `text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:15px">Open the CRM</a>` +
    `</div>`;

  await sendEmail({
    to: ALERT_TO,
    subject: `${form.label} onboarding: ${name}`,
    html,
    text: `${name} has sent their onboarding form.\n\n` +
          rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
          (missing.length ? `\n\nStill missing: ${missing.join(", ")}` : "") +
          `\n\nhttps://crm.innov8workflows.co.uk/`,
  });
}
