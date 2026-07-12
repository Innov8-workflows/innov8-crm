import { createClient, type Client, type ResultSet } from "@libsql/client";

let client: Client | null = null;

export function getClient(): Client {
  if (client) return client;

  const remoteUrl = process.env.TURSO_DATABASE_URL;

  // Embedded replica (opt-in via TURSO_EMBEDDED_REPLICA=1 in Vercel env):
  // libsql keeps a local SQLite copy in the lambda's /tmp and serves ALL reads
  // from it (~0ms instead of the ~200ms/query network floor to the Turso
  // region). Writes still go straight to the remote primary, and the client
  // guarantees read-your-writes within this lambda instance. syncInterval
  // pulls other writers' changes — a single-user CRM tolerates that lag.
  // Cost: the first request on a cold lambda downloads the DB once.
  // Roll back any time by unsetting the env var — no code change needed.
  const useReplica = process.env.TURSO_EMBEDDED_REPLICA === "1" && !!remoteUrl && !!process.env.TURSO_AUTH_TOKEN;

  client = useReplica
    ? createClient({
        url: `file:${process.env.TURSO_REPLICA_PATH || "/tmp/crm-replica.db"}`,
        syncUrl: remoteUrl,
        authToken: process.env.TURSO_AUTH_TOKEN,
        syncInterval: Number(process.env.TURSO_SYNC_INTERVAL || "30"),
      })
    : createClient({
        url: remoteUrl || "file:crm.db",
        authToken: process.env.TURSO_AUTH_TOKEN,
      });

  return client;
}

let dbInitialised = false;
let dbInitPromise: Promise<void> | null = null;

export async function initDb() {
  if (dbInitialised) return;
  if (dbInitPromise) return dbInitPromise;
  dbInitPromise = doInitDb();
  await dbInitPromise;
  dbInitialised = true;
}

