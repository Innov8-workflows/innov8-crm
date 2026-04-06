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

export async function initDb() {
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
  `);
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
