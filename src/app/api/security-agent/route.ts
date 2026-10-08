import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { authoriseAgent as authorise } from "@/lib/agentAuth";
import { allClients, findClient } from "@/lib/clientMatch";
import { computeAndStoreSecurity, maskKeys } from "@/lib/securityStatus";

// Website security pass certificates, posted by the site-security skill's
// certificate.js once a LIVE scan has passed. Key-authenticated (x-innov8-key =
// ONBOARDING_API_KEY, the same key as the other agent routes), failing CLOSED.
// A SIBLING of the session-only /api/security-certificates, never a child:
// PUBLIC_PATHS is matched with startsWith.
//
// Guardrails, enforced here rather than trusted to the caller:
//   - only a PASS is stored: s1 must be 0, and every s2 needs an accepted reason
//   - the file must really be a PDF (magic bytes) and under 3 MB
//   - the file name must be the certificate's own pattern for that host
//   - the client is a project id, or a name/domain matching exactly ONE client
//   - re-posting the same scan (project, host, scanned_at) replaces it, never duplicates
//
// result: "fail" (scan.js, after a live scan that did not pass) stores the redacted
// findings in security_failures instead: no PDF, s1 + s2 must be > 0, every string
// is clipped and key-masked again here. Both paths refresh projects.security_cache,
// which drives the SECURITY PASS / FAIL label on the cards.

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BYTES = 3 * 1024 * 1024;
const HOST_RE = /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

const bad = (error: string, status = 400, extra: object = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: NO_STORE });

interface Body {
  project_id?: number; client?: string;
  host?: string; scanned_at?: string;
  s1?: number; s2?: number; s3?: number; pages?: number; probes?: number;
  accepted?: { kind?: string; reason?: string }[];
  file_name?: string; pdf_base64?: string;
  result?: "pass" | "fail";
  findings?: { sev?: string; kind?: string; what?: string; where?: string; hint?: string; fix?: string; sample?: string; count?: number }[];
}

const MAX_FINDINGS = 80;
const clip = (v: unknown, n: number) => maskKeys(String(v ?? "")).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n);

async function resolveProject(db: ReturnType<typeof getClient>, pid: number, q: string) {
  const clients = await allClients(db);
  if (pid) {
    const c = clients.find((x) => x.id === pid);
    return c ? { client: c } : { error: bad("no client with project_id " + pid, 404) };
  }
  const { match, candidates } = findClient(clients, q, true);
  if (match) return { client: match };
  return {
    error: bad(candidates.length > 1 ? `"${q}" matches more than one client - pass project_id` : `no client matches "${q}" exactly - pass project_id`,
      candidates.length > 1 ? 409 : 404, { candidates: candidates.map(({ id, name, domain }) => ({ id, name, domain })) }),
  };
}

/* GET ?project_id= | ?client= : the certificates on file (metadata only), so the
   skill can confirm the upload landed on the right card. */
