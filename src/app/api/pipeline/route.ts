import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { clientPipelines, PIPELINE_STEPS, STEP_IDS, MARK_STATUSES } from "@/lib/pipeline";

// The website pipeline for the Info view and the client cards. Session-guarded
// by the middleware; Claude marks steps through /api/info-agent instead.

const NO_STORE = { "Cache-Control": "private, no-store" };
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** GET — the steps and every client's progress. */
export async function GET() {
  await initDb();
  const clients = await clientPipelines(getClient());
  return NextResponse.json({ steps: PIPELINE_STEPS, clients }, { headers: NO_STORE });
}

/** PUT { project_id, step, status: "done"|"na"|"todo"|null, note? } — null clears Jay's/Claude's mark. */
export async function PUT(request: NextRequest) {
  let b: { project_id?: number; step?: string; status?: string | null; note?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const pid = Number(b.project_id || 0);
  const step = String(b.step || "");
  if (!pid || !STEP_IDS.has(step)) return NextResponse.json({ error: "project_id and a valid step required" }, { status: 400 });
  await initDb();
  const db = getClient();
  if (b.status === null || b.status === undefined || b.status === "") {
    await db.execute({ sql: "DELETE FROM pipeline_marks WHERE project_id = ? AND step = ?", args: [pid, step] });
  } else {
    if (!(MARK_STATUSES as readonly string[]).includes(b.status)) {
      return NextResponse.json({ error: `status must be one of ${MARK_STATUSES.join(", ")} or null` }, { status: 400 });
    }
    await db.execute({
      sql: `INSERT INTO pipeline_marks (project_id, step, status, marked_by, note, at) VALUES (?, ?, ?, 'jay', ?, ?)
            ON CONFLICT(project_id, step) DO UPDATE SET status = excluded.status, marked_by = 'jay',
              note = excluded.note, at = excluded.at`,
      args: [pid, step, b.status, String(b.note || "").slice(0, 300), now()],
    });
  }
  const [client] = await clientPipelines(db, pid);
  return NextResponse.json({ ok: true, client }, { headers: NO_STORE });
}
