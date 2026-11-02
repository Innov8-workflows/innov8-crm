import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { buildSalesTargets, ukToday } from "@/lib/salesTargets";

// The Dashboard's Sales Target block. Session-guarded by the middleware.
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  await initDb();
  return NextResponse.json(await buildSalesTargets(getClient()), NO_STORE);
}

// Sets the target from the current month onward. Earlier months have their own rows
// (or none), so they stay judged against the target they had at the time.
export async function PUT(request: NextRequest) {
  await initDb();
  const body = await request.json().catch(() => null);
  const new_mrr = Number(body?.new_mrr);
  const setup_fees = Number(body?.setup_fees);
  const new_clients = Number(body?.new_clients);
  if (!Number.isFinite(new_mrr) || new_mrr <= 0) {
    return NextResponse.json({ error: "The new recurring target must be more than £0" }, { status: 400 });
  }
  if (!Number.isFinite(setup_fees) || setup_fees < 0) {
    return NextResponse.json({ error: "Setup fees can't be negative" }, { status: 400 });
  }
  if (!Number.isInteger(new_clients) || new_clients < 0) {
    return NextResponse.json({ error: "New clients must be a whole number" }, { status: 400 });
  }
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO sales_targets (month, new_mrr, setup_fees, new_clients, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(month) DO UPDATE SET new_mrr = excluded.new_mrr, setup_fees = excluded.setup_fees,
            new_clients = excluded.new_clients, updated_at = excluded.updated_at`,
    args: [ukToday().slice(0, 7), new_mrr, setup_fees, new_clients],
  });
  return NextResponse.json(await buildSalesTargets(db), NO_STORE);
}
