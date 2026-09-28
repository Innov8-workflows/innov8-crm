import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import { authoriseAgent as authorise } from "@/lib/agentAuth";
import { allClients, findClient } from "@/lib/clientMatch";
import {
  addTask, updateTask, completeTask, reopenTask, getTask, listOutstanding, listSetupGaps,
  listRecentlyResolved, isTemplateTitle, TaskError,
} from "@/lib/tasks";
import { SETUP_ITEMS, isSetupField } from "@/lib/setupFields";

// The outstanding-task tracker, for Claude (Code or Cowork) through the
// innov8-onboarding MCP server. A SIBLING of /api/project-tasks, never a child:
// PUBLIC_PATHS is matched with startsWith, so a public path under
// /api/project-tasks/ would have opened the session-only route too.
//
// Guardrails, all enforced here rather than trusted to the caller — Claude
// Desktop can be set to run tools without asking, so the server is the only
// place a wrong tick can be stopped:
//   - Writes take a project id, never a name. Names are for finding a client,
//     and a name that matches two clients is refused with the candidates.
//   - Every task in a write must belong to that project and be in the right
//     state, or nothing is written (409).
//   - Completing needs a real note of what was done.
//   - No delete, and no renaming of generic checklist steps (sync-tasks matches
//     them by title, so a renamed one would come straight back as a duplicate).
//   - Never touches a project's stage: stage decides whether a client counts
//     towards MRR.
//   - Every response names the client and the tasks, so a wrong pick is visible.

const NO_STORE = { "Cache-Control": "private, no-store" };
const MIN_NOTE = 15;

// Key check and client lookup live in src/lib/agentAuth.ts and
// src/lib/clientMatch.ts, shared with /api/brief-agent.

const bad = (error: string, status = 400, extra: object = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: NO_STORE });

export async function GET(request: NextRequest) {
  const auth = authorise(request);
  if (!auth.ok) return bad(auth.error, auth.status);
  await initDb();
  const db = getClient();
  const clients = await allClients(db);

  const pid = Number(request.nextUrl.searchParams.get("project_id") || 0);
  const q = request.nextUrl.searchParams.get("client") || "";

  // No client asked for: a one-line summary of every client, so Claude can see
  // the whole picture and pick the right project id.
  if (!pid && !q) {
    const [tasks, gaps] = await Promise.all([listOutstanding(db), listSetupGaps(db)]);
    return NextResponse.json({
      clients: clients.map((c) => ({
        ...c,
        outstanding: tasks.filter((t) => t.project_id === c.id && !t.template).length,
        checklist_steps: tasks.filter((t) => t.project_id === c.id && t.template).length,
        setup_not_done: gaps.filter((g) => g.project_id === c.id).map((g) => g.label),
      })),
    }, { headers: NO_STORE });
  }

  let client = pid ? clients.find((c) => c.id === pid) : undefined;
  if (!client) {
    const { match, candidates } = findClient(clients, q);
    if (!match) {
      return bad(candidates.length > 1 ? `"${q}" matches more than one client — use project_id` : `no client matches "${q}"`,
        candidates.length > 1 ? 409 : 404, { candidates: candidates.map(({ id, name, domain }) => ({ id, name, domain })) });
    }
    client = match;
  }

  const [tasks, gaps, resolved] = await Promise.all([
    listOutstanding(db, client.id), listSetupGaps(db, client.id), listRecentlyResolved(db, 30, 200),
  ]);
  return NextResponse.json({
    client,
    outstanding: tasks.filter((t) => !t.template).map((t) => ({
      id: t.id, title: t.title, detail: t.detail, waiting_on: t.waiting_on || "jay",
      blocked_by: t.blocked ? { id: t.blocked_by, title: t.blocker_title } : null, blocks: t.blocks,
    })),
    setup_not_done: gaps.map((g) => ({ field: g.field, label: g.label, meaning: g.title })),
    checklist_steps_open: tasks.filter((t) => t.template).map((t) => ({ id: t.id, title: t.title, stage: t.stage })),
    recently_resolved: resolved.filter((r) => Number(r.project_id) === client.id).slice(0, 15),
  }, { headers: NO_STORE });
}

interface Body {
  action?: string; project_id?: number; task_id?: number; task_ids?: number[];
  title?: string; detail?: string; waiting_on?: string; blocked_by?: number;
  resolution?: string; title_contains?: string; reason?: string; field?: string; value?: number;
}

