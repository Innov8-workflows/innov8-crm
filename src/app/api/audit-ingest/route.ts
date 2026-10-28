import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { authoriseAgent } from "@/lib/agentAuth";

// The website-audit ingest API. This is what a Claude Code session (or curl, or
// a cron job) talks to in order to file a finished /website-audit report against
// the right card, without a browser session.
//
// AUTH: authoriseAgent() -- the same ONBOARDING_API_KEY, constant-time compare
// and fail-closed 503 as tasks-agent, brief-agent, info-agent and
// security-agent. An earlier draft had its own AUDIT_API_KEY; it was never set
// in Vercel, so the endpoint never ran. One agent key on one machine is what
// every other Claude-to-CRM route already uses.
//
// It lives at /api/audit-ingest, which is a SIBLING of everything. PUBLIC_PATHS
// is matched with startsWith, so the name must not be a prefix of any admin
// route: nothing else under /api/ begins with "audit", and any future route that
// does would be opened by this entry. Keep it that way.
//
// WHERE IT WRITES. A domain resolves to one of two places and never both:
//   projects.domain matches         -> seo_reports (score history + trend chart)
//   custom_intel_website matches    -> lead_seo_reports (a prospect artefact)
// Both also drop an activities row, which is keyed on lead_id -- a project has
// one (projects.lead_id is UNIQUE), so the timeline works for either.

export const maxDuration = 60;
const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_FILE = 5 * 1024 * 1024;

/**
 * Reduce anything a human might paste -- "https://www.Foo.co.uk/index.html", a
 * bare "foo.co.uk", a trailing slash -- to the one comparable form "foo.co.uk".
 * Both sides of every comparison go through this, so the stored value can stay
 * as messy as whoever typed it in.
 */
