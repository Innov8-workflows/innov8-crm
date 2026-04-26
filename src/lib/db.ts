import { createClient, type Client, type ResultSet } from "@libsql/client";

let client: Client | null = null;

export function getClient(): Client {
  if (client) return client;

  client = createClient({
    url: process.env.TURSO_DATABASE_URL || "file:crm.db",
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
    CREATE INDEX IF NOT EXISTS idx_solutions_active ON solutions_catalogue(active);
  `);

  // Seed the solutions catalogue if empty (first deploy only)
  await seedSolutionsCatalogue(db);
}

async function seedSolutionsCatalogue(db: Client) {
  try {
    const seeds = [
      { name: "AI Voice Receptionist", description: "Answers missed calls 24/7, takes messages and books appointments. Never miss a job again.", category: "ai", target_trades: "Plumbing,Electrician,Driveway,Builder,Roofer", upfront: 299, monthly: 79, days: 7, pitch: "Tradies miss 30%+ of calls during job hours — this catches them all" },
      { name: "WhatsApp Auto-Reply Bot", description: "Instant replies to FB Messenger / Instagram / WhatsApp enquiries with smart routing.", category: "automation", target_trades: "", upfront: 149, monthly: 35, days: 3, pitch: "First-to-reply wins — automate the response while you're on a job" },
      { name: "Review Request Automation", description: "Auto-texts customers after a job to request a Google review. Build social proof on autopilot.", category: "automation", target_trades: "", upfront: 99, monthly: 25, days: 2, pitch: "Most trades have 5-10 reviews. With this they'll have 100+ in a year." },
      { name: "Lead Capture Chatbot", description: "On-site AI chatbot that qualifies enquiries, captures contact details, and books quotes 24/7.", category: "ai", target_trades: "", upfront: 199, monthly: 40, days: 4, pitch: "Visitors at 11pm are leads — capture them while you sleep" },
      { name: "AI Quote Generator from Photos", description: "Customer uploads a photo of the job, AI returns a ballpark estimate. Filters out tyre-kickers.", category: "ai", target_trades: "Plumbing,Electrician,Driveway,Builder,Roofer", upfront: 349, monthly: 60, days: 10, pitch: "Stop wasting hours on quotes for jobs that won't convert" },
      { name: "Online Booking System", description: "Calendar widget with auto-confirmations, reminders, and deposit collection.", category: "integration", target_trades: "Beauty,Hairdresser,Dog Groomer,Personal Trainer,Photographer", upfront: 199, monthly: 30, days: 5, pitch: "No more DM ping-pong — they book themselves" },
      { name: "Quote Follow-Up Drip", description: "Automatic email/SMS sequence if a quote isn't accepted within 48hrs. Recovers ~30% of cold quotes.", category: "automation", target_trades: "Plumbing,Electrician,Driveway,Builder,Roofer", upfront: 79, monthly: 20, days: 2, pitch: "30% of 'maybe' quotes can be recovered with the right follow-up" },
      { name: "Social Media Auto-Poster", description: "Posts before/afters from a Drive folder weekly across FB, IG, and TikTok. Stays top of mind.", category: "marketing", target_trades: "", upfront: 149, monthly: 35, days: 4, pitch: "They have brilliant photos and zero time to post them" },
      { name: "Customer Re-engagement SMS", description: "Seasonal touchpoints to old customers — boiler service, garden tidy-up, summer body, etc.", category: "marketing", target_trades: "", upfront: 99, monthly: 30, days: 3, pitch: "Their customer list is gold — most never get contacted twice" },
      { name: "Stripe + Invoice Reminders", description: "Auto-send invoices via Stripe with chase-up reminders for overdue payments.", category: "integration", target_trades: "Plumbing,Electrician,Driveway,Builder,Roofer", upfront: 79, monthly: 15, days: 2, pitch: "Trades with cashflow problems love this — paid 40% faster on average" },
      { name: "Instagram Reel Generator", description: "AI cuts before/after clips into 30-second Reels with trending audio. Posts auto.", category: "marketing", target_trades: "Beauty,Hairdresser,Dog Groomer,Personal Trainer,Photographer", upfront: 199, monthly: 45, days: 5, pitch: "Reels = exposure. They don't have time to make them. We do." },
      { name: "Birthday / Loyalty SMS", description: "Auto-sends birthday discount codes and loyalty stamps via SMS. Drives repeat bookings.", category: "marketing", target_trades: "Beauty,Hairdresser,Dog Groomer,Personal Trainer", upfront: 79, monthly: 20, days: 2, pitch: "Repeat customers are 5x cheaper than new — automate the love" },
      // Custom builds — bespoke software powered by Claude Code
      { name: "Custom CRM", description: "Bespoke CRM tailored exactly to their workflow — pipelines, custom fields, dashboards. No bloat, only what they need.", category: "custom", target_trades: "", upfront: 499, monthly: 80, days: 14, pitch: "Off-the-shelf CRMs are bloated. Theirs will fit like a glove and they'll actually use it." },
      { name: "Custom Job Management App", description: "Mobile-first job tracker for the field. Photos, customer signatures, GPS check-in, materials list, time tracking.", category: "custom", target_trades: "Plumbing,Electrician,Driveway,Builder,Roofer", upfront: 799, monthly: 100, days: 21, pitch: "Their crew will stop scribbling on paper — and the office finally knows what's happening on each job in real time" },
      { name: "Custom Customer Portal", description: "Branded portal where their customers log in to view quotes, jobs, invoices, photos, and service history.", category: "custom", target_trades: "", upfront: 599, monthly: 60, days: 14, pitch: "Stops the 'when are you coming?' calls dead — customers self-serve everything" },
      { name: "Custom Quote / Estimate Builder", description: "Generate beautiful branded PDF quotes in 60 seconds from a simple form. Versioned, e-signable, auto follow-up.", category: "custom", target_trades: "Plumbing,Electrician,Driveway,Builder,Roofer", upfront: 349, monthly: 50, days: 10, pitch: "They're using Word docs and screenshots. This makes them look £100k bigger than they are." },
      { name: "Custom Internal KPI Dashboard", description: "Owner-only command centre: revenue per crew, conversion rate, jobs by stage, debtors. Pulls from their existing tools.", category: "custom", target_trades: "", upfront: 399, monthly: 50, days: 10, pitch: "Owners run blind. Give them numbers that actually drive decisions." },
      { name: "Bespoke AI Workflow Automation", description: "Custom AI agent built for their exact pain point — inbox triage, lead scoring, content generation, you name it. Built with Claude.", category: "custom", target_trades: "", upfront: 499, monthly: 75, days: 10, pitch: "Anything they wish a person could do but can't afford — we automate it" },
      { name: "Custom Booking + Resource Scheduler", description: "Schedules people, vans, and materials together — not just appointments. Catches double-bookings before they happen.", category: "custom", target_trades: "Plumbing,Electrician,Driveway,Builder,Roofer", upfront: 449, monthly: 55, days: 12, pitch: "Off-the-shelf calendars don't track if the van is free. This does." },
      { name: "Custom Branded Mobile PWA", description: "Their own logo on the home screen. Push notifications. Works offline. Their customers feel like they're using a £1m brand.", category: "custom", target_trades: "", upfront: 699, monthly: 70, days: 21, pitch: "App-store-quality experience without the £20k development cost" },
    ];

    // Idempotent seed: insert only solutions whose name doesn't already exist
    const existing = await db.execute("SELECT name FROM solutions_catalogue");
    const existingNames = new Set(existing.rows.map((r) => (r as unknown as { name: string }).name));

    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      if (existingNames.has(s.name)) continue;
      await db.execute({
        sql: `INSERT INTO solutions_catalogue (name, description, category, target_trades, upfront_price, monthly_price, install_days, pitch_angle, active, sort_order)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        args: [s.name, s.description, s.category, s.target_trades, s.upfront, s.monthly, s.days, s.pitch, i],
      });
    }
  } catch (e) {
    console.error("seedSolutionsCatalogue failed:", e);
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