export async function POST(request: NextRequest) {
  const auth = authorise(request);
  if (!auth.ok) return bad(auth.error, auth.status);

  let b: Body;
  try { b = await request.json(); } catch { return bad("bad body"); }
  const action = String(b.action || "");
  const pid = Number(b.project_id || 0);
  if (!pid) return bad("project_id is required for every write — find it with GET first");

  await initDb();
  const db = getClient();
  const project = first(await db.execute({
    sql: `SELECT p.id, COALESCE(l.business_name, '') AS name, COALESCE(p.client_status, '') AS status
            FROM projects p LEFT JOIN leads l ON l.id = p.lead_id WHERE p.id = ?`,
    args: [pid],
  }));
  if (!project) return bad("no such project", 404);
  if (project.status === "lost") return bad("that client is marked lost", 409);
  const name = String(project.name);

  try {
    if (action === "add") {
      const t = await addTask(db, pid, {
        title: b.title, detail: b.detail, waiting_on: b.waiting_on === "jay" ? "" : b.waiting_on, blocked_by: b.blocked_by,
      }, "claude");
      return NextResponse.json({ ok: true, client: name, added: { id: t.id, title: t.title } }, { headers: NO_STORE });
    }

    if (action === "complete" || action === "reopen") {
      const ids = (b.task_ids?.length ? b.task_ids : b.task_id ? [b.task_id] : []).map(Number).filter(Boolean);
      if (!ids.length) return bad("task_ids required");
      if (ids.length > 60) return bad("at most 60 tasks per call");
      const note = String(action === "complete" ? b.resolution || "" : b.reason || "").trim();
      if (action === "complete" && note.length < MIN_NOTE) {
        return bad(`resolution must say what was actually done (at least ${MIN_NOTE} characters)`);
      }

      // Check every task before writing any of them — all or nothing.
      const tasks = await Promise.all(ids.map((id) => getTask(db, id)));
      const wrong = ids.filter((id, i) => !tasks[i] || tasks[i]!.project_id !== pid);
      if (wrong.length) return bad(`task(s) ${wrong.join(", ")} are not on ${name}`, 409);
      const wantOpen = action === "complete";
      const state = tasks.filter((t) => (Number(t!.completed) === 0) !== wantOpen);
      if (state.length) {
        return bad(`already ${wantOpen ? "done" : "open"}: ${state.map((t) => `#${t!.id} "${t!.title}"`).join(", ")}`, 409);
      }
      const needle = String(b.title_contains || "").toLowerCase().trim();
      if (needle) {
        const miss = tasks.filter((t) => !t!.title.toLowerCase().includes(needle));
        if (miss.length) return bad(`title_contains "${b.title_contains}" does not match: ${miss.map((t) => `#${t!.id} "${t!.title}"`).join(", ")}`, 409);
      }

      for (const id of ids) {
        if (wantOpen) await completeTask(db, id, { by: "claude", resolution: note });
        else await reopenTask(db, id);
      }
      return NextResponse.json({
        ok: true, client: name,
        [wantOpen ? "completed" : "reopened"]: tasks.map((t) => ({ id: t!.id, title: t!.title })),
      }, { headers: NO_STORE });
    }

    if (action === "update") {
      const id = Number(b.task_id || 0);
      const t = id ? await getTask(db, id) : null;
      if (!t || t.project_id !== pid) return bad(`task ${id} is not on ${name}`, 409);
      if (b.title !== undefined && isTemplateTitle(t.title)) {
        return bad("generic checklist steps can't be renamed — the checklist top-up matches them by title " +
                   "and would add the original straight back. Tick it with a note instead, or add a new item.");
      }
      const updated = await updateTask(db, id, {
        title: b.title, detail: b.detail,
        waiting_on: b.waiting_on === "jay" ? "" : b.waiting_on, blocked_by: b.blocked_by,
      });
      return NextResponse.json({ ok: true, client: name, updated: { id: updated.id, title: updated.title } }, { headers: NO_STORE });
    }

    if (action === "set_setup") {
      const field = String(b.field || "");
      if (!isSetupField(field)) return bad(`field must be one of: ${SETUP_ITEMS.map((i) => i.field).join(", ")}`);
      const value = Number(b.value) === 1 ? 1 : 0;
      if (value === 1 && String(b.resolution || "").trim().length < MIN_NOTE) {
        return bad(`resolution must say how you know it's done (at least ${MIN_NOTE} characters)`);
      }
      // The column name comes from the fixed setup list above, never from the caller.
      await db.execute({
        sql: `UPDATE projects SET ${field} = ?, updated_at = ? WHERE id = ?`,
        args: [value, new Date().toISOString(), pid],
      });
      const label = SETUP_ITEMS.find((i) => i.field === field)!.label;
      const lead = first(await db.execute({ sql: "SELECT lead_id FROM projects WHERE id = ?", args: [pid] }));
      if (lead?.lead_id) {
        await db.execute({
          sql: "INSERT INTO activities (lead_id, type, description, created_at) VALUES (?, 'task', ?, ?)",
          args: [Number(lead.lead_id),
                 `Claude ${value ? "ticked" : "unticked"} setup: ${label} — ${String(b.resolution || b.reason || "").trim().slice(0, 500)}`,
                 new Date().toISOString()],
        });
      }
      return NextResponse.json({ ok: true, client: name, setup: { field, label, done: value === 1 } }, { headers: NO_STORE });
    }

    return bad("action must be one of: add, complete, reopen, update, set_setup (there is no delete)");
  } catch (e) {
    if (e instanceof TaskError) return bad(e.message, e.status);
    throw e;
  }
}
