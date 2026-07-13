import type { Client } from "@libsql/client";
import { all, first } from "@/lib/db";

// Lazily-computed per-project caches stored on the narrow projects table.
//
// Why: project_files.url and seo_reports.report_url hold multi-MB base64 blobs,
// and SQLite stores each row's columns sequentially — every metadata column
// (file_type, is_cover, created_at, score, logged_at…) sits AFTER the blob, so
// reading it means walking the blob's overflow-page chain. The old list-endpoint
// window queries scanned both tables and took ~30s on prod. Each helper below
// still pays that walk, but for ONE project, ONCE — the result persists to
// projects.cover_file_id / projects.seo_cache and the hot path never scans again.
//
// Conventions:
//   cover_file_id: NULL = unknown (compute me) · 0 = no cover · >0 = file id
//   seo_cache:     '' = unknown · '{}' = no reports · else {"s":8.5,"p":7.9,"d":"…"}

export async function computeAndStoreCover(db: Client, projectId: number): Promise<number> {
  const row = first(await db.execute({
    sql: `SELECT id FROM project_files
          WHERE project_id = ? AND (file_type LIKE 'image/%' OR url LIKE 'data:image/%' OR is_cover = 1)
          ORDER BY is_cover DESC, created_at ASC
          LIMIT 1`,
    args: [projectId],
  }));
  const coverId = row ? Number(row.id) : 0;
  await db.execute({ sql: "UPDATE projects SET cover_file_id = ? WHERE id = ?", args: [coverId, projectId] });
  return coverId;
}

export interface SeoCache { s?: number; p?: number; d?: string }

export async function computeAndStoreSeo(db: Client, projectId: number): Promise<SeoCache> {
  const rows = all(await db.execute({
    sql: "SELECT score, logged_at FROM seo_reports WHERE project_id = ? ORDER BY logged_at DESC, id DESC LIMIT 2",
    args: [projectId],
  }));
  const cache: SeoCache = rows.length
    ? { s: Number(rows[0].score), d: String(rows[0].logged_at), ...(rows[1] ? { p: Number(rows[1].score) } : {}) }
    : {};
  await db.execute({ sql: "UPDATE projects SET seo_cache = ? WHERE id = ?", args: [JSON.stringify(cache), projectId] });
  return cache;
}

export function parseSeoCache(raw: unknown): SeoCache | null {
  if (typeof raw !== "string" || raw === "") return null; // unknown → compute
  try { return JSON.parse(raw) as SeoCache; } catch { return null; }
}
