import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateBillingAccount } from "@/lib/billing/account";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_DESTINATIONS = new Set(["bank", "crypto"]);

export async function POST(req: NextRequest) {
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });

  const destinationType = typeof body.destinationType === "string" && ALLOWED_DESTINATIONS.has(body.destinationType) ? body.destinationType : null;
  if (!destinationType) return NextResponse.json({ error: "invalid_destination" }, { status: 400 });

  const destinationRef = typeof body.destinationRef === "string" ? body.destinationRef : null;
  if (!destinationRef) return NextResponse.json({ error: "missing_destination_ref" }, { status: 400 });

  const destinationLabel = typeof body.destinationLabel === "string" ? body.destinationLabel : null;

  if (amount > account.availableBalance) {
    return NextResponse.json({ error: "insufficient_balance", available: account.availableBalance }, { status: 400 });
  }

  const fee = destinationType === "crypto" ? Math.max(1, amount * 0.005) : Math.max(0.25, amount * 0.01);
  const net = amount - fee;

  const withdrawal = await prisma.$transaction(async (tx: any) => {
    const w = await tx.withdrawalRequest.create({
      data: {
        billingAccountId: account.id,
        userKey: account.userKey,
        amount,
        currency: account.currency,
        destinationType,
        destinationRef,
        destinationLabel,
        feeAmount: fee,
        netAmount: net,
        status: "under_review",
        statusReason: "automated_review_queue",
      },
    });
    // Move amount from available → locked until payout completes
    await tx.billingAccount.update({
      where: { id: account.id },
      data: {
        availableBalance: { decrement: amount },
        lockedBalance: { increment: amount },
      },
    });
    await tx.billingTransaction.create({
      data: {
        billingAccountId: account.id,
        userKey: account.userKey,
        transactionType: "withdrawal",
        referenceType: "withdrawal_request",
        referenceId: w.id,
        amount: -amount,
        currency: account.currency,
        status: "pending",
        description: `Withdrawal to ${destinationType} · ${destinationLabel ?? destinationRef}`,
      },
    });
    return w;
  });

  return NextResponse.json(withdrawal);
}
