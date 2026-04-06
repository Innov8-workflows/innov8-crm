import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key);
}

export async function getOrCreateCustomer(
  leadId: number,
  businessName: string,
  email: string,
  existingCustomerId?: string
): Promise<{ customerId: string; created: boolean }> {
  // Return existing if we have one
  if (existingCustomerId) {
    return { customerId: existingCustomerId, created: false };
  }

  // Create new Stripe customer
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: businessName,
    email: email || undefined,
    metadata: { lead_id: String(leadId) },
  });

  return { customerId: customer.id, created: true };
}

export async function createAndSendInvoice(
  customerId: string,
  amountPounds: number,
  description: string
): Promise<{ invoiceId: string; invoiceUrl: string; status: string }> {
  const stripe = getStripe();
  // Create invoice item (amount in pence)
  await stripe.invoiceItems.create({
    customer: customerId,
    amount: Math.round(amountPounds * 100),
    currency: "gbp",
    description,
  });

  // Create the invoice
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: 14,
    auto_advance: true,
  });

  // Finalize and send
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);

  return {
    invoiceId: finalized.id,
    invoiceUrl: finalized.hosted_invoice_url || "",
    status: finalized.status || "sent",
  };
}

export { getStripe };
