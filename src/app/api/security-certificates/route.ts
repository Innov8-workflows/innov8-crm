import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

// Session-only (NOT in PUBLIC_PATHS): the project card's Security tab.
//   GET ?project_id=N   the certificates on file, metadata only
//   GET ?file=N         that certificate's PDF, inline
//   DELETE ?id=N        remove one (e.g. a superseded or mistaken certificate)
// Certificates are written only by the key-authenticated /api/security-agent.

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
  return NextResponse.json({
    certificates: rows.map((r) => { let accepted = []; try { accepted = JSON.parse(String(r.accepted || "[]")); } catch { /* keep [] */ } return { ...r, accepted }; }),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: NextRequest) {
  await initDb();
  const db = getClient();
  const id = Number(request.nextUrl.searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.execute({ sql: "DELETE FROM security_certificates WHERE id = ?", args: [id] });
  return NextResponse.json({ ok: true });
}
