import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import {
  addTask, updateTask, completeTask, reopenTask, listOutstanding, listSetupGaps,
  listRecentlyResolved, TaskError, type TaskInput,
} from "@/lib/tasks";

// Session-guarded (not in PUBLIC_PATHS). Every write goes through src/lib/tasks.ts
// so a tick from here behaves exactly like one from Claude or a site check.

const fail = (e: unknown) => {
  if (e instanceof TaskError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
};

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();

  // The Outstanding dashboard: every open item across clients, every unticked
  // setup pill, and what was recently closed and by whom.
  if (request.nextUrl.searchParams.get("outstanding") === "1") {
    const [tasks, setup, resolved] = await Promise.all([
      listOutstanding(db), listSetupGaps(db), listRecentlyResolved(db),
    ]);
    return NextResponse.json({ tasks, setup, resolved }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });

  const result = await db.execute({
    sql: "SELECT * FROM project_tasks WHERE project_id = ? ORDER BY sort_order ASC",
    args: [Number(projectId)],
  });
  return NextResponse.json({ tasks: all(result) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const body = await request.json();
  if (!body.project_id || !body.title) {
    return NextResponse.json({ error: "project_id and title required" }, { status: 400 });
  }
  try {
    const task = await addTask(db, Number(body.project_id), body as TaskInput, "jay");
    return NextResponse.json(task, { status: 201 });
  } catch (e) { return fail(e); }
}

export async function PUT(request: NextRequest) {
  await initDb();
  const db = getClient();
  const body = await request.json();
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const { completed, resolution, ...rest } = body as TaskInput & {
      id: number; completed?: boolean | number; resolution?: string;
    };
    delete (rest as { id?: number }).id;
    let task = Object.keys(rest).length ? await updateTask(db, id, rest) : null;
    if (completed !== undefined) {
      task = completed
        ? (await completeTask(db, id, { by: "jay", resolution })).task
        : (await reopenTask(db, id)).task;
    }
    if (!task) return NextResponse.json({ error: "No fields" }, { status: 400 });
    return NextResponse.json(task);
  } catch (e) { return fail(e); }
}

export async function DELETE(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // A task something else is waiting on would leave its dependants pointing at
  // nothing, so release them first.
  await db.batch([
    { sql: "UPDATE project_tasks SET blocked_by = 0 WHERE blocked_by = ?", args: [id] },
    { sql: "DELETE FROM project_tasks WHERE id = ?", args: [id] },
  ], "write");
  return NextResponse.json({ ok: true });
}
