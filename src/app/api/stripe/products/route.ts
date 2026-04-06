import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

interface CachedProduct {
  product_id: string;
  price_id: string;
  name: string;
  amount: number;
  currency: string;
  recurring: boolean;
  interval: string;
}

let cachedProducts: CachedProduct[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  // Return cached if fresh
  if (cachedProducts && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ products: cachedProducts });
  }

  try {
    const stripe = getStripe();

    // Fetch all active prices with their products expanded
    const prices = await stripe.prices.list({
      active: true,
      expand: ["data.product"],
      limit: 50,
    });

    const products: CachedProduct[] = [];

    for (const price of prices.data) {
      const product = price.product as { id: string; name: string; active: boolean };
      if (typeof product === "string" || !product.active) continue;

      products.push({
        product_id: product.id,
        price_id: price.id,
        name: product.name,
        amount: (price.unit_amount || 0) / 100,
        currency: price.currency,
        recurring: !!price.recurring,
        interval: price.recurring?.interval || "one-time",
      });
    }

    // Sort: recurring first, then by name
    products.sort((a, b) => {
      if (a.recurring !== b.recurring) return a.recurring ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    cachedProducts = products;
    cacheTime = Date.now();

    return NextResponse.json({ products });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch products";
    return NextResponse.json({ error: msg, products: [] }, { status: 500 });
  }
}
