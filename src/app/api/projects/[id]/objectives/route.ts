import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { isValidPeriod, prevPeriod } from "@/lib/clientReporting";
import { OBJECTIVE_METRICS } from "@/types";

// Per-client monthly objectives. Actuals for auto metrics are resolved in
// /api/projects/[id]/client-dashboard via getObjectivesWithActuals — this route
// is plain CRUD over the stored definitions.

const VALID_METRICS = new Set(OBJECTIVE_METRICS.map((m) => m.value as string));
const VALID_STATUS = new Set(["open", "done", "carried", "dropped"]);

// GET ?period=YYYY-MM → that month's objectives plus standing ones (period = '')
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const period = request.nextUrl.searchParams.get("period") || "";
  const db = getClient();
  const rows = all(await db.execute({
    sql: `SELECT * FROM client_objectives
          WHERE project_id = ? AND (? = '' OR period = ? OR period = '')
          ORDER BY sort_order ASC, id ASC`,
    args: [projectId, period, period],
  }));
  return NextResponse.json({ objectives: rows }, { headers: { "Cache-Control": "private, no-store" } });
}

// POST { period, title, detail?, metric?, target?, manual_value? }
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  const body = await request.json();
  const title = String(body.title || "").trim().slice(0, 300);
  if (!projectId || !title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const period = String(body.period || "");
  if (period && !isValidPeriod(period)) return NextResponse.json({ error: "bad period" }, { status: 400 });
  const metric = VALID_METRICS.has(body.metric) ? body.metric : "manual";

  const db = getClient();
  const now = new Date().toISOString();
  const maxOrder = first(await db.execute({
    sql: "SELECT COALESCE(MAX(sort_order), 0) AS v FROM client_objectives WHERE project_id = ?",
    args: [projectId],
  }));

  const res = await db.execute({
    sql: `INSERT INTO client_objectives
            (project_id, period, title, detail, metric, target, manual_value, status, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    args: [
      projectId, period, title, String(body.detail || "").slice(0, 1000), metric,
      Number(body.target) || 0, Number(body.manual_value) || 0,
      (Number(maxOrder?.v) || 0) + 1, now, now,
    ],
  });

  const row = first(await db.execute({ sql: "SELECT * FROM client_objectives WHERE id = ?", args: [res.lastInsertRowid!] }));
  return NextResponse.json(row, { status: 201 });
}

// PUT { id, ...fields }
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  const body = await request.json();
  const objectiveId = Number(body.id);
  if (!projectId || !objectiveId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: string[] = [];
  const args: (string | number)[] = [];
  const push = (col: string, val: string | number) => { updates.push(`${col} = ?`); args.push(val); };

  if (body.title !== undefined) push("title", String(body.title).trim().slice(0, 300));
  if (body.detail !== undefined) push("detail", String(body.detail).slice(0, 1000));
  if (body.metric !== undefined && VALID_METRICS.has(body.metric)) push("metric", body.metric);
  if (body.target !== undefined) push("target", Number(body.target) || 0);
  if (body.manual_value !== undefined) push("manual_value", Number(body.manual_value) || 0);
  if (body.sort_order !== undefined) push("sort_order", Number(body.sort_order) || 0);
  if (body.period !== undefined && (body.period === "" || isValidPeriod(body.period))) push("period", body.period);
  if (body.status !== undefined && VALID_STATUS.has(body.status)) {
    push("status", body.status);
    push("completed_at", body.status === "done" ? new Date().toISOString() : "");
  }
  if (updates.length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  push("updated_at", new Date().toISOString());
  args.push(objectiveId, projectId);

  const db = getClient();
  await db.execute({
    sql: `UPDATE client_objectives SET ${updates.join(", ")} WHERE id = ? AND project_id = ?`,
    args,
  });
  const row = first(await db.execute({ sql: "SELECT * FROM client_objectives WHERE id = ?", args: [objectiveId] }));
  return NextResponse.json(row);
}

// DELETE ?objective_id=N  ·  DELETE ?carry_forward_to=YYYY-MM (copies last
// month's still-open objectives into the target month)
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  const objectiveId = Number(request.nextUrl.searchParams.get("objective_id"));
  if (!projectId || !objectiveId) return NextResponse.json({ error: "objective_id required" }, { status: 400 });

  const db = getClient();
  await db.execute({ sql: "DELETE FROM client_objectives WHERE id = ? AND project_id = ?", args: [objectiveId, projectId] });
  return NextResponse.json({ ok: true });
}

// PATCH { to: 'YYYY-MM' } — copy the previous month's open objectives forward,
// marking the originals 'carried' so the roll-forward is recorded rather than
// silently duplicated. Skips titles that already exist in the target month.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  const body = await request.json();
  const to = String(body.to || "");
  if (!projectId || !isValidPeriod(to)) return NextResponse.json({ error: "bad target period" }, { status: 400 });

  const from = prevPeriod(to);
  const db = getClient();

  const [source, existing] = await Promise.all([
    db.execute({
      sql: "SELECT * FROM client_objectives WHERE project_id = ? AND period = ? AND status = 'open' ORDER BY sort_order ASC",
      args: [projectId, from],
    }).then(all),
    db.execute({
      sql: "SELECT lower(title) AS t FROM client_objectives WHERE project_id = ? AND period = ?",
      args: [projectId, to],
    }).then(all),
  ]);

  const taken = new Set(existing.map((r) => String(r.t)));
  const now = new Date().toISOString();
  let copied = 0;

  for (const o of source) {
    const title = String(o.title || "");
    if (taken.has(title.toLowerCase())) continue;
    await db.execute({
      sql: `INSERT INTO client_objectives
              (project_id, period, title, detail, metric, target, manual_value, status, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, 'open', ?, ?, ?)`,
      args: [projectId, to, title, String(o.detail || ""), String(o.metric || "manual"),
             Number(o.target) || 0, Number(o.sort_order) || 0, now, now],
    });
    await db.execute({
      sql: "UPDATE client_objectives SET status = 'carried', updated_at = ? WHERE id = ?",
      args: [now, Number(o.id)],
    });
    copied++;
  }

  return NextResponse.json({ ok: true, copied, from, to });
}
