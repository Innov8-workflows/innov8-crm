import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getClient, initDb, first } from "@/lib/db";
import type { InStatement } from "@libsql/client";

// Inbound enquiries from a client's own website, pushed by that client's Apps
// Script at the moment it writes the sheet row. See the snippet in the Client
// Dashboard's "Lead capture setup" panel.
//
// Auth: per-project `lead_ingest_key` in the x-innov8-key header (NOT the shared
// WEBHOOK_SECRET — that would put a CRM-wide credential in every client's script
// and inherits the unset-env-var-is-open behaviour of the other webhooks; and
// NOT tracking_id, which is public in every visitor's page source).
//
// Unlike /api/track this answers a real 401 on a bad key: the only caller is
// Jay's own Apps Script, and a visible failure in its execution log is how a
// mis-pasted key gets found. No CORS headers and no OPTIONS handler either —
// this is server-to-server, and Allow-Origin:* on a write endpoint invites abuse.

const MAX_LEADS = 100;
const clamp = (v: unknown, n: number) => String(v ?? "").slice(0, n);

export async function POST(request: NextRequest) {
  const key = request.headers.get("x-innov8-key") || "";
  if (!key.startsWith("lk_")) {
    return NextResponse.json({ ok: false, error: "missing or malformed x-innov8-key header" }, { status: 401 });
  }

  await initDb();
  const db = getClient();

  const project = first(await db.execute({
    sql: "SELECT id FROM projects WHERE lead_ingest_key = ? LIMIT 1",
    args: [key],
  }));
  if (!project) {
    return NextResponse.json({ ok: false, error: "unknown key" }, { status: 401 });
  }
  const projectId = Number(project.id);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  // Accept a single lead, { leads: [...] }, or a bare array — same tolerance as
  // /api/webhook/prospects.
  const raw = body as Record<string, unknown>;
  const items: Record<string, unknown>[] = Array.isArray(body)
    ? (body as Record<string, unknown>[])
    : Array.isArray(raw?.leads)
      ? (raw.leads as Record<string, unknown>[])
      : [raw];

  if (items.length === 0) return NextResponse.json({ ok: true, inserted: 0, duplicates: 0 });
  if (items.length > MAX_LEADS) {
    return NextResponse.json({ ok: false, error: `too many leads (max ${MAX_LEADS})` }, { status: 400 });
  }

  const now = new Date().toISOString().replace("T", " ").slice(0, 19); // match datetime('now')
  const seen = new Set<string>();
  const inserts: InStatement[] = [];

  for (const it of items) {
    if (!it || typeof it !== "object") continue;

    const name = clamp(it.name, 300);
    const email = clamp(it.email, 300);
    const phone = clamp(it.phone, 60);
    const message = clamp(it.message, 2000);
    const submittedAt = clamp(it.submitted_at, 60);
    const eventId = clamp(it.event_id, 200);

    // Idempotency. The snippet always sends event_id ("Sheet1!42"), which pins a
    // submission exactly, so a double-fired trigger or a re-run can't duplicate.
    // Without it we fall back to the content + the day — which does mean two
    // identical enquiries from the same person on the same day would collapse
    // (surfaced to the caller via the `duplicates` count). Using today's date
    // rather than no date is what stops a genuine repeat next week being eaten.
    const basis = eventId || [submittedAt.slice(0, 10) || now.slice(0, 10), email.toLowerCase(), phone, message.slice(0, 200)].join("|");
    const dedupHash = crypto.createHash("sha256").update(`${projectId}|${basis}`).digest("hex").slice(0, 32);
    if (seen.has(dedupHash)) continue; // duplicate inside this very payload
    seen.add(dedupHash);

    inserts.push({
      sql: `INSERT INTO client_leads
              (project_id, received_at, submitted_at, name, email, phone, message,
               source, form_name, page_url, raw, dedup_hash, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
            ON CONFLICT(project_id, dedup_hash) DO NOTHING`,
      args: [
        projectId, now, submittedAt, name, email, phone, message,
        clamp(it.source, 40) || "form", clamp(it.form_name, 120), clamp(it.page_url, 300),
        clamp(JSON.stringify(it), 2000), dedupHash, now,
      ],
    });
  }

  if (inserts.length === 0) return NextResponse.json({ ok: true, inserted: 0, duplicates: 0 });

  // One batched write, like /api/webhook/prospects.
  let inserted = 0;
  try {
    const results = await db.batch(inserts, "write");
    inserted = results.reduce((n, r) => n + (Number(r.rowsAffected) || 0), 0);
  } catch (err) {
    console.error("client-leads ingest failed:", err);
    return NextResponse.json({ ok: false, error: "insert failed", inserted: 0 }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted,
    duplicates: items.length - inserted,
    project: projectId,
  });
}
