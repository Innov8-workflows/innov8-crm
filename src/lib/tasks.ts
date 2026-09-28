// The one place that changes a project task, and the one place that works out
// what is still outstanding for a client.
//
// Two things tick tasks: Jay in the CRM, and Claude (Code or Cowork) through
// /api/tasks-agent. If each wrote to project_tasks its own way they would drift,
// and the tracker would stop being trustworthy — which is the whole reason it
// exists. So every write goes through here.
//
// Deliberately NOT done here:
//
//  - Moving a project's stage. The modal auto-advances a stage when all its tasks
//    are ticked, and stage decides whether a client counts towards MRR
//    (CLIENT_STAGES in statsQueries.ts). A tick from Claude must never quietly
//    move a client into or out of revenue. Stage changes stay a human action.
//
//  - Keeping the 9 setup pills in step. They are their own record; the
//    Outstanding view lists each unticked one as a row, and ticking that row
//    ticks the pill. A second copy kept in sync both ways would sooner or later
//    give "is GA4 done?" two answers.
//
//  - Writing to the lead's activity timeline. The tidy alone is hundreds of
//    ticks, and that timeline shows only the latest 200 rows — it would bury the
//    real history. The "recently resolved" feed reads completed_at directly.

import type { Client } from "@libsql/client";
import { all, first } from "@/lib/db";
import { DEFAULT_PROJECT_TASKS } from "@/lib/projectTasks";
import { SETUP_ITEMS } from "@/lib/setupFields";

/** '' means it is on Jay. */
export const WAITING_ON = ["", "client", "google", "other"] as const;
export type Actor = "jay" | "claude";

export interface TaskRow {
  id: number; project_id: number; title: string; completed: number; sort_order: number;
  stage: string; created_at: string; detail: string; waiting_on: string; blocked_by: number;
  completed_at: string; completed_by: string; resolution: string; source: string; updated_at: string;
}

export class TaskError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const now = () => new Date().toISOString();
const clamp = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/**
 * A step from the generic 32-item build checklist, as opposed to something real
 * that came up for this client. Worked out from the title rather than `source`
 * because every row created before this column existed has source ''.
 */
const TEMPLATE_TITLES = new Set([
  ...DEFAULT_PROJECT_TASKS.map((t) => t.title.toLowerCase().trim()),
  // Earlier wordings of template steps, still on older projects.
  "seo setup (meta, sitemap)",
]);
export const isTemplateTitle = (title: string) => TEMPLATE_TITLES.has(String(title).toLowerCase().trim());

export async function getTask(db: Client, id: number): Promise<TaskRow | null> {
  const row = first(await db.execute({ sql: "SELECT * FROM project_tasks WHERE id = ?", args: [id] }));
  return row ? (row as unknown as TaskRow) : null;
}

/** Tick a task. A no-op if it is already ticked, so the first "who and why" stands. */
export async function completeTask(
  db: Client, id: number, opts: { by: Actor; resolution?: string },
): Promise<{ task: TaskRow; changed: boolean }> {
  const t = await getTask(db, id);
  if (!t) throw new TaskError("no such task", 404);
  if (Number(t.completed) === 1) return { task: t, changed: false };
  await db.execute({
    sql: `UPDATE project_tasks
             SET completed = 1, completed_at = ?, completed_by = ?, resolution = ?, updated_at = ?
           WHERE id = ?`,
    args: [now(), opts.by, clamp(opts.resolution, 1000), now(), id],
  });
  return { task: (await getTask(db, id))!, changed: true };
}

export async function reopenTask(
  db: Client, id: number,
): Promise<{ task: TaskRow; changed: boolean }> {
  const t = await getTask(db, id);
  if (!t) throw new TaskError("no such task", 404);
  if (Number(t.completed) !== 1) return { task: t, changed: false };
  await db.execute({
    sql: `UPDATE project_tasks
             SET completed = 0, completed_at = '', completed_by = '', resolution = '', updated_at = ?
           WHERE id = ?`,
    args: [now(), id],
  });
  return { task: (await getTask(db, id))!, changed: true };
}

/**
 * Refuse a blocker that would make the list lie: another client's task, the task
 * itself, or a chain that loops back round — a loop would leave every item in it
 * permanently "blocked" with nothing anyone could do to clear it.
 */
async function assertBlocker(db: Client, projectId: number, selfId: number, blockerId: number) {
  if (!blockerId) return;
  if (blockerId === selfId) throw new TaskError("a task cannot block itself");
  let cur = blockerId;
  for (let hops = 0; hops < 25 && cur; hops++) {
    const b = first(await db.execute({
      sql: "SELECT project_id, blocked_by FROM project_tasks WHERE id = ?", args: [cur],
    }));
    if (!b) throw new TaskError("blocked_by points at a task that does not exist");
    if (Number(b.project_id) !== projectId) throw new TaskError("blocked_by must be a task on the same client");
    cur = Number(b.blocked_by || 0);
    if (cur === selfId) throw new TaskError("that would make the tasks block each other in a loop");
  }
}

