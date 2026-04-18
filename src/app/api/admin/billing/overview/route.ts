import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminBillingAuthorized } from "@/lib/billing/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isAdminBillingAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    accounts,
    pendingWithdrawals,
    underReviewWithdrawals,
    completedDepositsAgg,
    completedWithdrawalsAgg,
    feeAgg,
    deposits24h,
    withdrawals24h,
    failedDeposits,
    failedWithdrawals,
    recentWebhooks,
    openSettingsCount,
    disabledSettingsCount,
  ] = await Promise.all([
    prisma.billingAccount.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.withdrawalRequest.count({ where: { status: "initiated" } }),
    prisma.withdrawalRequest.count({ where: { status: "under_review" } }),
    prisma.billingTransaction.aggregate({
      where: { transactionType: "deposit", status: "completed" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.billingTransaction.aggregate({
      where: { transactionType: "withdrawal" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.billingTransaction.aggregate({
      where: { transactionType: "fee" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.billingTransaction.count({ where: { transactionType: "deposit", createdAt: { gte: since24h } } }),
    prisma.billingTransaction.count({ where: { transactionType: "withdrawal", createdAt: { gte: since24h } } }),
    prisma.depositRequest.count({ where: { status: "failed", createdAt: { gte: since7d } } }),
    prisma.withdrawalRequest.count({ where: { status: "failed", createdAt: { gte: since7d } } }),
    prisma.billingWebhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 10 }),
    prisma.billingAdminSetting.count({ where: { isEnabled: true } }),
    prisma.billingAdminSetting.count({ where: { isEnabled: false } }),
  ]);

  const totalAvailable = accounts.reduce((s: number, a: any) => s + a.availableBalance, 0);
  const totalPending = accounts.reduce((s: number, a: any) => s + a.pendingBalance, 0);
  const totalLocked = accounts.reduce((s: number, a: any) => s + a.lockedBalance, 0);
  const accountCount = await prisma.billingAccount.count();

  return NextResponse.json({
    platform: {
      accountCount,
      totalAvailable,
      totalPending,
      totalLocked,
      totalHeld: totalAvailable + totalPending + totalLocked,
    },
    queues: {
      initiatedWithdrawals: pendingWithdrawals,
      underReviewWithdrawals,
      failedDeposits7d: failedDeposits,
      failedWithdrawals7d: failedWithdrawals,
    },
    cashflow: {
      totalDepositsCount: completedDepositsAgg._count,
      totalDepositsAmount: completedDepositsAgg._sum.amount ?? 0,
      totalWithdrawalsCount: completedWithdrawalsAgg._count,
      totalWithdrawalsAmount: Math.abs(completedWithdrawalsAgg._sum.amount ?? 0),
      totalFeesCount: feeAgg._count,
      totalFeesAmount: Math.abs(feeAgg._sum.amount ?? 0),
      deposits24h,
      withdrawals24h,
    },
    settings: { enabled: openSettingsCount, disabled: disabledSettingsCount },
    accounts: accounts.slice(0, 10),
    recentWebhooks,
    fetchedAt: Date.now(),
  });
}
