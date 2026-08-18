import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import * as XLSX from "xlsx";
import { getClient, initDb, all, first } from "@/lib/db";
import { parseSheetTimestamp, mapRow, cleanPhone, isClickType } from "@/lib/leadImport";

// Bulk backfill of a client's historical Google Sheet lead log into client_leads.
//
// Project-scoped by URL so [id] can't be spoofed in a body field, and gated for
// free by middleware.ts (this path is not in PUBLIC_PATHS). Multipart, following
// /api/leads/import.
//
// dry_run=true runs the IDENTICAL parse and returns the identical summary with
// nothing written. Same code path, so the preview cannot lie about what the commit
// will do — which a separately-written preview endpoint inevitably would.

export const maxDuration = 60;

const MAX_BYTES = 5_000_000;
const CHUNK = 1000;

type Skips = Record<string, number>;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  const includeClicks = String(form.get("include_clicks") || "") === "true";
  const dryRun = String(form.get("dry_run") || "") === "true";
  const before = String(form.get("before") || "").slice(0, 10); // exclusive cutoff, YYYY-MM-DD

  const db = getClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  let rows: Record<string, unknown>[];
  try {
    const isCsv = /\.(csv|tsv|txt)$/i.test(file.name);
    const wb = isCsv
      // raw:true keeps every CSV cell a STRING. Without it xlsx runs its fuzzy date
      // parse — new Date("05/08/2026") — and V8 reads that as May 8th, filing half
      // of every UK sheet three months early. It also stops 07878759053 becoming
      // the number 7878759053 with the leading zero gone. Both measured, not assumed.
      ? XLSX.read(buffer.toString("utf8").replace(/^﻿/, ""), { type: "string", raw: true })
      : XLSX.read(buffer, { type: "buffer" }); // a real .xlsx carries its own cell types
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return NextResponse.json({ error: "No sheet found in that file" }, { status: 400 });
    // Record<string, unknown>, not <string, string>: in a real .xlsx the timestamp
    // cell is a number, and typing it as string is a lie the compiler accepts and
    // the runtime does not.
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  } catch {
    return NextResponse.json({ error: "Could not read that file" }, { status: 400 });
  }
  if (rows.length === 0) return NextResponse.json({ error: "No data rows found" }, { status: 400 });

  // One narrow, project-scoped read of columns that sit before `raw`, so this
  // never walks a wide row. ON CONFLICT stays on the INSERT as the real guarantee;
  // this Set exists so the summary can say "already in the CRM" instead of
  // silently reporting zero rows affected.
  const existing = new Set(
    all(await db.execute({
      sql: "SELECT dedup_hash FROM client_leads WHERE project_id = ?",
      args: [projectId],
    })).map((r) => String(r.dedup_hash))
  );

  // The date the live sync started for this client — what the cutoff should be set
  // to, and something Jay has no other way to discover.
  const earliestLive = first(await db.execute({
    sql: `SELECT MIN(received_at) AS m FROM client_leads
          WHERE project_id = ? AND entry_mode = 'live'`,
    args: [projectId],
  }));

  const skipped: Skips = {};
  const bump = (reason: string) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  const problems: { row: number; reason: string; value: string }[] = [];
  const byMonth: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const samples: Record<string, string>[] = [];
  const inFile = new Set<string>();
  const inserts: { sql: string; args: (string | number)[] }[] = [];
  const nowIso = new Date().toISOString();
  let firstAt = "";
  let lastAt = "";

  rows.forEach((raw, i) => {
    const r = mapRow(raw);
    const rowNo = i + 2; // +1 for the header, +1 for 1-based sheet rows

    const receivedAt = parseSheetTimestamp(r.ts);
    if (!receivedAt) {
      bump("bad_timestamp");
      if (problems.length < 20) {
        problems.push({ row: rowNo, reason: "bad_timestamp", value: String(r.ts ?? "").slice(0, 40) });
      }
      return;
    }

    const type = String(r.type ?? "").trim();
    if (!includeClicks && isClickType(type)) { bump("click_event"); return; }

    // Half-open, and a plain string compare: both sides are "YYYY-MM-DD…" so this
    // is the same comparison convention clientReporting.ts uses for month ranges.
    if (before && receivedAt >= before) { bump("after_cutoff"); return; }

    const name = String(r.name ?? "").trim().slice(0, 300);
    const email = String(r.email ?? "").trim().slice(0, 300);
    const phone = cleanPhone(r.phone);
    if (!name && !email && !phone) { bump("no_contact"); return; }

    const details = String(r.details ?? "").trim();
    const service = String(r.service ?? "").trim();
    const message = [details, service && `service: ${service}`]
      .filter(Boolean).join("\n").slice(0, 2000);

    // type.toLowerCase() is exactly what the live Apps Script sends as `source`,
    // so an imported month and a live month produce the same by_source breakdown.
    const source = (type.toLowerCase() || "form").slice(0, 40);
    const formName = String(r.where ?? "").trim().slice(0, 120);
    const pageUrl = String(r.page ?? "").trim().slice(0, 300);

    const basis = ["imp", receivedAt, name.toLowerCase(), phone, email.toLowerCase(),
                   type.toLowerCase(), details.slice(0, 200)].join("|");
    const dedupHash = crypto.createHash("sha256")
      .update(`${projectId}|${basis}`).digest("hex").slice(0, 32);

    if (inFile.has(dedupHash)) { bump("duplicate_in_file"); return; }
    inFile.add(dedupHash);
    if (existing.has(dedupHash)) { bump("already_in_crm"); return; }

    const period = receivedAt.slice(0, 7);
    byMonth[period] = (byMonth[period] || 0) + 1;
    byType[source] = (byType[source] || 0) + 1;
    if (!firstAt || receivedAt < firstAt) firstAt = receivedAt;
    if (!lastAt || receivedAt > lastAt) lastAt = receivedAt;
    if (samples.length < 3) {
      samples.push({ received_at: receivedAt, name, phone, source, message: message.slice(0, 120) });
    }

    inserts.push({
      // raw = '' — imported rows must stay narrow. message and raw at 2000 each can
      // tip a row into overflow pages, and getClientLeadRollup reads `status`, which
      // sits after raw (see the blob-walk note in src/lib/projectCache.ts).
      // status = 'seen' — 'new' would light the unseen dot on every backfilled row.
      sql: `INSERT INTO client_leads
              (project_id, received_at, submitted_at, name, email, phone, message,
               source, form_name, page_url, raw, dedup_hash, status, entry_mode, created_at)
            VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, '', ?, 'seen', 'import', ?)
            ON CONFLICT(project_id, dedup_hash) DO NOTHING`,
      args: [projectId, receivedAt, name, email, phone, message, source,
             formName, pageUrl, dedupHash, nowIso],
    });
  });

  let inserted = 0;
  let idFrom = 0;
  let idTo = 0;

  if (!dryRun && inserts.length) {
    const beforeMax = first(await db.execute({
      sql: "SELECT MAX(id) AS m FROM client_leads WHERE project_id = ?",
      args: [projectId],
    }));
    idFrom = (Number(beforeMax?.m) || 0) + 1;

    for (let i = 0; i < inserts.length; i += CHUNK) {
      const results = await db.batch(inserts.slice(i, i + CHUNK), "write");
      inserted += results.reduce((n, r) => n + Number(r.rowsAffected), 0);
    }

    const afterMax = first(await db.execute({
      sql: "SELECT MAX(id) AS m FROM client_leads WHERE project_id = ?",
      args: [projectId],
    }));
    idTo = Number(afterMax?.m) || 0;
  }

  const sortCount = (o: Record<string, number>) =>
    Object.entries(o).map(([k, count]) => ({ k, count })).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    file: file.name,
    total_rows: rows.length,
    // On a dry run nothing is written, so report what WOULD go in.
    ready: inserts.length,
    inserted,
    skipped,
    date_range: { first: firstAt, last: lastAt },
    // The dashboard only ever shows one month, so without this there is no
    // evidence an import of older history did anything at all.
    by_month: Object.entries(byMonth).map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    by_type: sortCount(byType).map(({ k, count }) => ({ type: k, count })),
    cutoff_used: before,
    earliest_live: String(earliestLive?.m || "").slice(0, 10),
    samples,
    problems,
    id_range: idFrom && idTo >= idFrom ? { from: idFrom, to: idTo } : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