export interface TaskInput {
  title?: string; detail?: string; waiting_on?: string; blocked_by?: number;
  stage?: string; sort_order?: number;
}

function assertWaitingOn(v: string | undefined) {
  if (v !== undefined && !(WAITING_ON as readonly string[]).includes(v)) {
    throw new TaskError("waiting_on must be '', 'client', 'google' or 'other'");
  }
}

export async function addTask(
  db: Client, projectId: number, input: TaskInput, by: Actor,
): Promise<TaskRow> {
  const title = clamp(input.title, 200);
  if (!title) throw new TaskError("title required");
  assertWaitingOn(input.waiting_on);
  const project = first(await db.execute({ sql: "SELECT id FROM projects WHERE id = ?", args: [projectId] }));
  if (!project) throw new TaskError("no such project", 404);

  const maxOrder = first(await db.execute({
    sql: "SELECT COALESCE(MAX(sort_order), 0) AS v FROM project_tasks WHERE project_id = ?", args: [projectId],
  }));
  const ts = now();
  const res = await db.execute({
    sql: `INSERT INTO project_tasks
            (project_id, title, stage, sort_order, created_at, detail, waiting_on, source, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [projectId, title, clamp(input.stage, 40), Number(maxOrder?.v || 0) + 1, ts,
           clamp(input.detail, 2000), input.waiting_on ?? "", by === "claude" ? "claude" : "manual", ts],
  });
  const id = Number(res.lastInsertRowid);
  // The blocker needs the new id to check for a loop, so it is applied second.
  if (input.blocked_by) await updateTask(db, id, { blocked_by: input.blocked_by });
  return (await getTask(db, id))!;
}

export async function updateTask(db: Client, id: number, input: TaskInput): Promise<TaskRow> {
  const t = await getTask(db, id);
  if (!t) throw new TaskError("no such task", 404);
  assertWaitingOn(input.waiting_on);

  const sets: string[] = [];
  const args: (string | number)[] = [];
  const put = (col: string, v: string | number) => { sets.push(`${col} = ?`); args.push(v); };

  if (input.title !== undefined) {
    const title = clamp(input.title, 200);
    if (!title) throw new TaskError("title cannot be empty");
    put("title", title);
  }
  if (input.detail !== undefined) put("detail", clamp(input.detail, 2000));
  if (input.waiting_on !== undefined) put("waiting_on", input.waiting_on);
  if (input.stage !== undefined) put("stage", clamp(input.stage, 40));
  if (input.sort_order !== undefined) put("sort_order", Number(input.sort_order) || 0);
  if (input.blocked_by !== undefined) {
    const b = Number(input.blocked_by) || 0;
    await assertBlocker(db, t.project_id, id, b);
    put("blocked_by", b);
  }
  if (!sets.length) return t;
  put("updated_at", now());
  args.push(id);
  await db.execute({ sql: `UPDATE project_tasks SET ${sets.join(", ")} WHERE id = ?`, args });
  return (await getTask(db, id))!;
}

// ---------------------------------------------------------------- reading ---

export interface OutstandingTask extends TaskRow {
  business_name: string;
  /** From the generic build checklist rather than something specific to this client. */
  template: boolean;
  /** Its blocker is still open, so it cannot be worked on yet. */
  blocked: boolean;
  blocker_title: string;
  /** How many open items are waiting on this one. */
  blocks: number;
}

/** An unticked setup pill, shown as a row of its own. */
export interface SetupGap {
  project_id: number; business_name: string; field: string; label: string; title: string;
}

/**
 * Most important first: things holding other things up, then things waiting on
 * someone (they need chasing), then everything else in list order.
 */
export function byImportance(a: OutstandingTask, b: OutstandingTask) {
  const ra = [a.template ? 1 : 0, a.blocks > 0 ? 0 : 1, a.waiting_on ? 0 : 1, a.sort_order];
  const rb = [b.template ? 1 : 0, b.blocks > 0 ? 0 : 1, b.waiting_on ? 0 : 1, b.sort_order];
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return a.id - b.id;
}

/**
 * Every open task, with its client's name and whether it is blocked. Lost
 * clients are left out — their remaining items are nobody's work any more.
 *
 * Narrow columns only: project_tasks carries no wide values, and projects is
 * joined for its status alone (see the blob-walk warning in projectCache.ts
 * before adding any projects column to a list query).
 */
export async function listOutstanding(db: Client, projectId?: number): Promise<OutstandingTask[]> {
  const rows = all(await db.execute({
    sql: `SELECT t.*, COALESCE(l.business_name, '') AS business_name
            FROM project_tasks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN leads l ON l.id = p.lead_id
           WHERE t.completed = 0
             AND COALESCE(p.client_status, '') != 'lost'
             AND (? = 0 OR t.project_id = ?)
           ORDER BY t.project_id, t.sort_order`,
    args: [projectId || 0, projectId || 0],
  })) as unknown as (TaskRow & { business_name: string })[];

  const open = new Map(rows.map((r) => [Number(r.id), r]));
  const blockCount = new Map<number, number>();
  for (const r of rows) {
    const b = Number(r.blocked_by || 0);
    if (b && open.has(b)) blockCount.set(b, (blockCount.get(b) || 0) + 1);
  }
  return rows.map((r) => {
    const b = Number(r.blocked_by || 0);
    const blocker = b ? open.get(b) : undefined;
    return {
      ...r,
      template: isTemplateTitle(r.title),
      blocked: !!blocker,
      blocker_title: blocker?.title || "",
      blocks: blockCount.get(Number(r.id)) || 0,
    };
  });
}

/** Every unticked setup pill on a client that isn't lost. */
export async function listSetupGaps(db: Client, projectId?: number): Promise<SetupGap[]> {
  const cols = SETUP_ITEMS.map((i) => `p.${i.field}`).join(", ");
  const rows = all(await db.execute({
    sql: `SELECT p.id, COALESCE(l.business_name, '') AS business_name, ${cols}
            FROM projects p
            LEFT JOIN leads l ON l.id = p.lead_id
           WHERE COALESCE(p.client_status, '') != 'lost'
             AND (? = 0 OR p.id = ?)`,
    args: [projectId || 0, projectId || 0],
  }));
  const gaps: SetupGap[] = [];
  for (const r of rows) {
    for (const item of SETUP_ITEMS) {
      if (Number(r[item.field]) !== 1) {
        gaps.push({ project_id: Number(r.id), business_name: String(r.business_name),
                    field: item.field, label: item.label, title: item.title });
      }
    }
  }
  return gaps;
}

/** Recently closed items, newest first — the "who ticked what" feed. */
export async function listRecentlyResolved(db: Client, days = 14, limit = 60) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  return all(await db.execute({
    sql: `SELECT t.id, t.project_id, t.title, t.completed_at, t.completed_by, t.resolution,
                 COALESCE(l.business_name, '') AS business_name
            FROM project_tasks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN leads l ON l.id = p.lead_id
           WHERE t.completed = 1 AND t.completed_at >= ?
           ORDER BY t.completed_at DESC LIMIT ?`,
    args: [since, limit],
  }));
}

export interface CardSummary {
  /** Open tasks plus unticked setup pills. */
  open: number;
  /** The single thing most in the way, for one line on the card. */
  top: { title: string; waiting_on: string; blocked: boolean; kind: "task" | "setup" } | null;
}

/**
 * Per-project count and top item for the cards. A real, client-specific item wins
 * the top line over an unticked pill, and a pill wins over a generic checklist
 * step — "Business Profile suspended, waiting on Google" says far more than
 * "Final revisions".
 */
export async function outstandingByProject(db: Client): Promise<Map<number, CardSummary>> {
  const [tasks, gaps] = await Promise.all([listOutstanding(db), listSetupGaps(db)]);
  const out = new Map<number, CardSummary & { best?: OutstandingTask }>();
  const entry = (pid: number) => {
    let e = out.get(pid);
    if (!e) { e = { open: 0, top: null }; out.set(pid, e); }
    return e;
  };

  for (const t of tasks) {
    const e = entry(t.project_id);
    e.open++;
    if (!t.template && (!e.best || byImportance(t, e.best) < 0)) e.best = t;
  }
  const firstGap = new Map<number, SetupGap>();
  for (const g of gaps) {
    entry(g.project_id).open++;
    if (!firstGap.has(g.project_id)) firstGap.set(g.project_id, g);
  }
  for (const t of tasks) {
    const e = entry(t.project_id);
    if (!e.best && !firstGap.has(t.project_id) && t.template && !e.top) {
      e.top = { title: t.title, waiting_on: t.waiting_on, blocked: t.blocked, kind: "task" };
    }
  }
  for (const [pid, e] of out) {
    if (e.best) {
      e.top = { title: e.best.title, waiting_on: e.best.waiting_on, blocked: e.best.blocked, kind: "task" };
    } else if (firstGap.has(pid)) {
      const g = firstGap.get(pid)!;
      e.top = { title: `${g.label} not done`, waiting_on: "", blocked: false, kind: "setup" };
    }
    delete e.best;
  }
  return out;
}
