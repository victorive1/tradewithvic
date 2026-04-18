import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateBillingAccount } from "@/lib/billing/account";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const [paymentMethods, recentTransactions, pendingDeposits, pendingWithdrawals, adminSettings] = await Promise.all([
    prisma.paymentMethod.findMany({
      where: { billingAccountId: account.id, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.billingTransaction.findMany({
      where: { billingAccountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.depositRequest.count({
      where: { billingAccountId: account.id, status: { in: ["initiated", "pending", "under_review"] } },
    }),
    prisma.withdrawalRequest.count({
      where: { billingAccountId: account.id, status: { in: ["initiated", "pending", "under_review"] } },
    }),
    prisma.billingAdminSetting.findMany(),
  ]);

  const settings: Record<string, any> = {};
  for (const s of adminSettings) settings[s.paymentMethodKey] = s;

  return NextResponse.json({
    account,
    paymentMethods,
    recentTransactions,
    pendingDeposits,
    pendingWithdrawals,
    settings,
    fetchedAt: Date.now(),
  });
}
