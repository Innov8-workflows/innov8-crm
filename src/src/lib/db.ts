import initSqlJs, { Database } from "sql.js";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "crm.db");

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables if they don't exist
  db.run(`
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
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
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email COLLATE NOCASE)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_email_logs_lead ON email_logs(lead_id)`);

  persist();
  return db;
}

export function persist() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}
