import { NextRequest, NextResponse } from "next/server";
import { isAdminBillingAuthorized } from "@/lib/billing/admin-auth";
import { isStripeConfigured, isStripeLive, getStripe } from "@/lib/billing/stripe-client";
import { isBitPayConfigured } from "@/lib/billing/bitpay-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Reports which processors are wired + what mode they're in. Also exposes a
 * "test connection" flag so the admin can see at a glance whether Stripe keys
 * are actually working vs. just present.
 */
export async function GET(req: NextRequest) {
  if (!isAdminBillingAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let stripeOk = false;
  let stripeError: string | null = null;
  let stripeAccount: any = null;
  if (isStripeConfigured()) {
    try {
      const acct: any = await (getStripe().accounts as any).retrieve();
      stripeOk = true;
      stripeAccount = {
        id: acct.id,
        country: acct.country,
        defaultCurrency: acct.default_currency,
        chargesEnabled: acct.charges_enabled,
        payoutsEnabled: acct.payouts_enabled,
        detailsSubmitted: acct.details_submitted,
        businessProfileName: acct.business_profile?.name,
      };
    } catch (e: any) {
      stripeError = e?.message ?? String(e);
    }
  }

  return NextResponse.json({
    stripe: {
      configured: isStripeConfigured(),
      mode: isStripeLive() ? "live" : isStripeConfigured() ? "test" : "unconfigured",
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      publishableKeySet: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      connectionOk: stripeOk,
      error: stripeError,
      account: stripeAccount,
    },
    bitpay: {
      configured: isBitPayConfigured(),
      env: (process.env.BITPAY_ENV ?? "prod").toLowerCase(),
      webhookSecretSet: Boolean(process.env.BITPAY_WEBHOOK_SECRET),
    },
    endpoints: {
      stripeWebhook: "/api/billing/stripe/webhook",
      bitpayWebhook: "/api/billing/bitpay/webhook",
    },
  });
}
