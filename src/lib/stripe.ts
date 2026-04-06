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
  description: string,
  stripePriceId?: string
): Promise<{ invoiceId: string; invoiceUrl: string; status: string }> {
  const stripe = getStripe();

  // Step 1: Create draft invoice first
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: 14,
    auto_advance: true,
  });

  // Step 2: Add line item TO this specific invoice
  const amountPence = stripePriceId
    ? await (async () => {
        const price = await stripe.prices.retrieve(stripePriceId);
        return price.unit_amount || Math.round(amountPounds * 100);
      })()
    : Math.round(amountPounds * 100);

  await stripe.invoiceItems.create({
    customer: customerId,
    invoice: invoice.id,
    amount: amountPence,
    currency: "gbp",
    description,
  });

  // Step 3: Finalize
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);

  // Step 4: Try to send via email (non-blocking)
  try {
    await stripe.invoices.sendInvoice(invoice.id);
  } catch {
    // Email send failed — invoice still accessible via hosted URL
  }

  return {
    invoiceId: finalized.id,
    invoiceUrl: finalized.hosted_invoice_url || "",
    status: finalized.status || "finalized",
  };
}

export { getStripe };