function normaliseDomain(raw: string): string {
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  s = s.split(/[/?#]/)[0];                       // path, query, fragment
  s = s.replace(/:\d+$/, "");                    // port
  s = s.replace(/^www\./, "");                   // www
  return s;
}

type Match =
  | { kind: "project"; projectId: number; leadId: number; businessName: string }
  | { kind: "lead"; leadId: number; businessName: string }
  | null;

async function resolveDomain(domain: string): Promise<Match> {
  const db = getClient();
  const want = normaliseDomain(domain);
  if (!want) return null;

  // Clients first. The projects table is small (one row per client), so
  // normalising in JS beats trying to strip schemes and www in SQL.
  const projects = all(await db.execute({
    sql: `SELECT p.id AS project_id, p.lead_id, p.domain, COALESCE(l.business_name, '') AS business_name
          FROM projects p LEFT JOIN leads l ON l.id = p.lead_id
          WHERE COALESCE(p.domain, '') <> ''`,
  }));
  for (const row of projects) {
    if (normaliseDomain(String(row.domain || "")) === want) {
      return {
        kind: "project",
        projectId: Number(row.project_id),
        leadId: Number(row.lead_id),
        businessName: String(row.business_name || ""),
      };
    }
  }

  // Then prospects. Only the one custom field, so this stays a small scan even
  // when the leads table does not.
  const leads = all(await db.execute({
    sql: `SELECT c.lead_id, c.value, COALESCE(l.business_name, '') AS business_name
          FROM custom_field_values c JOIN leads l ON l.id = c.lead_id
          WHERE c.field_id = 'custom_intel_website' AND COALESCE(c.value, '') <> ''`,
  }));
  for (const row of leads) {
    if (normaliseDomain(String(row.value || "")) === want) {
      return { kind: "lead", leadId: Number(row.lead_id), businessName: String(row.business_name || "") };
    }
  }

  return null;
}

/**
 * GET /api/audit-ingest?domain=example.co.uk
 * A dry run. Says where a report WOULD be filed and writes nothing, so a script
 * can confirm the match before spending a multi-MB upload on the wrong card.
 */
export async function GET(request: NextRequest) {
  const auth = authoriseAgent(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  const domain = request.nextUrl.searchParams.get("domain") || "";
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400, headers: NO_STORE });

  await initDb();
  const match = await resolveDomain(domain);
  if (!match) {
    return NextResponse.json(
      { matched: null, normalised: normaliseDomain(domain), error: "no project.domain or lead custom_intel_website matches this domain" },
      { status: 404, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ...match, matched: match.kind, normalised: normaliseDomain(domain) }, { headers: NO_STORE });
}

/**
 * POST /api/audit-ingest   (multipart/form-data)
 *   domain      required   the audited site, any format
 *   score       required   0-10, clamped
 *   notes                  the report's one-line verdict, capped at 1000
 *   logged_at              ISO date; defaults to now
 *   file                   the PDF, <= 5MB
 */
export async function POST(request: NextRequest) {
  const auth = authoriseAgent(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "send multipart/form-data with domain, score and file" }, { status: 415, headers: NO_STORE });
  }

  const fd = await request.formData();
  const domain = String(fd.get("domain") || "");
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400, headers: NO_STORE });

  const rawScore = Number(fd.get("score"));
  const score = Math.min(10, Math.max(0, isNaN(rawScore) ? 0 : rawScore));
  const notes = String(fd.get("notes") || "").slice(0, 1000);
  const logged_at = String(fd.get("logged_at") || "") || new Date().toISOString();
  const now = new Date().toISOString();

  const file = fd.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400, headers: NO_STORE });
  if (file.size > MAX_FILE) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 5MB.` },
      { status: 400, headers: NO_STORE },
    );
  }
  const ftype = file.type || "application/pdf";
  if (ftype !== "application/pdf" && !ftype.startsWith("image/")) {
    return NextResponse.json({ error: `File type "${ftype}" not allowed. Use a PDF or an image.` }, { status: 400, headers: NO_STORE });
  }

  await initDb();
  const db = getClient();

  const match = await resolveDomain(domain);
  if (!match) {
    return NextResponse.json(
      { error: `no card matches "${normaliseDomain(domain)}" — set projects.domain on the client, or custom_intel_website on the lead` },
      { status: 404, headers: NO_STORE },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const report_url = `data:${ftype};base64,${buffer.toString("base64")}`;
  const report_name = (file.name || "Website_Audit.pdf").slice(0, 300);
  const scoreLabel = `${score.toFixed(1)}/10`;

  if (match.kind === "project") {
    const result = await db.execute({
      sql: `INSERT INTO seo_reports (project_id, score, report_url, report_name, report_type, notes, logged_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [match.projectId, score, report_url, report_name, ftype, notes, logged_at, now],
    });
    // Same invalidation the UI route does: the cached latest/previous scores on
    // the project card are recomputed on the next projects list.
    await db.execute({ sql: "UPDATE projects SET seo_cache = '' WHERE id = ?", args: [match.projectId] });
    await db.execute({
      sql: "INSERT INTO activities (lead_id, type, description, created_at) VALUES (?, ?, ?, ?)",
      args: [match.leadId, "audit", `Website audit ${scoreLabel}${notes ? ` — ${notes}` : ""}`, now],
    });
    const saved = first(await db.execute({
      sql: `SELECT id, score, report_name, notes, logged_at FROM seo_reports WHERE id = ?`,
      args: [result.lastInsertRowid!],
    }));
    return NextResponse.json(
      { matched: "project", project_id: match.projectId, lead_id: match.leadId, business_name: match.businessName, report: saved },
      { status: 201, headers: NO_STORE },
    );
  }

  // Prospect. lead_seo_reports carries no score column by design (it is an
  // artefact to open before a cold call, not a trend), so the number goes to the
  // custom field the prospect intel panel already reads. That field holds a BARE
  // number ("6.7"): the intel panel and the grid's Intel cell both append "/10"
  // themselves and parse it with Number(), so "6.7/10" would render "6.7/10/10"
  // and light no button.
  const result = await db.execute({
    sql: `INSERT INTO lead_seo_reports (lead_id, report_url, report_name, report_type, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [match.leadId, report_url, report_name, ftype, now],
  });
  await db.execute({
    sql: `INSERT INTO custom_field_values (lead_id, field_id, value) VALUES (?, 'custom_intel_seoscore', ?)
          ON CONFLICT(lead_id, field_id) DO UPDATE SET value = excluded.value`,
    args: [match.leadId, String(Math.round(score * 10) / 10)],
  });
  await db.execute({
    sql: "INSERT INTO activities (lead_id, type, description, created_at) VALUES (?, ?, ?, ?)",
    args: [match.leadId, "audit", `Website audit ${scoreLabel}${notes ? ` — ${notes}` : ""}`, now],
  });
  return NextResponse.json(
    { matched: "lead", lead_id: match.leadId, business_name: match.businessName, report_id: Number(result.lastInsertRowid), score: scoreLabel },
    { status: 201, headers: NO_STORE },
  );
}
