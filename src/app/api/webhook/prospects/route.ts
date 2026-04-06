import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";

// Public webhook endpoint for importing scraped prospects
// Accepts single prospect or array of prospects
// Checks for duplicates by business_name (case-insensitive)
export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const body = await request.json();

  // Accept single object or array
  const prospects: Record<string, unknown>[] = Array.isArray(body) ? body : body.prospects ? body.prospects : [body];

  if (prospects.length === 0) {
    return NextResponse.json({ error: "No prospects provided" }, { status: 400 });
  }

  const results: { added: string[]; skipped: string[]; errors: string[] } = {
    added: [],
    skipped: [],
    errors: [],
  };

  for (const prospect of prospects) {
    const businessName = String(prospect.business_name || "").trim();
    if (!businessName) {
      results.errors.push("Missing business_name");
      continue;
    }

    // Duplicate check by business name (case-insensitive)
    const existing = first(
      await db.execute({
        sql: "SELECT id, business_name FROM leads WHERE business_name = ? COLLATE NOCASE",
        args: [businessName],
      })
    );

    if (existing) {
      results.skipped.push(`${businessName} (already exists)`);
      continue;
    }

    // Also check by email if provided
    const email = String(prospect.email || "").trim();
    if (email && email.length > 3) {
      const emailDup = first(
        await db.execute({
          sql: "SELECT id, business_name FROM leads WHERE email = ? COLLATE NOCASE",
          args: [email],
        })
      );
      if (emailDup) {
        results.skipped.push(`${businessName} (email ${email} already used by ${emailDup.business_name})`);
        continue;
      }
    }

    // Normalize business type
    const rawType = String(prospect.business_type || "").toLowerCase();
    let businessType = prospect.business_type || "";
    if (rawType.includes("plumb")) businessType = "Plumbing";
    else if (rawType.includes("electr")) businessType = "Electrician";
    else if (rawType.includes("drive") || rawType.includes("pav") || rawType.includes("land")) businessType = "Driveway";
    else if (rawType.includes("roof")) businessType = "Roofing";
    else if (rawType.includes("build")) businessType = "Builder";
    else if (rawType.includes("heat") || rawType.includes("boil") || rawType.includes("gas")) businessType = "Heating";
    else if (rawType.includes("paint") || rawType.includes("decor")) businessType = "Painter";
    else if (rawType.includes("clean")) businessType = "Cleaning";
    else if (rawType.includes("garden") || rawType.includes("fenc")) businessType = "Gardening";
    else if (rawType.includes("saas") || rawType.includes("software") || rawType.includes("tech")) businessType = "SaaS";

    // Extract location from address if not explicitly provided
    let location = String(prospect.location || "").trim();
    if (!location && prospect.address) {
      const parts = String(prospect.address).split(",").map((s: string) => s.trim());
      // Take the second-to-last or last meaningful part as the town/city
      location = parts.length >= 2 ? parts[parts.length - 2] : parts[0] || "";
    }

    const now = new Date().toISOString();
    const maxOrder = first(await db.execute("SELECT COALESCE(MAX(sort_order), 0) as v FROM leads"));
    const nextOrder = ((maxOrder?.v as number) || 0) + 1;

    try {
      const args = [
        businessName,
        String(prospect.contact_name || "").trim(),
        email,
        String(prospect.phone || "").trim(),
        String(businessType).trim(),
        location,
        prospect.website_status ?? (prospect.has_website ? 1 : 0),
        String(prospect.notes || "").trim(),
        String(prospect.demo_site_url || prospect.website_url || "").trim(),
        String(prospect.assigned_owner || "").trim(),
        nextOrder,
        now,
        now,
      ] as never[];
      await db.execute({
        sql: `INSERT INTO leads (business_name, contact_name, email, phone, business_type, location,
          website_status, notes, status, demo_site_url, owner, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`,
        args,
      });
      results.added.push(businessName);
    } catch (err) {
      results.errors.push(`${businessName}: ${err}`);
    }
  }

  return NextResponse.json({
    ok: true,
    summary: `Added ${results.added.length}, skipped ${results.skipped.length} duplicates, ${results.errors.length} errors`,
    ...results,
  });
}

// GET: check for duplicates before importing
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const name = request.nextUrl.searchParams.get("name");

  if (!name) return NextResponse.json({ error: "name parameter required" }, { status: 400 });

  const result = await db.execute({
    sql: "SELECT id, business_name, email FROM leads WHERE business_name LIKE ? COLLATE NOCASE",
    args: [`%${name}%`],
  });

  return NextResponse.json({ matches: all(result) });
}
