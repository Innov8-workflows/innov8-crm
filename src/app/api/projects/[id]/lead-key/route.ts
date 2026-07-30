import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import { getOrCreateLeadKey, mintLeadKey } from "@/lib/clientReporting";

// The per-project Apps Script write key. Deliberately its own session-guarded
// endpoint rather than a field on /api/projects — that response is cached into
// sessionStorage by LiveClients, so the key is fetched only when the snippet is
// actually being displayed.

// GET — returns the key, minting it on first read (same lazy pattern the
// analytics route uses for tracking_id).
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const db = getClient();
  const key = await getOrCreateLeadKey(db, projectId);
  if (key === null) return NextResponse.json({ error: "not found" }, { status: 404 });

  const row = first(await db.execute({ sql: "SELECT tracking_id FROM projects WHERE id = ?", args: [projectId] }));
  return NextResponse.json({ lead_ingest_key: key, tracking_id: String(row?.tracking_id || "") }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

// POST { rotate: true } — issue a new key. The old snippet stops working the
// moment this returns, so the UI confirms first.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  if (!body?.rotate) return NextResponse.json({ error: "rotate: true required" }, { status: 400 });

  const db = getClient();
  const exists = first(await db.execute({ sql: "SELECT id FROM projects WHERE id = ?", args: [projectId] }));
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  const key = await mintLeadKey(db, projectId);
  return NextResponse.json({ lead_ingest_key: key }, { headers: { "Cache-Control": "private, no-store" } });
}
