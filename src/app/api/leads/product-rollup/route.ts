import { NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { getProductRollup } from "@/lib/statsQueries";

// GET /api/leads/product-rollup
// Query lives in src/lib/statsQueries.ts — shared with /api/bootstrap. Returns:
//   { rollup: { [lead_id]: { count, monthly, upfront, items: [{ name, category }] } } }
export async function GET() {
  await initDb();
  const db = getClient();

  const rollup = await getProductRollup(db);

  return NextResponse.json({ rollup }, {
    // Hot-write — recomputed as products are attached; never serve stale.
    headers: { "Cache-Control": "private, no-store" },
  });
}
