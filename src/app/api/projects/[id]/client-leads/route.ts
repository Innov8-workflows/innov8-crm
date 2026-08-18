import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getClient, initDb, all, first } from "@/lib/db";
import { monthRange, isValidPeriod } from "@/lib/clientReporting";
import { normaliseReceivedAt } from "@/lib/leadImport";

// The enquiries a client's own website has produced. Read/marked/deleted from
// the Client Dashboard's leads table.

// GET ?period=YYYY-MM&limit=&offset=  — omit period for "all time"
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const params = request.nextUrl.searchParams;
  const period = params.get("period") || "";
  const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 100));
  const offset = Math.max(0, Number(params.get("offset")) || 0);

  const db = getClient();
  const where: string[] = ["project_id = ?"];
  const args: (string | number)[] = [projectId];
  if (period) {
    if (!isValidPeriod(period)) return NextResponse.json({ error: "bad period" }, { status: 400 });
    const r = monthRange(period);
    where.push("received_at >= ?", "received_at < ?");
    args.push(r.start, r.end);
  }
  const whereSql = where.join(" AND ");

  const [rows, count] = await Promise.all([
    db.execute({
      sql: `SELECT id, project_id, received_at, submitted_at, name, email, phone, message,
                   source, form_name, page_url, status, entry_mode
            FROM client_leads WHERE ${whereSql}
            ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    }).then(all),
    db.execute({ sql: `SELECT COUNT(*) AS total FROM client_leads WHERE ${whereSql}`, args }).then(first),
  ]);

  return NextResponse.json({ leads: rows, total: Number(count?.total) || 0 }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

// POST { received_at?, name?, email?, phone?, message?, source?, form_name?, page_url? }
// One enquiry entered by hand — a phone call, a walk-in, something the client
// forwarded on. Tagged entry_mode='manual' and status='seen': Jay is typing it in,
// so he has by definition already seen it, and 'new' would light the unseen dot on
// his own client rail.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const clamp = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const name = clamp(body.name, 300);
  const email = clamp(body.email, 300);
  const phone = clamp(body.phone, 60);
  const message = clamp(body.message, 2000);

  // Same rule the client's Apps Script enforces before forwarding: no way to
  // contact them means it is not an enquiry.
  if (!name && !email && !phone) {
    return NextResponse.json({ error: "name, email or phone required" }, { status: 400 });
  }

  const receivedAt = normaliseReceivedAt(clamp(body.received_at, 30));
  // Default 'manual', never ''. getLeadCounts relabels an empty source as 'form'
  // (clientReporting.ts), which would report a phone call as a website form in the
  // client's monthly report.
  const source = clamp(body.source, 40) || "manual";

  // Same hash shape as the webhook so a manual row and a live row can never
  // collide and then diverge. Second-precision received_at makes a genuine
  // collision effectively impossible while still catching a double-submit.
  const basis = ["manual", receivedAt, email.toLowerCase(), phone, message.slice(0, 200)].join("|");
  const dedupHash = crypto.createHash("sha256").update(`${projectId}|${basis}`).digest("hex").slice(0, 32);

  const db = getClient();
  const res = await db.execute({
    sql: `INSERT INTO client_leads
            (project_id, received_at, submitted_at, name, email, phone, message,
             source, form_name, page_url, raw, dedup_hash, status, entry_mode, created_at)
          VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, '', ?, 'seen', 'manual', ?)
          ON CONFLICT(project_id, dedup_hash) DO NOTHING`,
    args: [projectId, receivedAt, name, email, phone, message, source,
           clamp(body.form_name, 120), clamp(body.page_url, 300),
           dedupHash, new Date().toISOString()],
  });

  if (!Number(res.rowsAffected)) {
    return NextResponse.json(
      { error: "An identical enquiry is already logged for that date" }, { status: 409 });
  }

  const row = first(await db.execute({
    sql: `SELECT id, project_id, received_at, submitted_at, name, email, phone, message,
                 source, form_name, page_url, status, entry_mode
          FROM client_leads WHERE id = ?`,
    args: [Number(res.lastInsertRowid)],
  }));
  return NextResponse.json(row, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

// PUT { ids: number[], status: 'seen' | 'new' } — clears the unseen dot
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  const { ids, status } = await request.json();

  if (!projectId || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  const next = status === "new" ? "new" : "seen";
  const clean = ids.map(Number).filter(Boolean).slice(0, 500);
  if (clean.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const db = getClient();
  const placeholders = clean.map(() => "?").join(",");
  const res = await db.execute({
    sql: `UPDATE client_leads SET status = ? WHERE project_id = ? AND id IN (${placeholders})`,
    args: [next, projectId, ...clean],
  });
  return NextResponse.json({ ok: true, updated: Number(res.rowsAffected) || 0 });
}

// DELETE ?lead_id=N                — for spam / test rows
// DELETE ?from_id=A&to_id=B        — undo one import batch (the id_range the
//                                    import route returned)
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  const params = request.nextUrl.searchParams;
  const leadId = Number(params.get("lead_id"));
  const fromId = Number(params.get("from_id"));
  const toId = Number(params.get("to_id"));
  const db = getClient();

  if (projectId && fromId && toId && toId >= fromId) {
    // entry_mode = 'import' is load-bearing: a live webhook insert that landed in
    // the middle of the batch shares the id range and must NOT be swept up.
    const res = await db.execute({
      sql: `DELETE FROM client_leads
            WHERE project_id = ? AND entry_mode = 'import' AND id BETWEEN ? AND ?`,
      args: [projectId, fromId, toId],
    });
    return NextResponse.json({ ok: true, deleted: Number(res.rowsAffected) || 0 });
  }

  if (!projectId || !leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  await db.execute({ sql: "DELETE FROM client_leads WHERE id = ? AND project_id = ?", args: [leadId, projectId] });
  return NextResponse.json({ ok: true });
}
