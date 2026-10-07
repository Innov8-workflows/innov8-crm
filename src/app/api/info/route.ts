import { NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

// The Info view: skills, scheduled tasks and Claude's tools (synced from Jay's
// PC through /api/info-agent), plus the ERP's own automations with when each
// last actually ran, read from the data they leave behind. Session-guarded.

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  await initDb();
  const db = getClient();
  const [items, synced, brief, health, lead, quiet, alert] = await Promise.all([
    db.execute("SELECT kind, item_key, title, category, sort, description, use_when, next_key, replaced_by, extra_json, updated_at FROM info_items ORDER BY kind, sort, title").then(all),
    db.execute("SELECT value FROM app_meta WHERE key = 'info_synced_at'").then(first),
    db.execute("SELECT brief_date, received_at, item_count FROM brief_runs ORDER BY brief_date DESC LIMIT 1").then(first),
    db.execute("SELECT MAX(health_checked_at) AS at, SUM(CASE WHEN health_status = 'down' THEN 1 ELSE 0 END) AS down FROM projects WHERE health_checked_at != ''").then(first),
    db.execute("SELECT MAX(received_at) AS at, COUNT(*) AS week FROM client_leads WHERE entry_mode = 'live' AND received_at >= datetime('now', '-7 days')").then(first),
    // Clients whose leads have stopped: had one in the last 60 days, none in the last 14.
    db.execute(`SELECT COALESCE(l.business_name, '') AS name, MAX(c.received_at) AS last_at
                  FROM client_leads c JOIN projects p ON p.id = c.project_id LEFT JOIN leads l ON l.id = p.lead_id
                 WHERE c.entry_mode = 'live' AND c.received_at >= datetime('now', '-60 days')
                 GROUP BY c.project_id HAVING MAX(c.received_at) < datetime('now', '-14 days')
                 ORDER BY last_at`).then(all),
    db.execute("SELECT MAX(notified_at) AS at FROM onboarding_submissions WHERE notified_at != ''").then(first),
  ]);

  const parse = (s: unknown) => { try { return JSON.parse(String(s || "{}")); } catch { return {}; } };
  const shape = (r: Record<string, unknown>) => ({
    key: String(r.item_key), title: String(r.title), category: String(r.category), sort: Number(r.sort),
    description: String(r.description), use_when: String(r.use_when), next: String(r.next_key),
    replaced_by: String(r.replaced_by), extra: parse(r.extra_json), updated_at: String(r.updated_at),
  });

  // Built into the ERP and its hosting, so always listed; the Claude scheduled
  // tasks from the PC follow under `scheduled`.
  const automations = [
    {
      name: "Morning brief", where: "Claude app on your PC", schedule: "Daily ~08:10 (runs when the app next opens if it was closed)",
      last_at: brief ? String(brief.received_at) : "",
      detail: brief ? `Last brief ${brief.brief_date}, ${brief.item_count} items` : "No brief received yet",
    },
    {
      name: "Site health check", where: "GitHub Actions → /api/health/check", schedule: "Daily 06:17 UTC",
      last_at: String(health?.at || ""),
      detail: Number(health?.down) ? `${health?.down} site(s) down at the last check` : "All checked sites up at the last check",
    },
    {
      name: "Client website leads", where: "Each client's Apps Script → CRM", schedule: "As leads arrive",
      last_at: String(lead?.at || ""),
      detail: `${Number(lead?.week) || 0} leads in the last 7 days` +
        (quiet.length ? ` · gone quiet (none in 14 days): ${quiet.map((q) => q.name).join(", ")}` : ""),
    },
    {
      name: "Onboarding alert emails", where: "CRM → Resend", schedule: "When a client submits a form",
      last_at: String(alert?.at || ""), detail: "Emails you when an onboarding form is submitted",
    },
    {
      name: "Uptime monitoring", where: "UptimeRobot", schedule: "Every 5 minutes",
      last_at: "", detail: "Live status on the Site Health tab",
    },
  ];

  return NextResponse.json({
    synced_at: synced ? String(synced.value) : "",
    skills: items.filter((r) => r.kind === "skill").map(shape),
    scheduled: items.filter((r) => r.kind === "scheduled").map(shape),
    tools: items.filter((r) => r.kind === "tool").map(shape),
    automations,
  }, { headers: NO_STORE });
}