export async function GET(request: NextRequest) {
  const auth = authorise(request);
  if (!auth.ok) return bad(auth.error, auth.status);
  await initDb();
  const db = getClient();
  const pid = Number(request.nextUrl.searchParams.get("project_id") || 0);
  const q = request.nextUrl.searchParams.get("client") || "";
  if (!pid && !q) return bad("project_id or client required");
  const r = await resolveProject(db, pid, q);
  if (r.error) return r.error;
  const rows = all(await db.execute({
    sql: `SELECT id, host, scanned_at, s1, s2, s3, pages, probes, accepted, file_name, size, created_at
            FROM security_certificates WHERE project_id = ? ORDER BY scanned_at DESC`,
    args: [r.client.id],
  }));
  const fails = all(await db.execute({
    sql: "SELECT id, host, scanned_at, s1, s2, s3, pages, probes, created_at FROM security_failures WHERE project_id = ? ORDER BY scanned_at DESC",
    args: [r.client.id],
  }));
  const status = await computeAndStoreSecurity(db, r.client.id);
  return NextResponse.json({ client: r.client, status, failures: fails, certificates: rows.map((x) => ({ ...x, accepted: JSON.parse(String(x.accepted || "[]")) })) }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const auth = authorise(request);
  if (!auth.ok) return bad(auth.error, auth.status);

  let b: Body;
  try { b = await request.json(); } catch { return bad("bad body"); }

  const host = String(b.host || "").toLowerCase().replace(/^www\./, "");
  if (!HOST_RE.test(host)) return bad("host must be a bare domain, e.g. example.co.uk");
  const scannedAt = String(b.scanned_at || "");
  if (isNaN(Date.parse(scannedAt))) return bad("scanned_at must be an ISO date-time");
  const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  const s1 = n(b.s1), s2 = n(b.s2), s3 = n(b.s3), pages = n(b.pages), probes = n(b.probes);

  if (b.result === "fail") {
    if (s1 + s2 === 0) return bad("a fail needs s1 or s2 > 0 (a clean scan is a pass: post its certificate)");
    if (b.pdf_base64) return bad("a fail carries findings, not a PDF");
    const raw = Array.isArray(b.findings) ? b.findings : [];
    if (!raw.length) return bad("a fail needs its findings (findings: [{sev, kind, what, where}])");
    const findings = raw.filter((x) => x && (x.sev === "S1" || x.sev === "S2" || x.sev === "S3")).slice(0, MAX_FINDINGS).map((x) => ({
      sev: x.sev, kind: clip(x.kind, 30), what: clip(x.what, 240), where: clip(x.where, 200),
      ...(x.hint ? { hint: clip(x.hint, 60) } : {}), ...(x.fix ? { fix: clip(x.fix, 200) } : {}),
      ...(x.sample ? { sample: clip(x.sample, 200) } : {}), ...(x.count ? { count: n(x.count) } : {}),
    }));
    await initDb();
    const db = getClient();
    const r = await resolveProject(db, Number(b.project_id || 0), String(b.client || ""));
    if (r.error) return r.error;
    await db.execute({
      sql: `INSERT INTO security_failures (project_id, host, scanned_at, s1, s2, s3, pages, probes, created_at, findings)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id, host, scanned_at) DO UPDATE SET
              s1 = excluded.s1, s2 = excluded.s2, s3 = excluded.s3, pages = excluded.pages, probes = excluded.probes,
              created_at = excluded.created_at, findings = excluded.findings`,
      args: [r.client.id, host, scannedAt, s1, s2, s3, pages, probes, new Date().toISOString(), JSON.stringify(findings)],
    });
    const row = first(await db.execute({ sql: "SELECT id FROM security_failures WHERE project_id = ? AND host = ? AND scanned_at = ?", args: [r.client.id, host, scannedAt] }));
    const status = await computeAndStoreSecurity(db, r.client.id);
    return NextResponse.json({ ok: true, result: "fail", id: Number(row?.id || 0), client: { id: r.client.id, name: r.client.name }, host, status }, { headers: NO_STORE });
  }

  if (s1 !== 0) return bad("only a passing scan can be stored: s1 must be 0");
  const accepted = (Array.isArray(b.accepted) ? b.accepted : [])
    .map((a) => ({ kind: String(a.kind || "").slice(0, 40), reason: String(a.reason || "").trim().slice(0, 300) }))
    .filter((a) => a.kind && a.reason.length >= 8);
  if (s2 > 0 && !accepted.length) return bad("s2 findings need their accepted reasons (accepted: [{kind, reason}])");

  const fileName = String(b.file_name || "");
  if (fileName !== `Security-Check-PASS-${host}-${scannedAt.slice(0, 10)}.pdf`) return bad("file_name must be Security-Check-PASS-<host>-<scan date>.pdf");
  const b64 = String(b.pdf_base64 || "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return bad("pdf_base64 is not base64");
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length > MAX_BYTES) return bad("PDF too large (max 3 MB)");
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return bad("that file is not a PDF");

  await initDb();
  const db = getClient();
  const r = await resolveProject(db, Number(b.project_id || 0), String(b.client || ""));
  if (r.error) return r.error;
  const client = r.client;

  await db.execute({
    sql: `INSERT INTO security_certificates (project_id, host, scanned_at, s1, s2, s3, pages, probes, accepted, file_name, size, created_at, pdf)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id, host, scanned_at) DO UPDATE SET
            s1 = excluded.s1, s2 = excluded.s2, s3 = excluded.s3, pages = excluded.pages, probes = excluded.probes,
            accepted = excluded.accepted, file_name = excluded.file_name, size = excluded.size,
            created_at = excluded.created_at, pdf = excluded.pdf`,
    args: [client.id, host, scannedAt, s1, s2, s3, pages, probes, JSON.stringify(accepted), fileName, bytes.length,
      new Date().toISOString(), "data:application/pdf;base64," + bytes.toString("base64")],
  });
  const row = first(await db.execute({
    sql: "SELECT id FROM security_certificates WHERE project_id = ? AND host = ? AND scanned_at = ?",
    args: [client.id, host, scannedAt],
  }));
  const status = await computeAndStoreSecurity(db, client.id);
  const domainNote = client.domain && String(client.domain).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") !== host
    ? `note: the card's domain is ${client.domain}, the certificate is for ${host}` : "";
  return NextResponse.json({ ok: true, result: "pass", id: Number(row?.id || 0), client: { id: client.id, name: client.name }, host, status, note: domainNote }, { headers: NO_STORE });
}
