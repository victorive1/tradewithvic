import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminBillingAuthorized } from "@/lib/billing/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminBillingAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const decision = body.decision as string;
  const notes = typeof body.notes === "string" ? body.notes : null;

  const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!withdrawal) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (decision === "approve") {
    // Complete: move from locked → out the door. Ledger gets the final withdrawal transaction.
    await prisma.$transaction([
      prisma.withdrawalRequest.update({
        where: { id },
        data: { status: "completed", processedAt: new Date(), reviewNotes: notes },
      }),
      prisma.billingAccount.update({
        where: { id: withdrawal.billingAccountId },
        data: { lockedBalance: { decrement: withdrawal.amount } },
      }),
      prisma.billingTransaction.updateMany({
        where: { referenceType: "withdrawal_request", referenceId: id },
        data: { status: "completed" },
      }),
      prisma.billingTransaction.create({
        data: {
          billingAccountId: withdrawal.billingAccountId,
          userKey: withdrawal.userKey,
          transactionType: "fee",
          referenceType: "withdrawal_request",
          referenceId: id,
          amount: -withdrawal.feeAmount,
          currency: withdrawal.currency,
          status: "completed",
          description: `Withdrawal fee · ${withdrawal.destinationType}`,
        },
      }),
    ]);
    return NextResponse.json({ ok: true, decision: "approved" });
  }

  if (decision === "reject") {
    // Return locked balance to available, mark withdrawal failed/rejected
    await prisma.$transaction([
      prisma.withdrawalRequest.update({
        where: { id },
        data: { status: "failed", processedAt: new Date(), statusReason: "admin_rejected", reviewNotes: notes },
      }),
      prisma.billingAccount.update({
        where: { id: withdrawal.billingAccountId },
        data: {
          lockedBalance: { decrement: withdrawal.amount },
          availableBalance: { increment: withdrawal.amount },
        },
      }),
      prisma.billingTransaction.updateMany({
        where: { referenceType: "withdrawal_request", referenceId: id },
        data: { status: "failed" },
      }),
      prisma.billingTransaction.create({
        data: {
          billingAccountId: withdrawal.billingAccountId,
          userKey: withdrawal.userKey,
          transactionType: "refund",
          referenceType: "withdrawal_request",
          referenceId: id,
          amount: withdrawal.amount,
          currency: withdrawal.currency,
          status: "completed",
          description: `Withdrawal rejected · funds returned to available${notes ? ` · ${notes}` : ""}`,
        },
      }),
    ]);
    return NextResponse.json({ ok: true, decision: "rejected" });
  }

  if (decision === "flag") {
    await prisma.withdrawalRequest.update({
      where: { id },
      data: { status: "under_review", reviewNotes: notes, statusReason: "manual_flag" },
    });
    return NextResponse.json({ ok: true, decision: "flagged" });
  }

  return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
}
