import type { Client } from "@libsql/client";
import { all } from "@/lib/db";

// The SECURITY PASS / SECURITY FAIL label on the Projects and Live Clients cards.
//
// A pass is a row in security_certificates (a live scan with S1 0 and every S2
// fixed or accepted, with its PDF). A fail is a row in security_failures (a live
// scan that did not pass, with its redacted findings). Per host the NEWEST result
// wins, so fixing the site and re-scanning flips the label back. A client with
// several hosts (main site + ad page) shows FAIL while any host's latest is a fail.
//
// Cached on projects.security_cache like seo_cache (see projectCache.ts):
//   '' = unknown (compute me) · '{}' = never scanned · else SecurityStatus JSON.
// Every write site (agent POST, certificate/failure DELETE) recomputes it.

export interface SecurityStatus { r?: "pass" | "fail"; d?: string; h?: string; s1?: number; s2?: number; hosts?: number }

export async function computeAndStoreSecurity(db: Client, projectId: number): Promise<SecurityStatus> {
  // Narrow columns only: security_certificates.pdf is its LAST column and is never read here.
  const rows = all(await db.execute({
    sql: `SELECT 'pass' AS r, host, scanned_at, s1, s2 FROM security_certificates WHERE project_id = ?
          UNION ALL
          SELECT 'fail' AS r, host, scanned_at, s1, s2 FROM security_failures WHERE project_id = ?`,
    args: [projectId, projectId],
  }));
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const h = String(row.host);
    const cur = latest.get(h);
    // Same timestamp on both sides: the pass wins (the certificate is posted after its scan).
    if (!cur || String(row.scanned_at) > String(cur.scanned_at) || (String(row.scanned_at) === String(cur.scanned_at) && row.r === "pass")) latest.set(h, row);
  }
  let status: SecurityStatus = {};
  if (latest.size) {
    const list = [...latest.values()];
    const fails = list.filter((x) => x.r === "fail").sort((a, b) => String(b.scanned_at).localeCompare(String(a.scanned_at)));
    const pick = fails[0] || list.sort((a, b) => String(b.scanned_at).localeCompare(String(a.scanned_at)))[0];
    status = { r: fails.length ? "fail" : "pass", d: String(pick.scanned_at), h: String(pick.host), s1: Number(pick.s1) || 0, s2: Number(pick.s2) || 0, hosts: latest.size };
  }
  await db.execute({ sql: "UPDATE projects SET security_cache = ? WHERE id = ?", args: [JSON.stringify(status), projectId] });
  return status;
}

export function parseSecurityCache(raw: unknown): SecurityStatus | null {
  if (typeof raw !== "string" || raw === "") return null;
  try { return JSON.parse(raw) as SecurityStatus; } catch { return null; }
}

/* Defence in depth for stored findings: the skill already masks values, but mask
   anything key-shaped again before it is written, so a scanner bug can never park a
   live secret in the CRM. */
const KEYISH = /\b(lk_[A-Za-z0-9]{12,}|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}|gh[posu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|EAA[A-Za-z0-9]{40,}|xox[abpr]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{12,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})/g;
export const maskKeys = (s: string) => s.replace(KEYISH, (m) => m.slice(0, 4) + "…(" + m.length + ")");
