import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLeadStats, getClientStats, getProductRollup, getCallRollup } from "@/lib/statsQueries";
import { getClientLeadRollup } from "@/lib/clientReporting";

// GET /api/bootstrap?owner= — everything the app shell + default Prospects view
// need on first paint, in ONE request. Replaces the 8-10 separate fetches
// (auth/me, users ×2, columns, custom-fields, product-rollup, leads/stats,
// clients/stats, projects?count, todos?count) that used to fire on load: one
// lambda invocation, one initDb gate, and every query below runs in parallel
// against the DB — wall time ≈ the slowest single aggregate instead of the sum.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await initDb();
  const db = getClient();
  const owner = request.nextUrl.searchParams.get("owner");

  const [
    usersRes,
    columnsRes,
    fieldsRes,
    productRollup,
    callRollup,
    clientLeadRollup,
    leadStats,
    clientStats,
    projectCountRes,
    todoCountRes,
  ] = await Promise.all([
    db.execute("SELECT username FROM users ORDER BY username ASC"),
    db.execute("SELECT * FROM column_config ORDER BY sort_order ASC"),
    // Scoped: empty values render identically to missing ones, so don't ship them.
    db.execute("SELECT lead_id, field_id, value FROM custom_field_values WHERE value != '' AND value IS NOT NULL"),
    getProductRollup(db),
    getCallRollup(db),
    getClientLeadRollup(db),
    getLeadStats(db, owner),
    // Nav-badge counts are global (the shell never passes an owner to them).
    getClientStats(db, null),
    db.execute("SELECT COUNT(*) as count FROM projects WHERE completed_at = ''"),
    db.execute("SELECT COUNT(*) as count FROM todos WHERE done = 0"),
  ]);

  // Nested map — same shape LeadGrid builds client-side, minus the JSON overhead
  // of repeating column names per row.
  const customFields: Record<string, Record<string, string>> = {};
  for (const row of all(fieldsRes)) {
    const leadId = String(row.lead_id);
    if (!customFields[leadId]) customFields[leadId] = {};
    customFields[leadId][String(row.field_id)] = String(row.value);
  }

  return NextResponse.json({
    me: { username: session.username },
    users: all(usersRes).map((r) => r.username as string),
    columns: all(columnsRes),
    customFields,
    productRollup,
    callRollup,
    clientLeadRollup,
    leadStats,
    counts: {
      clients: clientStats.clientCount,
      projects: Number(first(projectCountRes)?.count) || 0,
      todos: Number(first(todoCountRes)?.count) || 0,
    },
  }, {
    // Contains hot-write stats (product-driven money) — never serve stale.
    headers: { "Cache-Control": "private, no-store" },
  });
}
