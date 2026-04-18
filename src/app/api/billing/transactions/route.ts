import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateBillingAccount } from "@/lib/billing/account";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const status = sp.get("status");
  const take = Math.min(200, parseInt(sp.get("take") ?? "50"));

  const transactions = await prisma.billingTransaction.findMany({
    where: {
      billingAccountId: account.id,
      ...(type ? { transactionType: type } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({ transactions });
}
