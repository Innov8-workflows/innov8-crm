import type { Client } from "@libsql/client";
import { all } from "@/lib/db";

// Deleting a prospect, used by the grid's bin icon and by "Delete selected".
//
// activities, lead_notes and email_logs reference leads(id) WITHOUT ON DELETE
// CASCADE, so a bare `DELETE FROM leads` fails with a foreign key error on any
// lead that has a note or a timeline entry, which every website enquiry has.
// The grid had already hidden the row, so the lead came back on refresh.
// This clears the lead's own history first, in one write batch, so it either
// all goes or none of it does.
//
// A lead with a project is a client: its project, files, reports and leads hang
// off projects(lead_id). Those are never removed from here; they are reported
// back as `blocked` so the client is deleted from Projects / Live Clients instead.

export async function deleteLeads(db: Client, rawIds: unknown[]) {
  const ids = [...new Set(rawIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return { deleted: [] as number[], blocked: [] as { id: number; business_name: string }[] };

  const ph = (n: number) => Array(n).fill("?").join(",");
  const blocked = all(await db.execute({
    sql: `SELECT l.id, l.business_name FROM leads l JOIN projects p ON p.lead_id = l.id WHERE l.id IN (${ph(ids.length)})`,
    args: ids,
  })).map((r) => ({ id: Number(r.id), business_name: String(r.business_name ?? "") }));

  const blockedIds = new Set(blocked.map((b) => b.id));
  const deleted = ids.filter((id) => !blockedIds.has(id));
  if (deleted.length) {
    const p = ph(deleted.length);
    await db.batch([
      { sql: `DELETE FROM activities WHERE lead_id IN (${p})`, args: deleted },
      { sql: `DELETE FROM lead_notes WHERE lead_id IN (${p})`, args: deleted },
      { sql: `DELETE FROM call_logs WHERE lead_id IN (${p})`, args: deleted },
      { sql: `DELETE FROM custom_field_values WHERE lead_id IN (${p})`, args: deleted },
      { sql: `DELETE FROM lead_seo_reports WHERE lead_id IN (${p})`, args: deleted },
      { sql: `DELETE FROM entity_solutions WHERE entity_type = 'lead' AND entity_id IN (${p})`, args: deleted },
      // Keep the Gmail log itself; it just stops pointing at the deleted lead.
      { sql: `UPDATE email_logs SET lead_id = NULL, matched = 0 WHERE lead_id IN (${p})`, args: deleted },
      { sql: `DELETE FROM leads WHERE id IN (${p})`, args: deleted },
    ], "write");
  }
  return { deleted, blocked };
}

/** "Can't delete X: it's a client. Delete it from Projects first." */
export function blockedMessage(blocked: { business_name: string }[]) {
  const names = blocked.map((b) => b.business_name || "this lead").join(", ");
  return `${names} ${blocked.length === 1 ? "is a client" : "are clients"} (has a project), so not deleted. Delete from Projects first.`;
}
