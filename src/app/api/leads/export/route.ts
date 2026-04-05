import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import * as XLSX from "xlsx";
import type { InValue } from "@libsql/client";

export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const format = request.nextUrl.searchParams.get("format") || "xlsx";
  const businessType = request.nextUrl.searchParams.get("business_type");

  let sql = "SELECT * FROM leads";
  const values: InValue[] = [];

  if (businessType && businessType !== "All") {
    sql += " WHERE business_type LIKE ?";
    values.push(`%${businessType}%`);
  }

  sql += " ORDER BY sort_order ASC, id ASC";
  const result = await db.execute({ sql, args: values });
  const leads = all(result);

  const colResult = await db.execute("SELECT * FROM column_config");
  const colConfig: Record<string, { label: string }> = {};
  for (const row of all(colResult)) colConfig[row.id as string] = { label: row.label as string };

  const fieldMap: Record<string, string> = {
    business_name: colConfig["business_name"]?.label || "Business",
    contact_name: colConfig["contact_name"]?.label || "Owner",
    business_type: colConfig["business_type"]?.label || "Business Type",
    location: colConfig["location"]?.label || "Location",
    email: colConfig["email"]?.label || "Email",
    phone: colConfig["phone"]?.label || "Number",
    website_status: colConfig["website_status"]?.label || "Website?",
    emailed: colConfig["emailed"]?.label || "Emailed",
    messaged: colConfig["messaged"]?.label || "Messaged",
    responded: colConfig["responded"]?.label || "Responded",
    followed_up: colConfig["followed_up"]?.label || "Followed Up",
    capex: colConfig["capex"]?.label || "CAPEX",
    notes: colConfig["notes"]?.label || "Notes",
    status: "Stage",
    follow_up_date: "Follow Up",
  };

  const exportData = leads.map((lead) => {
    const row: Record<string, unknown> = {};
    for (const [field, label] of Object.entries(fieldMap)) {
      const val = lead[field];
      if (["website_status", "emailed", "messaged", "responded", "followed_up"].includes(field)) {
        row[label] = val ? "Yes" : "No";
      } else {
        row[label] = val ?? "";
      }
    }
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=innov8-leads.csv" },
    });
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=innov8-leads.xlsx",
    },
  });
}
