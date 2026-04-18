import Stripe from "stripe";

/**
 * Lazy Stripe client — created on first use so the module imports cleanly
 * when STRIPE_SECRET_KEY isn't set (e.g. during build or in environments that
 * haven't been configured yet). Always check isStripeConfigured() before
 * calling into the client.
 */
let _stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe not configured. Set STRIPE_SECRET_KEY in Vercel env vars."
    );
  }
  _stripe = new Stripe(key, {
    appInfo: {
      name: "tradewithvic",
      url: "https://tradewithvic.com",
    },
  });
  return _stripe;
}

export function isStripeLive(): boolean {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  return k.startsWith("sk_live_");
}