async function doInitDb() {
  const db = getClient();

  // Fast cold-start path: once the schema is at the current version, a freshly
  // spun-up lambda does ~2 round-trips here instead of ~35 (the 28 ALTER migrations
  // + index/dedup/seed passes below all skip). On a remote DB each round-trip is
  // ~100-300ms, so this is the single biggest "slow first load" win. Bump
  // SCHEMA_VERSION whenever a migration/index/seed below changes → the heavy block
  // re-runs exactly once on the next deploy, then cold starts go fast again.
  const SCHEMA_VERSION = "2026-07-03-securefile";
  await db.execute("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT DEFAULT '')");
  const schemaMarker = first(await db.execute("SELECT value FROM app_meta WHERE key = 'schema_version'"));
  if (schemaMarker?.value === SCHEMA_VERSION) return;

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_name TEXT NOT NULL,
      contact_name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      business_type TEXT DEFAULT '',
      location TEXT DEFAULT '',
      website_status INTEGER DEFAULT 0,
      emailed INTEGER DEFAULT 0,
      messaged INTEGER DEFAULT 0,
      responded INTEGER DEFAULT 0,
      followed_up INTEGER DEFAULT 0,
      capex REAL,
      notes TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'new',
      follow_up_date TEXT DEFAULT '',
      demo_site_url TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS column_config (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      col_type TEXT DEFAULT 'text',
      visible INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      recipient TEXT NOT NULL,
      subject TEXT DEFAULT '',
      sent_at TEXT NOT NULL,
      gmail_msg_id TEXT UNIQUE NOT NULL,
      matched INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS lead_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS custom_field_values (
      lead_id INTEGER NOT NULL,
      field_id TEXT NOT NULL,
      value TEXT DEFAULT '',
      PRIMARY KEY (lead_id, field_id),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL UNIQUE,
      stage TEXT DEFAULT 'onboarding',
      sort_order INTEGER DEFAULT 0,
      domain TEXT DEFAULT '',
      hosting_info TEXT DEFAULT '',
      monthly_fee REAL DEFAULT 0,
      renewal_date TEXT DEFAULT '',
      login_details TEXT DEFAULT '',
      project_notes TEXT DEFAULT '',
      completed_at TEXT DEFAULT '',
      ga4_embedded INTEGER DEFAULT 0,
      ga4_conversions INTEGER DEFAULT 0,
      search_console_verified INTEGER DEFAULT 0,
      gbp_setup INTEGER DEFAULT 0,
      mobile_optimised INTEGER DEFAULT 0,
      link_card INTEGER DEFAULT 0,
      bing_console INTEGER DEFAULT 0,
      secure_file INTEGER DEFAULT 0,
      google_rating REAL DEFAULT 0,
      google_review_count INTEGER DEFAULT 0,
      facebook_rating REAL DEFAULT 0,
      facebook_review_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS project_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      stage TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      file_type TEXT DEFAULT '',
      size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schedule_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id TEXT NOT NULL,
      date TEXT NOT NULL,
      completed_at TEXT DEFAULT (datetime('now')),
      notes TEXT DEFAULT '',
      UNIQUE(slot_id, date)
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      detail TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium',
      category TEXT DEFAULT 'general',
      done INTEGER DEFAULT 0,
      owner TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS solutions_catalogue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT '',
      target_trades TEXT DEFAULT '',
      upfront_price REAL DEFAULT 0,
      monthly_price REAL DEFAULT 0,
      install_days INTEGER DEFAULT 0,
      pitch_angle TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seo_geo_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      task_ids TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      completed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS seo_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      score REAL DEFAULT 0,
      report_url TEXT DEFAULT '',
      report_name TEXT DEFAULT '',
      report_type TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      logged_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_seo_reports_project ON seo_reports(project_id);

    CREATE TABLE IF NOT EXISTS site_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      path TEXT DEFAULT '',
      referrer TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      ip_hash TEXT DEFAULT '',
      metadata TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS entity_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      solution_id INTEGER NOT NULL,
      status TEXT DEFAULT 'proposed',
      upfront_charged REAL DEFAULT 0,
      monthly_upcharge REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      proposed_at TEXT DEFAULT '',
      sold_at TEXT DEFAULT '',
      delivered_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(entity_type, entity_id, solution_id),
      FOREIGN KEY (solution_id) REFERENCES solutions_catalogue(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);

  const migrations = [
    "ALTER TABLE leads ADD COLUMN sort_order INTEGER DEFAULT 0",
    "ALTER TABLE leads ADD COLUMN status TEXT DEFAULT 'new'",
    "ALTER TABLE leads ADD COLUMN follow_up_date TEXT DEFAULT ''",
    "ALTER TABLE leads ADD COLUMN demo_site_url TEXT DEFAULT ''",
    "ALTER TABLE project_files ADD COLUMN is_cover INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN client_status TEXT DEFAULT 'active'",
    "UPDATE projects SET stage = 'design_content' WHERE stage IN ('design', 'content')",
    "UPDATE project_tasks SET stage = 'design_content' WHERE stage IN ('design', 'content')",
    "ALTER TABLE leads ADD COLUMN owner TEXT DEFAULT ''",
    "ALTER TABLE leads ADD COLUMN stripe_customer_id TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN stripe_price_id TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN invoice_status TEXT DEFAULT 'to_invoice'",
    "ALTER TABLE leads ADD COLUMN lat REAL",
    "ALTER TABLE leads ADD COLUMN lng REAL",
    "ALTER TABLE projects ADD COLUMN tracking_id TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN last_seo_date TEXT DEFAULT ''",
    "ALTER TABLE todos ADD COLUMN category TEXT DEFAULT 'general'",
    "ALTER TABLE projects ADD COLUMN ga4_embedded INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN search_console_verified INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN gbp_setup INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN ga4_conversions INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN mobile_optimised INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN link_card INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN bing_console INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN secure_file INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN google_rating REAL DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN google_review_count INTEGER DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN facebook_rating REAL DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN facebook_review_count INTEGER DEFAULT 0",
    // Retire the 20 generic placeholder solutions in favour of Jay's real product line.
    // Soft-delete (active=0) keeps any historical entity_solutions intact (no FK cascade).
    `UPDATE solutions_catalogue SET active = 0 WHERE name IN (
      'AI Voice Receptionist','WhatsApp Auto-Reply Bot','Review Request Automation','Lead Capture Chatbot',
      'AI Quote Generator from Photos','Online Booking System','Quote Follow-Up Drip','Social Media Auto-Poster',
      'Customer Re-engagement SMS','Stripe + Invoice Reminders','Instagram Reel Generator','Birthday / Loyalty SMS',
      'Custom CRM','Custom Job Management App','Custom Customer Portal','Custom Quote / Estimate Builder',
      'Custom Internal KPI Dashboard','Bespoke AI Workflow Automation','Custom Booking + Resource Scheduler','Custom Branded Mobile PWA'
    )`,
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch { /* column exists */ }
  }

  await db.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(follow_up_date);
    CREATE INDEX IF NOT EXISTS idx_email_logs_lead ON email_logs(lead_id);
    CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
    CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id);
    CREATE INDEX IF NOT EXISTS idx_projects_lead ON projects(lead_id);
    CREATE INDEX IF NOT EXISTS idx_projects_completed ON projects(completed_at);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(client_status);
    CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner);
    CREATE INDEX IF NOT EXISTS idx_leads_business_name ON leads(business_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_leads_business_type ON leads(business_type);
    CREATE INDEX IF NOT EXISTS idx_email_logs_gmail_msg ON email_logs(gmail_msg_id);
    CREATE INDEX IF NOT EXISTS idx_custom_field_values ON custom_field_values(lead_id, field_id);
    CREATE INDEX IF NOT EXISTS idx_leads_lat ON leads(lat);
    CREATE INDEX IF NOT EXISTS idx_entity_solutions_entity ON entity_solutions(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_entity_solutions_solution ON entity_solutions(solution_id);
    CREATE INDEX IF NOT EXISTS idx_entity_solutions_status ON entity_solutions(status);
    CREATE INDEX IF NOT EXISTS idx_custom_field_values_field ON custom_field_values(field_id);
    CREATE INDEX IF NOT EXISTS idx_solutions_active ON solutions_catalogue(active);
    CREATE INDEX IF NOT EXISTS idx_site_events_project ON site_events(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_site_events_type ON site_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_projects_tracking ON projects(tracking_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule_completions(date);
    CREATE INDEX IF NOT EXISTS idx_seo_geo_project ON seo_geo_logs(project_id, completed_at);
    CREATE INDEX IF NOT EXISTS idx_leads_sort ON leads(sort_order);
    CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order);
    CREATE INDEX IF NOT EXISTS idx_leads_location ON leads(location);
    CREATE INDEX IF NOT EXISTS idx_email_logs_sent ON email_logs(sent_at);
    CREATE INDEX IF NOT EXISTS idx_activities_lead_created ON activities(lead_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_created ON lead_notes(lead_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_todos_done_created ON todos(done, created_at);
    CREATE INDEX IF NOT EXISTS idx_site_events_created ON site_events(created_at);
  `);

  // Clean up any duplicate solutions left behind by the previous buggy seed check.
  // Must run BEFORE the unique index gets created and BEFORE seeding new entries.
  await dedupSolutionsCatalogue(db);

  // After dedup, enforce uniqueness on name to prevent any future duplicates.
  try {
    await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_solutions_catalogue_name ON solutions_catalogue(name)");
  } catch (e) {
    // Index creation can fail if dedup somehow missed something — log and continue
    console.error("Failed to create unique index on solutions_catalogue.name:", e);
  }

  // Seed the solutions catalogue (idempotent — adds missing names, leaves existing untouched)
  await seedSolutionsCatalogue(db);

  // One-time: convert existing manual amounts into base product line items so the
  // now product-driven dashboard carries current totals forward. Must run AFTER
  // the catalogue seed (needs the "website" base product to exist).
  await migrateBaseProductLineItems(db);

  // Mark the schema current so subsequent cold starts take the fast path at the top.
  await db.execute({ sql: "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)", args: [SCHEMA_VERSION] });
}

// Module-level flag — dedup runs once per lambda lifetime
let dedupRan = false;

// One-time cleanup of duplicate solutions_catalogue rows.
// For each name with duplicates: keeps the row with the MIN(id), repoints any
// entity_solutions referencing duplicates to the canonical id, and deletes
// the duplicate catalogue rows. Safe to run repeatedly — no-op when clean.
async function dedupSolutionsCatalogue(db: Client) {
  if (dedupRan) return;
  try {
    const dupRes = await db.execute(`
      SELECT name, MIN(id) as canonical_id, COUNT(*) as cnt
      FROM solutions_catalogue
      GROUP BY name
      HAVING cnt > 1
    `);
    const duplicates = all(dupRes);
    if (duplicates.length === 0) {
      dedupRan = true;
      return;
    }

    let removed = 0;
    for (const dup of duplicates) {
      const name = dup.name as string;
      const canonicalId = dup.canonical_id as number;

      // All non-canonical IDs for this name
      const idsRes = await db.execute({
        sql: "SELECT id FROM solutions_catalogue WHERE name = ? AND id != ?",
        args: [name, canonicalId],
      });
      const dupIds = all(idsRes).map((r) => r.id as number);
      if (dupIds.length === 0) continue;

      // For each entity_solution row pointing to a duplicate id, decide:
      //   - canonical row already exists for this entity → DELETE the duplicate row
      //   - else → UPDATE to point at canonical
      // This avoids violating the UNIQUE(entity_type, entity_id, solution_id) constraint.
      for (const dupId of dupIds) {
        const esRows = all(await db.execute({
          sql: "SELECT id, entity_type, entity_id FROM entity_solutions WHERE solution_id = ?",
          args: [dupId],
        }));

        for (const es of esRows) {
          const conflict = all(await db.execute({
            sql: "SELECT id FROM entity_solutions WHERE entity_type = ? AND entity_id = ? AND solution_id = ?",
            args: [es.entity_type as string, es.entity_id as number, canonicalId],
          }));

          if (conflict.length > 0) {
            await db.execute({ sql: "DELETE FROM entity_solutions WHERE id = ?", args: [es.id as number] });
          } else {
            await db.execute({
              sql: "UPDATE entity_solutions SET solution_id = ? WHERE id = ?",
              args: [canonicalId, es.id as number],
            });
          }
        }
      }

      // Now delete the duplicate catalogue rows
      const placeholders = dupIds.map(() => "?").join(",");
      const result = await db.execute({
        sql: `DELETE FROM solutions_catalogue WHERE id IN (${placeholders})`,
        args: dupIds,
      });
      removed += Number(result.rowsAffected) || dupIds.length;
    }

    console.log(`[dedupSolutionsCatalogue] Removed ${removed} duplicate rows across ${duplicates.length} names`);
    dedupRan = true;
  } catch (e) {
    console.error("dedupSolutionsCatalogue failed:", e);
    // Don't set dedupRan so it can retry next request
  }
}

// Module-level flag — seed runs once per lambda lifetime, not per request
let seedsChecked = false;

async function seedSolutionsCatalogue(db: Client) {
  if (seedsChecked) return;
  try {
    // Jay's real product line (from the pricing sheet): one website plan + 7 add-ons.
    // `upfront` = one-off / setup, `monthly` = recurring. The base plan is category
    // "website" so the dashboard can split it from add-ons. Per-attach amount
    // overrides (entity_solutions) cover the Drone half/full-day and Email per-inbox variants.
    const seeds = [
      { name: "Website — Essential (T1)", description: "The core branded website — hosting & support, organic SEO/GEO + regular enhancements, Google/Facebook reviews, before/after slider, hero + visual transformation videos, click-to-call, contact forms (WhatsApp/Email), WhatsApp/Messenger widget, mobile optimised, socials linked. Live in 7 days.", category: "website", target_trades: "Plumbing,Electrician,Driveway,Builder,Roofer", upfront: 95, monthly: 85, days: 7, pitch: "Everything they need to look professional, build trust and generate more leads — most agencies charge £2,000+ upfront." },
      { name: "Visual Content Package", description: "Keeps the website + socials fresh: ongoing visual updates, new hero video creation, new project showcases, additional transformation videos, social media content assets, ongoing content requests.", category: "marketing", target_trades: "", upfront: 0, monthly: 55, days: 3, pitch: "Their site never goes stale — fresh before/afters and reels keep them top of mind." },
      { name: "Drone Photography", description: "Stunning aerial photos that set them apart and showcase their work from a new perspective. Half day £249 / Full day £395 — set the one-off when attaching.", category: "marketing", target_trades: "Roofer,Driveway,Builder", upfront: 249, monthly: 0, days: 2, pitch: "Aerial shots make a roof or driveway job look £100k bigger — nobody else in their area has them." },
      { name: "Review Funnel", description: "Branded review system: a landing page, QR code and direct links that funnel happy customers straight to a 5-star Google review.", category: "automation", target_trades: "", upfront: 0, monthly: 10, days: 2, pitch: "Most trades have 5-10 reviews. This gets them to 100+ in a year on autopilot." },
      { name: "Quote Funnel", description: "Smart quote-request funnel that qualifies leads and converts more enquiries into customers.", category: "automation", target_trades: "", upfront: 0, monthly: 20, days: 3, pitch: "Stops tyre-kickers, captures the real jobs, and books them in while the iron's hot." },
      { name: "Missed Call Text Back", description: "Never miss a lead — instantly texts back missed calls to keep conversions high.", category: "automation", target_trades: "", upfront: 0, monthly: 25, days: 2, pitch: "Tradies miss 30%+ of calls on the tools. Every missed call gets an instant text — no lead lost." },
      { name: "AI Chatbot", description: "Engages visitors 24/7, answers questions and captures leads automatically.", category: "ai", target_trades: "", upfront: 0, monthly: 45, days: 4, pitch: "Visitors at 11pm are leads — the chatbot captures them while they sleep." },
      { name: "Email Hosting", description: "Professional email addresses that build trust and credibility. £95 setup + £5/pm per inbox — set the monthly to £5 × number of inboxes when attaching.", category: "integration", target_trades: "", upfront: 95, monthly: 5, days: 2, pitch: "name@theirbusiness.co.uk instead of a gmail — instant credibility for a few quid a month." },
      { name: "Google PPC Ad Campaign", description: "Managed Google Ads (PPC) campaign — keyword research, ad copy and a conversion-focused landing page, with ongoing optimisation to drive high-intent leads. Setup covers the account build + launch; monthly covers management (ad spend billed separately by Google).", category: "marketing", target_trades: "", upfront: 250, monthly: 200, days: 5, pitch: "Puts them at the top of Google for their money terms from day one — instant lead flow while the organic SEO builds." },
      { name: "Meta Ad Campaign", description: "Managed Facebook & Instagram (Meta) ad campaign — audience targeting, creative and ongoing optimisation to generate leads and build local awareness. Setup covers the pixel + campaign build; monthly covers management (ad spend billed separately by Meta).", category: "marketing", target_trades: "", upfront: 200, monthly: 150, days: 5, pitch: "Gets their before/after work in front of thousands of local homeowners scrolling Facebook & Instagram — high-volume lead gen on tap." },
    ];

    // Idempotent seed: insert only solutions whose name doesn't already exist.
    // Use the `all()` helper because libsql returns rows as positional arrays —
    // the previous `r.name` cast silently produced undefined, causing duplicates.
    const existing = await db.execute("SELECT name FROM solutions_catalogue");
    const existingNames = new Set(all(existing).map((r) => r.name as string));

    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      if (existingNames.has(s.name)) continue;
      await db.execute({
        sql: `INSERT INTO solutions_catalogue (name, description, category, target_trades, upfront_price, monthly_price, install_days, pitch_angle, active, sort_order)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        args: [s.name, s.description, s.category, s.target_trades, s.upfront, s.monthly, s.days, s.pitch, i],
      });
    }
    seedsChecked = true;
  } catch (e) {
    console.error("seedSolutionsCatalogue failed:", e);
  }
}

// Module-level flag — base line-item migration runs once per lambda lifetime.
// Correctness across lambdas is guarded by the app_meta sentinel (runs once ever).
let baseLineItemsMigrated = false;

// One-time migration: give every lead that currently carries a manual amount
// (leads.capex, the custom_monthly field, or a client project's monthly_fee) a
// base "Website — Essential" entity_solution carrying those amounts — so the now
// product-driven dashboard shows the same totals it did before the switch.
async function migrateBaseProductLineItems(db: Client) {
  if (baseLineItemsMigrated) return;
  try {
    // Run exactly once ever (across all lambdas) — prevents resurrecting a base
    // line item the user later deletes via the picker.
    const marker = first(await db.execute("SELECT value FROM app_meta WHERE key = 'base_line_items_migrated'"));
    if (marker) { baseLineItemsMigrated = true; return; }

    const base = first(await db.execute(
      "SELECT id FROM solutions_catalogue WHERE category = 'website' AND active = 1 ORDER BY id LIMIT 1"
    ));
    if (!base) return; // catalogue not seeded yet — retry next request (flag stays false)
    const baseId = Number(base.id);

    const rows = all(await db.execute(`
      SELECT l.id AS lead_id,
             COALESCE(l.capex, 0) AS capex,
             COALESCE((SELECT CAST(cfv.value AS REAL) FROM custom_field_values cfv
                       WHERE cfv.lead_id = l.id AND cfv.field_id = 'custom_monthly' AND cfv.value != '' LIMIT 1), 0) AS cust_monthly,
             COALESCE((SELECT p.monthly_fee FROM projects p WHERE p.lead_id = l.id LIMIT 1), 0) AS proj_monthly,
             (SELECT COUNT(*) FROM projects p2 WHERE p2.lead_id = l.id AND p2.stage != 'onboarding') AS is_client
      FROM leads l
      WHERE (COALESCE(l.capex,0) > 0
             OR EXISTS (SELECT 1 FROM custom_field_values cfv WHERE cfv.lead_id = l.id AND cfv.field_id = 'custom_monthly' AND cfv.value != '' AND CAST(cfv.value AS REAL) > 0)
             OR EXISTS (SELECT 1 FROM projects p WHERE p.lead_id = l.id AND p.monthly_fee > 0))
        AND NOT EXISTS (
          SELECT 1 FROM entity_solutions es JOIN solutions_catalogue sc ON sc.id = es.solution_id
          WHERE es.entity_type = 'lead' AND es.entity_id = l.id AND sc.category = 'website'
        )
    `));

    const now = new Date().toISOString();
    let seeded = 0;
    for (const r of rows) {
      const leadId = Number(r.lead_id);
      const isClient = Number(r.is_client) > 0;
      const monthly = isClient ? (Number(r.proj_monthly) || Number(r.cust_monthly) || 0)
                               : (Number(r.cust_monthly) || Number(r.proj_monthly) || 0);
      const upfront = Number(r.capex) || 0;
      const status = isClient ? "sold" : "proposed";
      await db.execute({
        sql: `INSERT INTO entity_solutions
              (entity_type, entity_id, solution_id, status, monthly_upcharge, upfront_charged, notes, proposed_at, sold_at, delivered_at, created_at, updated_at)
              VALUES ('lead', ?, ?, ?, ?, ?, 'Migrated from manual amounts', ?, ?, '', ?, ?)
              ON CONFLICT(entity_type, entity_id, solution_id) DO NOTHING`,
        args: [leadId, baseId, status, monthly, upfront, now, isClient ? now : "", now, now],
      });
      seeded++;
    }

    await db.execute({
      sql: "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('base_line_items_migrated', ?)",
      args: [now],
    });
    baseLineItemsMigrated = true;
    console.log(`[migrateBaseProductLineItems] seeded ${seeded} base product line items`);
  } catch (e) {
    console.error("migrateBaseProductLineItems failed:", e);
  }
}

// Helper: get all rows as objects
export function all(result: ResultSet): Record<string, unknown>[] {
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < result.columns.length; i++) {
      obj[result.columns[i]] = row[i];
    }
    return obj;
  });
}

// Helper: get first row or null
export function first(result: ResultSet): Record<string, unknown> | null {
  if (result.rows.length === 0) return null;
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < result.columns.length; i++) {
    obj[result.columns[i]] = result.rows[0][i];
  }
  return obj;
}
