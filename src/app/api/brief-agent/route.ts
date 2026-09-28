import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { authoriseAgent } from "@/lib/agentAuth";
import { allClients, findClient } from "@/lib/clientMatch";

// The morning brief, for Claude's 8am task through the innov8-onboarding MCP
// server (submit_brief). A SIBLING of the session-only /api/brief, never a
// child — PUBLIC_PATHS is matched with startsWith.
//
// What arrives is untrusted: the brief is written by AI from Jay's email and
// the web, so an email can put words in it. So the CRM stores short plain-text
// fields only (never HTML), refuses anything oversized rather than trimming it
// silently, keeps links to https, and links an item to a client only on an
// EXACT name/domain match — a near miss is kept as a hint for Jay to see, not
// guessed. Nothing here acts on an item: every action starts with Jay.

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_ITEMS = 40;
const LIMITS = { title: 140, summary: 600, suggested_action: 300, source_ref: 200, url: 500, client: 120, headline: 200 };
const SECTIONS = ["attention", "calendar", "news", "status"];
const SOURCES = ["email", "calendar", "web", "crm"];
const ACTIONS = ["", "reply_draft", "site_edit", "checklist", "tracker"];

const bad = (error: string, status = 400, extra: object = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: NO_STORE });

const sqlNow = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** GET — what the brief task needs to link items properly: the client list and the last brief date. */
export async function GET(request: NextRequest) {
  const auth = authoriseAgent(request);
  if (!auth.ok) return bad(auth.error, auth.status);
  await initDb();
  const db = getClient();
  const [clients, last] = await Promise.all([
    allClients(db),
    db.execute("SELECT brief_date, received_at, item_count FROM brief_runs ORDER BY brief_date DESC LIMIT 1").then(first),
  ]);
  return NextResponse.json({
    last_brief: last ? { date: String(last.brief_date), received_at: String(last.received_at), items: Number(last.item_count) } : null,
    clients: clients.map(({ id, name, domain }) => ({ id, name, domain })),
    limits: { max_items: MAX_ITEMS, ...LIMITS },
    sections: SECTIONS, source_kinds: SOURCES, action_kinds: ACTIONS.filter(Boolean),
  }, { headers: NO_STORE });
}

interface ItemIn {
  section?: string; title?: string; summary?: string; source_kind?: string; source_ref?: string;
  url?: string; client?: string; project_id?: number; task_id?: number;
  suggested_action?: string; action_kind?: string;
}

export async function POST(request: NextRequest) {
  const auth = authoriseAgent(request);
  if (!auth.ok) return bad(auth.error, auth.status);

  let body: { brief_date?: string; headline?: string; items?: ItemIn[] };
  try { body = await request.json(); } catch { return bad("bad body"); }

  const date = String(body.brief_date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("brief_date must be YYYY-MM-DD");
  const headline = String(body.headline || "").trim();
  if (headline.length > LIMITS.headline) return bad(`headline is over ${LIMITS.headline} characters`);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return bad("items is empty");
  if (items.length > MAX_ITEMS) return bad(`at most ${MAX_ITEMS} items — keep the ones that matter`);

  // Validate everything before writing anything, and say exactly which item is wrong.
  const problems: string[] = [];
  const clean = items.map((it, i) => {
    const s = (v: unknown) => String(v ?? "").trim();
    const row = {
      section: s(it.section) || "attention", title: s(it.title), summary: s(it.summary),
      source_kind: s(it.source_kind), source_ref: s(it.source_ref), url: s(it.url),
      client: s(it.client), project_id: Number(it.project_id) || 0, task_id: Number(it.task_id) || 0,
      suggested_action: s(it.suggested_action), action_kind: s(it.action_kind),
    };
    const where = `item ${i + 1}${row.title ? ` ("${row.title.slice(0, 40)}")` : ""}`;
    if (!row.title) problems.push(`${where}: title is required`);
    for (const k of ["title", "summary", "suggested_action", "source_ref", "url"] as const) {
      if (row[k].length > LIMITS[k]) problems.push(`${where}: ${k} is over ${LIMITS[k]} characters`);
    }
    if (row.client.length > LIMITS.client) problems.push(`${where}: client is over ${LIMITS.client} characters`);
    if (!SECTIONS.includes(row.section)) problems.push(`${where}: section must be one of ${SECTIONS.join(", ")}`);
    if (!SOURCES.includes(row.source_kind)) problems.push(`${where}: source_kind must be one of ${SOURCES.join(", ")}`);
    if (!ACTIONS.includes(row.action_kind)) problems.push(`${where}: action_kind must be one of ${ACTIONS.filter(Boolean).join(", ")} (or empty)`);
    if (row.url && !/^https:\/\/[^\s"'<>]+$/i.test(row.url)) problems.push(`${where}: url must be a plain https:// link`);
    return row;
  });
  if (problems.length) return bad("nothing saved — fix these and send again", 400, { problems });

  await initDb();
  const db = getClient();
  const clients = await allClients(db);
  const byId = new Map(clients.map((c) => [c.id, c]));

  // A task id is only kept if it really is an open task on that client.
  const taskIds = [...new Set(clean.map((r) => r.task_id).filter(Boolean))];
  const openTasks = new Map<number, number>();
  if (taskIds.length) {
    const rows = all(await db.execute({
      sql: `SELECT id, project_id FROM project_tasks WHERE completed = 0 AND id IN (${taskIds.map(() => "?").join(",")})`,
      args: taskIds,
    }));
    for (const r of rows) openTasks.set(Number(r.id), Number(r.project_id));
  }

  const now = sqlNow();
  const unmatched: string[] = [];
  const stmts = clean.map((r, i) => {
    let pid = r.project_id && byId.has(r.project_id) ? r.project_id : 0;
    if (!pid && r.client) {
      const { match } = findClient(clients, r.client, true);
      if (match) pid = match.id; else unmatched.push(r.client);
    }
    const taskId = r.task_id && openTasks.get(r.task_id) === pid && pid ? r.task_id : null;
    return {
      sql: `INSERT OR IGNORE INTO brief_items
              (brief_date, section, title, summary, source_kind, source_ref, url, project_id, client_hint,
               task_id, suggested_action, action_kind, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [date, r.section, r.title, r.summary, r.source_kind, r.source_ref, r.url, pid || null,
             pid ? "" : r.client, taskId, r.suggested_action, r.action_kind, i, now],
    };
  });
  const results = await db.batch(stmts, "write");
  const added = results.reduce((n, res) => n + (res.rowsAffected > 0 ? 1 : 0), 0);

  const count = Number(first(await db.execute({
    sql: "SELECT COUNT(*) AS n FROM brief_items WHERE brief_date = ?", args: [date],
  }))?.n) || 0;
  await db.execute({
    sql: `INSERT INTO brief_runs (brief_date, headline, received_at, item_count) VALUES (?, ?, ?, ?)
          ON CONFLICT(brief_date) DO UPDATE SET
            headline = CASE WHEN excluded.headline != '' THEN excluded.headline ELSE brief_runs.headline END,
            received_at = excluded.received_at, item_count = excluded.item_count`,
    args: [date, headline, now, count],
  });

  return NextResponse.json({
    ok: true, brief_date: date, added, already_had: clean.length - added, total_for_day: count,
    unmatched_clients: [...new Set(unmatched)],
  }, { headers: NO_STORE });
}
