import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);

  if (rows.length === 0) return NextResponse.json({ error: "No data rows found" }, { status: 400 });

  const headerMap: Record<string, string> = {
    "business": "business_name", "business name": "business_name", "company": "business_name", "name": "business_name",
    "owner": "contact_name", "contact": "contact_name", "contact name": "contact_name",
    "email": "email", "email address": "email",
    "phone": "phone", "number": "phone", "phone number": "phone",
    "type": "business_type", "business type": "business_type", "trade": "business_type",
    "location": "location", "area": "location", "town": "location",
    "notes": "notes",
  };

  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const field = headerMap[key.toLowerCase().trim()];
      if (field) mapped[field] = String(value || "").trim();
    }

    const bizName = mapped.business_name;
    if (!bizName) { skipped++; continue; }

    const existing = first(await db.execute({ sql: "SELECT id FROM leads WHERE business_name = ? COLLATE NOCASE", args: [bizName] }));
    if (existing) { skipped++; continue; }

    await db.execute({
      sql: "INSERT INTO leads (business_name, contact_name, email, phone, business_type, location, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [bizName, mapped.contact_name || "", mapped.email || "", mapped.phone || "", mapped.business_type || "", mapped.location || "", mapped.notes || "", now, now],
    });
    imported++;
  }

  return NextResponse.json({ imported, skipped, total: rows.length });
}
