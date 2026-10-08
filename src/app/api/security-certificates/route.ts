import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { computeAndStoreSecurity } from "@/lib/securityStatus";

// Session-only (NOT in PUBLIC_PATHS): the project card's Security tab.
//   GET ?project_id=N   pass certificates (metadata only) + failed scans (with findings)
//   GET ?file=N         that certificate's PDF, inline
//   DELETE ?id=N        remove a certificate (e.g. superseded or mistaken)
//   DELETE ?fail_id=N   remove a failed-scan report (e.g. scanned the wrong host)
// Both are written only by the key-authenticated /api/security-agent. Every delete
// recomputes projects.security_cache, so the card's PASS / FAIL label follows.

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  const fileId = Number(request.nextUrl.searchParams.get("file") || 0);
  if (fileId) {
    const row = first(await db.execute({ sql: "SELECT file_name, pdf FROM security_certificates WHERE id = ? LIMIT 1", args: [fileId] }));
    if (!row) return new NextResponse("Not found", { status: 404 });
    const m = String(row.pdf || "").match(/^data:application\/pdf;base64,(.*)$/);
    if (!m) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(m[1], "base64")), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, max-age=86400, immutable",
        "Content-Disposition": `inline; filename="${String(row.file_name || "certificate.pdf").replace(/[\r\n"]/g, "")}"`,
      },
    });
  }

  const projectId = Number(request.nextUrl.searchParams.get("project_id") || 0);
  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });
  const rows = all(await db.execute({
    sql: `SELECT id, project_id, host, scanned_at, s1, s2, s3, pages, probes, accepted, file_name, size, created_at
            FROM security_certificates WHERE project_id = ? ORDER BY scanned_at DESC`,
    args: [projectId],
  }));
  const fails = all(await db.execute({
    sql: `SELECT id, project_id, host, scanned_at, s1, s2, s3, pages, probes, created_at, findings
            FROM security_failures WHERE project_id = ? ORDER BY scanned_at DESC`,
    args: [projectId],
  }));
  const parse = (v: unknown) => { try { return JSON.parse(String(v || "[]")); } catch { return []; } };
  return NextResponse.json({
    certificates: rows.map((r) => ({ ...r, accepted: parse(r.accepted) })),
    failures: fails.map((r) => ({ ...r, findings: parse(r.findings) })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: NextRequest) {
  await initDb();
  const db = getClient();
  const id = Number(request.nextUrl.searchParams.get("id") || 0);
  const failId = Number(request.nextUrl.searchParams.get("fail_id") || 0);
  if (!id && !failId) return NextResponse.json({ error: "id or fail_id required" }, { status: 400 });
  const table = id ? "security_certificates" : "security_failures";
  const row = first(await db.execute({ sql: `SELECT project_id FROM ${table} WHERE id = ?`, args: [id || failId] }));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  await db.execute({ sql: `DELETE FROM ${table} WHERE id = ?`, args: [id || failId] });
  const status = await computeAndStoreSecurity(db, Number(row.project_id));
  return NextResponse.json({ ok: true, status });
}
