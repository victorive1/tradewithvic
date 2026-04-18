import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateBillingAccount } from "@/lib/billing/account";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const { id } = await ctx.params;
  const card = await prisma.paymentMethod.findFirst({ where: { id, billingAccountId: account.id, isActive: true } });
  if (!card) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.$transaction([
    prisma.paymentMethod.updateMany({ where: { billingAccountId: account.id, isDefault: true }, data: { isDefault: false } }),
    prisma.paymentMethod.update({ where: { id }, data: { isDefault: true } }),
  ]);
  return NextResponse.json({ ok: true });
}
