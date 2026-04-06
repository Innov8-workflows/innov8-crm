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
  stripePriceIds?: string
): Promise<{ invoiceId: string; invoiceUrl: string; status: string }> {
  const stripe = getStripe();

  // Step 1: Create draft invoice first
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: 14,
    auto_advance: true,
  });

  // Step 2: Add line items TO this specific invoice
  const priceIds = (stripePriceIds || "").split(",").filter(Boolean);

  if (priceIds.length > 0) {
    // Add each selected product as a separate line item
    for (const priceId of priceIds) {
      const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
      const productName = typeof price.product === "object" && price.product !== null ? (price.product as { name?: string }).name || "" : "";
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: price.unit_amount || 0,
        currency: price.currency || "gbp",
        description: productName || description,
      });
    }
  } else {
    // No products selected — use manual amount
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: Math.round(amountPounds * 100),
      currency: "gbp",
      description,
    });
  }

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
