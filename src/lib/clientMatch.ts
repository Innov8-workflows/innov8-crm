import type { Client } from "@libsql/client";
import { all } from "@/lib/db";

// Finding a client from a name Claude was given. Shared by the agent routes so
// "which client is this?" has one answer everywhere.

export const normName = (s: string) =>
  s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[^a-z0-9]/g, "");

export interface ProjectRef { id: number; name: string; domain: string; stage: string }

/** Every client that isn't marked lost. */
export async function allClients(db: Client): Promise<ProjectRef[]> {
  return all(await db.execute(
    `SELECT p.id, COALESCE(l.business_name, '') AS name, COALESCE(p.domain, '') AS domain,
            CASE WHEN p.completed_at != '' THEN 'live' ELSE p.stage END AS stage
       FROM projects p LEFT JOIN leads l ON l.id = p.lead_id
      WHERE COALESCE(p.client_status, '') != 'lost'
      ORDER BY l.business_name`,
  )).map((r) => ({ id: Number(r.id), name: String(r.name), domain: String(r.domain), stage: String(r.stage) }));
}

/**
 * Exact match on name or domain first, then (unless exactOnly) substring;
 * never a guess — two matches return the candidates instead of a pick.
 */
export function findClient(clients: ProjectRef[], q: string, exactOnly = false): { match?: ProjectRef; candidates: ProjectRef[] } {
  const n = normName(q);
  if (!n) return { candidates: [] };
  const exact = clients.filter((c) => normName(c.name) === n || (c.domain && normName(c.domain) === n));
  if (exact.length === 1) return { match: exact[0], candidates: exact };
  if (exact.length > 1 || exactOnly) return { candidates: exact };
  // A client with no name must not match everything ("x".includes("") is true).
  const partial = clients.filter((c) => {
    const cn = normName(c.name);
    return (cn && (cn.includes(n) || n.includes(cn))) || (c.domain && normName(c.domain).includes(n));
  });
  return partial.length === 1 ? { match: partial[0], candidates: partial } : { candidates: partial };
}
