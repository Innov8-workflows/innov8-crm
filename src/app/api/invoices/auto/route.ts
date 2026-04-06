import { NextResponse } from "next/server";
import { getClient, initDb, all } from "@/lib/db";
import { getOrCreateCustomer, createAndSendInvoice } from "@/lib/stripe";

// Auto-invoice endpoint — called by Vercel Cron daily
// Finds active clients with renewal_date = today and sends Stripe invoices
export async function POST() {
  await initDb();
  const db = getClient();
  const today = new Date().toISOString().split("T")[0];

  // Find active clients due for renewal today
  const result = await db.execute({
    sql: `SELECT p.id as project_id, p.monthly_fee, p.renewal_date,
            l.id as lead_id, l.business_name, l.email, l.stripe_customer_id
          FROM projects p JOIN leads l ON p.lead_id = l.id
          WHERE p.completed_at != ''
            AND (p.client_status IN ('active', 'refine') OR p.client_status IS NULL)
            AND p.monthly_fee > 0
            AND p.renewal_date = ?
            AND l.email != ''`,
    args: [today],
  });

  const clients = all(result);
  const results: { sent: string[]; failed: string[]; skipped: string[] } = {
    sent: [], failed: [], skipped: [],
  };

  for (const client of clients) {
    const businessName = client.business_name as string;
    const email = client.email as string;
    const monthlyFee = client.monthly_fee as number;
    const leadId = client.lead_id as number;
    const projectId = client.project_id as number;

    if (!email || !monthlyFee) {
      results.skipped.push(`${businessName} (no email or fee)`);
      continue;
    }

    try {
      // Get or create Stripe customer
      const { customerId, created } = await getOrCreateCustomer(
        leadId, businessName, email, (client.stripe_customer_id as string) || undefined
      );

      if (created) {
        await db.execute({
          sql: "UPDATE leads SET stripe_customer_id = ? WHERE id = ?",
          args: [customerId, leadId],
        });
      }

      // Send invoice
      await createAndSendInvoice(customerId, monthlyFee, `Monthly website fee — ${businessName}`);

      // Advance renewal date by 1 month
      const nextRenewal = new Date(today + "T00:00:00");
      nextRenewal.setMonth(nextRenewal.getMonth() + 1);
      const nextDate = nextRenewal.toISOString().split("T")[0];

      await db.execute({
        sql: "UPDATE projects SET renewal_date = ?, updated_at = ? WHERE id = ?",
        args: [nextDate, new Date().toISOString(), projectId],
      });

      results.sent.push(businessName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      results.failed.push(`${businessName}: ${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    summary: `Sent ${results.sent.length}, failed ${results.failed.length}, skipped ${results.skipped.length}`,
    ...results,
  });
}

// Also support GET for Vercel Cron (cron hits GET by default)
export { POST as GET };
