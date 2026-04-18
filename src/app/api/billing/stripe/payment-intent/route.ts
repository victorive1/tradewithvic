import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateBillingAccount } from "@/lib/billing/account";
import { getStripe, isStripeConfigured } from "@/lib/billing/stripe-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Create a Stripe PaymentIntent for a user deposit. Returns the client_secret
 * which the frontend feeds to Stripe Elements to complete the charge. The
 * actual balance credit happens in the webhook (payment_intent.succeeded).
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const stripe = getStripe();

  // Ensure a Stripe Customer exists so payment methods can attach and
  // repeat-charges are possible. One-to-one with BillingAccount.
  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { userKey: account.userKey, billingAccountId: account.id },
    });
    customerId = customer.id;
    await prisma.billingAccount.update({
      where: { id: account.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Stripe uses minor units
    currency: account.currency.toLowerCase(),
    customer: customerId,
    setup_future_usage: body.savePaymentMethod ? "off_session" : undefined,
    automatic_payment_methods: { enabled: true },
    metadata: {
      billingAccountId: account.id,
      userKey: account.userKey,
      kind: "deposit",
    },
  });

  // Create a pending DepositRequest that'll flip to completed in the webhook.
  await prisma.depositRequest.create({
    data: {
      billingAccountId: account.id,
      userKey: account.userKey,
      amount,
      currency: account.currency,
      methodType: "card",
      processorChargeRef: intent.id,
      status: "pending",
      statusReason: "awaiting_stripe_confirmation",
      feeAmount: 0,
      netAmount: amount,
    },
  });

  return NextResponse.json({
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
}
