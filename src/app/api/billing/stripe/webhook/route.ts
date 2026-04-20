import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/billing/stripe-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * Stripe webhook handler. Configure in Stripe Dashboard → Developers → Webhooks,
 * pointed at https://tradewithvic.com/api/billing/stripe/webhook with
 * payment_intent.* and charge.* events. Signing secret goes in STRIPE_WEBHOOK_SECRET.
 *
 * This is the single source of truth for crediting user balances — we only move
 * money in response to a verified webhook, never on the initial request.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook_secret_not_configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, sig, secret);
  } catch (err: any) {
    return NextResponse.json({ error: `invalid_signature: ${err.message}` }, { status: 400 });
  }

  // Dedup via BillingWebhookEvent — Stripe retries on 5xx until 2xx.
  const eventRef = event.id;
  const existing = await prisma.billingWebhookEvent.findFirst({
    where: { providerName: "stripe", eventRef },
  });
  if (existing?.processingStatus === "processed") {
    return NextResponse.json({ ok: true, deduped: true });
  }
  const webhookRow = existing
    ? existing
    : await prisma.billingWebhookEvent.create({
        data: {
          providerName: "stripe",
          eventType: event.type,
          eventRef,
          payloadJson: JSON.stringify(event),
          processingStatus: "pending",
        },
      });

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      }
      case "payment_intent.payment_failed": {
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      }
      case "charge.refunded": {
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      }
      default:
        // Log-only for unhandled events
        break;
    }

    await prisma.billingWebhookEvent.update({
      where: { id: webhookRow.id },
      data: { processingStatus: "processed", processedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await prisma.billingWebhookEvent.update({
      where: { id: webhookRow.id },
      data: { processingStatus: "failed", processingError: err?.message ?? String(err) },
    });
    // Return 500 so Stripe retries.
    return NextResponse.json({ error: err?.message ?? "processing_failed" }, { status: 500 });
  }
}

async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent) {
  // Intent metadata is a routing hint only — never trust it for crediting.
  // We look up the DepositRequest by the immutable processorChargeRef and
  // credit the billingAccount stored on *that* row, which was written
  // server-side at intent creation.
  if (!intent.metadata?.billingAccountId) return; // not one of ours

  const deposit = await prisma.depositRequest.findFirst({
    where: { processorChargeRef: intent.id },
  });
  if (!deposit || deposit.status === "completed") return;

  const amountUsd = intent.amount_received / 100;
  // Stripe takes its fee from the settlement, not from what the user paid —
  // for accounting we record gross amount as the deposit and split the fee
  // from payout data later via balance_transaction.net. For now we credit gross.
  await prisma.$transaction([
    prisma.depositRequest.update({
      where: { id: deposit.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        statusReason: "stripe_payment_intent_succeeded",
        feeAmount: 0,
        netAmount: amountUsd,
      },
    }),
    prisma.billingAccount.update({
      where: { id: deposit.billingAccountId },
      data: { availableBalance: { increment: amountUsd } },
    }),
    prisma.billingTransaction.create({
      data: {
        billingAccountId: deposit.billingAccountId,
        userKey: deposit.userKey,
        transactionType: "deposit",
        referenceType: "deposit_request",
        referenceId: deposit.id,
        amount: amountUsd,
        currency: (intent.currency ?? "usd").toUpperCase(),
        status: "completed",
        description: `Stripe card deposit · ${intent.id}`,
        metadataJson: JSON.stringify({ paymentIntentId: intent.id, paymentMethod: intent.payment_method }),
      },
    }),
  ]);
}

async function handlePaymentIntentFailed(intent: Stripe.PaymentIntent) {
  const deposit = await prisma.depositRequest.findFirst({
    where: { processorChargeRef: intent.id },
  });
  if (!deposit || deposit.status === "completed") return;
  await prisma.depositRequest.update({
    where: { id: deposit.id },
    data: {
      status: "failed",
      statusReason: intent.last_payment_error?.message ?? "stripe_payment_failed",
    },
  });
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!intentId) return;
  const deposit = await prisma.depositRequest.findFirst({ where: { processorChargeRef: intentId } });
  if (!deposit) return;

  const refundAmount = (charge.amount_refunded ?? 0) / 100;
  if (refundAmount <= 0) return;

  await prisma.$transaction([
    prisma.depositRequest.update({
      where: { id: deposit.id },
      data: {
        status: "reversed",
        statusReason: `stripe_refunded_${refundAmount.toFixed(2)}`,
      },
    }),
    prisma.billingAccount.update({
      where: { id: deposit.billingAccountId },
      data: { availableBalance: { decrement: refundAmount } },
    }),
    prisma.billingTransaction.create({
      data: {
        billingAccountId: deposit.billingAccountId,
        userKey: deposit.userKey,
        transactionType: "refund",
        referenceType: "deposit_request",
        referenceId: deposit.id,
        amount: -refundAmount,
        currency: deposit.currency,
        status: "completed",
        description: `Stripe refund · ${charge.id}`,
        metadataJson: JSON.stringify({ chargeId: charge.id }),
      },
    }),
  ]);
}
