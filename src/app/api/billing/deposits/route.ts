import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateBillingAccount, postTransaction } from "@/lib/billing/account";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_METHODS = new Set(["card", "crypto"]);

/**
 * Create a deposit request. Real implementation would hand off to Stripe or
 * Coinbase Commerce; this sandbox version records the intent and simulates
 * progression. Production wiring goes here once a processor is connected.
 */
export async function POST(req: NextRequest) {
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  const methodType = typeof body.methodType === "string" && ALLOWED_METHODS.has(body.methodType) ? body.methodType : null;
  if (!methodType) return NextResponse.json({ error: "invalid_method" }, { status: 400 });

  const methodId = typeof body.methodId === "string" ? body.methodId : null;
  if (methodType === "card" && !methodId) {
    return NextResponse.json({ error: "card_method_required" }, { status: 400 });
  }

  const fee = methodType === "crypto" ? 0 : Math.max(0.3, amount * 0.029);
  const net = amount - fee;

  const deposit = await prisma.depositRequest.create({
    data: {
      billingAccountId: account.id,
      userKey: account.userKey,
      amount,
      currency: account.currency,
      methodType,
      methodId,
      feeAmount: fee,
      netAmount: net,
      status: methodType === "crypto" ? "pending" : "completed", // crypto stays pending until network confirmation; card sandbox auto-completes
      statusReason: methodType === "crypto" ? "awaiting_network_confirmation" : "sandbox_auto_complete",
      expiresAt: methodType === "crypto" ? new Date(Date.now() + 60 * 60_000) : null,
      completedAt: methodType === "crypto" ? null : new Date(),
    },
  });

  // Only move balance on completed deposits; pending crypto sits in pendingBalance.
  if (deposit.status === "completed") {
    await prisma.$transaction([
      prisma.billingAccount.update({
        where: { id: account.id },
        data: { availableBalance: { increment: net } },
      }),
      prisma.billingTransaction.create({
        data: {
          billingAccountId: account.id,
          userKey: account.userKey,
          transactionType: "deposit",
          referenceType: "deposit_request",
          referenceId: deposit.id,
          amount: net,
          currency: account.currency,
          status: "completed",
          description: `Card deposit · $${amount.toFixed(2)} net of $${fee.toFixed(2)} fee`,
          metadataJson: JSON.stringify({ methodType, methodId }),
        },
      }),
    ]);
    if (fee > 0) {
      await postTransaction({
        billingAccountId: account.id,
        userKey: account.userKey,
        transactionType: "fee",
        amount: -fee,
        description: `Processor fee · ${methodType}`,
        referenceType: "deposit_request",
        referenceId: deposit.id,
      });
    }
  } else {
    // Crypto: amount enters pending balance until confirmed
    await prisma.billingAccount.update({
      where: { id: account.id },
      data: { pendingBalance: { increment: amount } },
    });
  }

  return NextResponse.json(deposit);
}
