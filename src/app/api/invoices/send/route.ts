import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import { getOrCreateCustomer, createAndSendInvoice } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  await initDb();
  const db = getClient();
  const { project_id } = await request.json();

  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  // Get project + lead details
  const project = first(await db.execute({
    sql: `SELECT p.*, l.business_name, l.email, l.stripe_customer_id, l.id as lead_id
      FROM projects p JOIN leads l ON p.lead_id = l.id WHERE p.id = ?`,
    args: [project_id],
  }));

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const monthlyFee = project.monthly_fee as number;
  if (!monthlyFee || monthlyFee <= 0) {
    return NextResponse.json({ error: "No monthly fee set for this client" }, { status: 400 });
  }

  const businessName = project.business_name as string;
  const email = project.email as string;
  const leadId = project.lead_id as number;

  if (!email) {
    return NextResponse.json({ error: "Client has no email address — required for Stripe invoice" }, { status: 400 });
  }

  try {
    // Get or create Stripe customer
    const { customerId, created } = await getOrCreateCustomer(
      leadId, businessName, email, (project.stripe_customer_id as string) || undefined
    );

    // Save customer ID if newly created
    if (created) {
      await db.execute({
        sql: "UPDATE leads SET stripe_customer_id = ? WHERE id = ?",
        args: [customerId, leadId],
      });
    }

    // Create and send invoice (use Stripe price if set, otherwise manual amount)
    const stripePriceId = (project.stripe_price_id as string) || undefined;
    const invoice = await createAndSendInvoice(
      customerId,
      monthlyFee,
      `Monthly website fee — ${businessName}`,
      stripePriceId
    );

    // Mark as invoiced
    await db.execute({
      sql: "UPDATE projects SET invoice_status = 'invoiced', updated_at = ? WHERE id = ?",
      args: [new Date().toISOString(), project_id],
    });

    return NextResponse.json({
      ok: true,
      invoice_id: invoice.invoiceId,
      invoice_url: invoice.invoiceUrl,
      status: invoice.status,
      amount: monthlyFee,
      customer: businessName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
