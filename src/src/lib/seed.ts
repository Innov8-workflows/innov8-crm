import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(__dirname, "../../crm.db");
const SITES_DIR = path.resolve(__dirname, "../../../");

async function seed() {
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Ensure tables exist
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

  // Find all *-site/contacts.txt files
  const entries = fs.readdirSync(SITES_DIR);
  const siteFolders = entries.filter(
    (e) => e.endsWith("-site") && fs.statSync(path.join(SITES_DIR, e)).isDirectory()
  );

  let imported = 0;
  let skipped = 0;

  for (const folder of siteFolders) {
    const contactsFile = path.join(SITES_DIR, folder, "contacts.txt");
    if (!fs.existsSync(contactsFile)) {
      continue;
    }

    const content = fs.readFileSync(contactsFile, "utf-8");
    const data: Record<string, string> = {};

    for (const line of content.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      data[key] = val;
    }

    const businessName = data["Business Name"] || folder.replace(/-site$/, "");
    const contactName = data["Owner / Contact"] || "";
    let email = data["Email"] || "";
    if (email.toLowerCase() === "not found") email = "";
    let phone = data["Phone"] || "";
    if (phone.toLowerCase() === "not found") phone = "";
    const businessType = normalizeType(data["Trade Type"] || "");
    const location = extractLocation(data["Address"] || "");
    const notes = data["Notes"] || "";

    // Check if already exists by business_name
    const checkStmt = db.prepare("SELECT id FROM leads WHERE business_name = ?");
    checkStmt.bind([businessName]);
    if (checkStmt.step()) {
      checkStmt.free();
      skipped++;
      continue;
    }
    checkStmt.free();

    const now = new Date().toISOString();
    db.run(
      `INSERT INTO leads (business_name, contact_name, email, phone, business_type, location, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessName, contactName, email, phone, businessType, location, notes, now, now]
    );
    imported++;
  }

  // Save
  const buffer = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, buffer);
  db.close();

  console.log(`Seed complete: ${imported} imported, ${skipped} skipped (already exist)`);
}

function normalizeType(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("plumb") || lower.includes("gas")) return "Plumbing";
  if (lower.includes("electr")) return "Electrician";
  if (lower.includes("drive") || lower.includes("pav")) return "Driveway";
  if (lower.includes("heat")) return "Plumbing";
  if (lower.includes("build") || lower.includes("design")) return "Other";
  return raw || "Other";
}

function extractLocation(address: string): string {
  if (!address || address.toLowerCase() === "not found") return "";
  // Try to pull out the town/city — typically the 2nd-to-last comma-separated value before postcode
  const parts = address.split(",").map((s) => s.trim());
  if (parts.length >= 3) return parts[parts.length - 3] || parts[parts.length - 2] || "";
  if (parts.length >= 2) return parts[0];
  return address;
}

seed().catch(console.error);
