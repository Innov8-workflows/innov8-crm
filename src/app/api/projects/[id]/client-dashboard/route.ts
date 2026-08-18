import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import {
  monthRange, prevPeriod, currentPeriod, isValidPeriod,
  getLeadCounts, getLeadTotal, getSiteMetrics, getSeoSnapshot, getObjectivesWithActuals,
} from "@/lib/clientReporting";

// Everything the Client Dashboard needs for one client and one calendar month,
// in ONE request — same shape of consolidation as /api/bootstrap. Calendar-month
// bounded with a previous-month comparison, neither of which the rolling-window
// /api/projects/[id]/analytics can express.
export const maxDuration = 30;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await context.params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const period = request.nextUrl.searchParams.get("period") || currentPeriod();
  if (!isValidPeriod(period)) return NextResponse.json({ error: "bad period" }, { status: 400 });

  const db = getClient();
  const range = monthRange(period);
  const prev = monthRange(prevPeriod(period));

  // Explicit column list — this feeds a client-facing report, so no SELECT p.*
  // that could carry monthly_fee / login_details / project_notes along with it.
  const project = first(await db.execute({
    sql: `SELECT p.id, p.lead_id, p.domain, p.tracking_id, p.last_seo_date,
                 l.business_name, l.contact_name, l.email, l.phone, l.location
          FROM projects p JOIN leads l ON p.lead_id = l.id WHERE p.id = ?`,
    args: [projectId],
  }));
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [leads, prevLeads, site, prevSite, seo, recent, report] = await Promise.all([
    getLeadCounts(db, projectId, range),
    getLeadTotal(db, projectId, prev),
    getSiteMetrics(db, projectId, range),
    getSiteMetrics(db, projectId, prev),
    getSeoSnapshot(db, projectId, range),
    db.execute({
      sql: `SELECT id, received_at, name, email, phone, message, source, form_name, page_url, status, entry_mode
            FROM client_leads
            WHERE project_id = ? AND received_at >= ? AND received_at < ?
            ORDER BY received_at DESC, id DESC LIMIT 50`,
      args: [projectId, range.start, range.end],
    }).then(all),
    db.execute({
      sql: `SELECT id, period, status, recipient, subject, send_count, error, sent_at, sent_by
            FROM client_reports WHERE project_id = ? AND period = ?`,
      args: [projectId, period],
    }).then(first),
  ]);

  // Objectives need the period's real numbers to resolve their actuals, so they
  // run after the aggregates rather than inside the Promise.all above.
  const objectives = await getObjectivesWithActuals(db, projectId, period, {
    leads, site, seo: seo.score,
  });

  return NextResponse.json({
    project,
    period,
    range,
    leads: {
      total: leads.total,
      prev_total: prevLeads,
      unique_contacts: leads.unique_contacts,
      by_source: leads.by_source,
      daily: leads.daily,
      recent,
    },
    site: {
      ...site,
      prev: {
        page_views: prevSite.page_views,
        unique_visitors: prevSite.unique_visitors,
        interactions: prevSite.interactions,
      },
    },
    seo: { score: seo.score, prev_score: seo.prev, report_date: seo.date, last_seo_date: project.last_seo_date },
    objectives,
    report: report || null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
