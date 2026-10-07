import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import { authoriseAgent } from "@/lib/agentAuth";
import { clientPipelines, PIPELINE_STEPS, STEP_IDS, MARK_STATUSES } from "@/lib/pipeline";

// The Info view's feed from Jay's PC, for ~/.claude/mcp/onboarding/sync-skills.mjs
// and the innov8-onboarding MCP server. Key-authenticated (fails closed), a
// SIBLING of the session-only /api/info — PUBLIC_PATHS is matched with startsWith.
//
//   POST {action:"sync", skills?, scheduled?, tools?}   replace each kind sent
//   POST {action:"mark", project_id, step, status, note} mark a pipeline step
//   GET  ?project_id=                                    one client's pipeline

const NO_STORE = { "Cache-Control": "private, no-store" };
const KINDS = { skills: "skill", scheduled: "scheduled", tools: "tool" } as const;
const MAX_PER_KIND = 200;
const LIM = { item_key: 80, title: 120, category: 60, description: 2000, use_when: 500, next_key: 80, replaced_by: 80, extra: 4000 };
const bad = (error: string, status = 400, extra: object = {}) => NextResponse.json({ error, ...extra }, { status, headers: NO_STORE });
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

interface ItemIn {
  key?: string; title?: string; category?: string; sort?: number; description?: string;
  use_when?: string; next?: string; replaced_by?: string; extra?: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  const auth = authoriseAgent(request);
  if (!auth.ok) return bad(auth.error, auth.status);
  await initDb();
  const db = getClient();
  const pid = Number(request.nextUrl.searchParams.get("project_id") || 0);
  const pipelines = await clientPipelines(db, pid || undefined);
  const synced = first(await db.execute("SELECT value FROM app_meta WHERE key = 'info_synced_at'"));
  return NextResponse.json({
    synced_at: synced ? String(synced.value) : "",
    steps: PIPELINE_STEPS.map(({ id, label, command, manualBy, ads }) => ({ id, label, command, manual_by: manualBy || "", ads: ads || "" })),
    clients: pipelines,
  }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const auth = authoriseAgent(request);
  if (!auth.ok) return bad(auth.error, auth.status);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return bad("bad body"); }
  await initDb();
  const db = getClient();

  if (b.action === "mark") {
    const pid = Number(b.project_id || 0);
    const step = String(b.step || "");
    const status = String(b.status || "");
    if (!pid) return bad("project_id required");
    if (!STEP_IDS.has(step)) return bad(`step must be one of: ${[...STEP_IDS].join(", ")}`);
    if (!(MARK_STATUSES as readonly string[]).includes(status)) return bad(`status must be one of: ${MARK_STATUSES.join(", ")}`);
    const note = String(b.note || "").trim().slice(0, 300);
    if (status === "done" && note.length < 10) return bad("note must say what was done (at least 10 characters)");
    const project = first(await db.execute({
      sql: "SELECT p.id, COALESCE(l.business_name, '') AS name FROM projects p LEFT JOIN leads l ON l.id = p.lead_id WHERE p.id = ?",
      args: [pid],
    }));
    if (!project) return bad("no such project", 404);
    await db.execute({
      sql: `INSERT INTO pipeline_marks (project_id, step, status, marked_by, note, at) VALUES (?, ?, ?, 'claude', ?, ?)
            ON CONFLICT(project_id, step) DO UPDATE SET status = excluded.status, marked_by = 'claude',
              note = excluded.note, at = excluded.at`,
      args: [pid, step, status, note, now()],
    });
    const [p] = await clientPipelines(db, pid);
    const nextStep = PIPELINE_STEPS.find((s) => s.id === p?.next);
    return NextResponse.json({
      ok: true, client: String(project.name), step, status,
      next: nextStep ? { id: nextStep.id, label: nextStep.label, command: nextStep.command } : null,
    }, { headers: NO_STORE });
  }

  if (b.action !== "sync") return bad('action must be "sync" or "mark"');

  // Validate every item of every kind before writing anything.
  const problems: string[] = [];
  const rows: { kind: string; item: Required<Omit<ItemIn, "extra" | "next">> & { next_key: string; extra_json: string } }[] = [];
  const kindsSent: string[] = [];
  for (const [field, kind] of Object.entries(KINDS)) {
    const list = b[field];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { problems.push(`${field} must be an array`); continue; }
    if (list.length > MAX_PER_KIND) { problems.push(`${field}: at most ${MAX_PER_KIND}`); continue; }
    kindsSent.push(kind);
    const seen = new Set<string>();
    (list as ItemIn[]).forEach((it, i) => {
      const s = (v: unknown) => String(v ?? "").trim();
      const item = {
        key: s(it.key), title: s(it.title) || s(it.key), category: s(it.category), sort: Number(it.sort) || 0,
        description: s(it.description), use_when: s(it.use_when), next_key: s(it.next), replaced_by: s(it.replaced_by),
        extra_json: JSON.stringify(it.extra && typeof it.extra === "object" ? it.extra : {}),
      };
      const where = `${field}[${i}]${item.key ? ` (${item.key})` : ""}`;
      if (!/^[A-Za-z0-9_.:/-]{1,80}$/.test(item.key)) problems.push(`${where}: key must be 1-80 letters, digits or - _ . : /`);
      if (seen.has(item.key)) problems.push(`${where}: duplicate key`);
      seen.add(item.key);
      if (item.title.length > LIM.title) problems.push(`${where}: title over ${LIM.title}`);
      if (item.category.length > LIM.category) problems.push(`${where}: category over ${LIM.category}`);
      if (item.description.length > LIM.description) problems.push(`${where}: description over ${LIM.description}`);
      if (item.use_when.length > LIM.use_when) problems.push(`${where}: use_when over ${LIM.use_when}`);
      if (item.next_key.length > LIM.next_key || item.replaced_by.length > LIM.replaced_by) problems.push(`${where}: next/replaced_by too long`);
      if (item.extra_json.length > LIM.extra) problems.push(`${where}: extra over ${LIM.extra} characters`);
      rows.push({ kind, item });
    });
  }
  if (!kindsSent.length) return bad("nothing to sync — send skills, scheduled and/or tools");
  if (problems.length) return bad("nothing saved — fix these and send again", 400, { problems: problems.slice(0, 40) });

  const at = now();
  await db.batch([
    ...kindsSent.map((k) => ({ sql: "DELETE FROM info_items WHERE kind = ?", args: [k] })),
    ...rows.map(({ kind, item }) => ({
      sql: `INSERT INTO info_items (kind, item_key, title, category, sort, description, use_when, next_key, replaced_by, extra_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [kind, item.key, item.title, item.category, item.sort, item.description, item.use_when,
             item.next_key, item.replaced_by, item.extra_json, at],
    })),
    { sql: "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('info_synced_at', ?)", args: [at] },
  ], "write");

  const counts = Object.fromEntries(kindsSent.map((k) => [k, rows.filter((r) => r.kind === k).length]));
  return NextResponse.json({ ok: true, synced_at: at, counts }, { headers: NO_STORE });
}
