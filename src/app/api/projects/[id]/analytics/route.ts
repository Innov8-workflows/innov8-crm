import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import crypto from "crypto";

// GET — returns analytics for a project. Lazily generates a tracking_id if missing.
// Period via ?days=30 (default 30, max 365)
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 30));
  const db = getClient();

  // Ensure tracking_id exists
  const project = first(await db.execute({
    sql: "SELECT id, tracking_id FROM projects WHERE id = ?",
    args: [projectId],
  }));
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  let trackingId = project.tracking_id as string;
  if (!trackingId) {
    trackingId = "proj_" + crypto.randomBytes(6).toString("hex");
    await db.execute({
      sql: "UPDATE projects SET tracking_id = ? WHERE id = ?",
      args: [trackingId, projectId],
    });
  }

  // Aggregate counts by event_type for the period (single CASE/WHEN)
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const stats = first(await db.execute({
    sql: `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) as page_views,
      SUM(CASE WHEN event_type = 'call_click' THEN 1 ELSE 0 END) as calls,
      SUM(CASE WHEN event_type = 'whatsapp_click' THEN 1 ELSE 0 END) as whatsapps,
      SUM(CASE WHEN event_type = 'messenger_click' THEN 1 ELSE 0 END) as messengers,
      SUM(CASE WHEN event_type = 'email_click' THEN 1 ELSE 0 END) as emails,
      SUM(CASE WHEN event_type = 'map_click' THEN 1 ELSE 0 END) as maps,
      SUM(CASE WHEN event_type = 'social_click' THEN 1 ELSE 0 END) as socials,
      SUM(CASE WHEN event_type = 'booking_click' THEN 1 ELSE 0 END) as bookings,
      SUM(CASE WHEN event_type = 'form_submit' THEN 1 ELSE 0 END) as forms,
      COUNT(DISTINCT ip_hash) as unique_visitors
    FROM site_events WHERE project_id = ? AND created_at >= ?`,
    args: [projectId, cutoff],
  }));

  // Daily breakdown for sparkline. LIMIT cap protects us if days param ever
  // explodes via querystring tampering or future config changes — max 366 days.
  const daily = all(await db.execute({
    sql: `SELECT date(created_at) as day, COUNT(*) as total,
            SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) as page_views
          FROM site_events WHERE project_id = ? AND created_at >= ?
          GROUP BY date(created_at) ORDER BY day ASC LIMIT 366`,
    args: [projectId, cutoff],
  }));

  return NextResponse.json({
    tracking_id: trackingId,
    period_days: days,
    total: Number(stats?.total) || 0,
    unique_visitors: Number(stats?.unique_visitors) || 0,
    page_views: Number(stats?.page_views) || 0,
    calls: Number(stats?.calls) || 0,
    whatsapps: Number(stats?.whatsapps) || 0,
    messengers: Number(stats?.messengers) || 0,
    emails: Number(stats?.emails) || 0,
    maps: Number(stats?.maps) || 0,
    socials: Number(stats?.socials) || 0,
    bookings: Number(stats?.bookings) || 0,
    forms: Number(stats?.forms) || 0,
    daily: daily.map((d) => ({ day: d.day, total: Number(d.total), page_views: Number(d.page_views) })),
  }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
