import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateBillingAccount } from "@/lib/billing/account";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const { id } = await ctx.params;
  const card = await prisma.paymentMethod.findFirst({ where: { id, billingAccountId: account.id } });
  if (!card) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.paymentMethod.update({ where: { id }, data: { isActive: false, isDefault: false } });

  // If the removed card was default, promote the most-recent remaining card.
  if (card.isDefault) {
    const next = await prisma.paymentMethod.findFirst({
      where: { billingAccountId: account.id, isActive: true, NOT: { id } },
      orderBy: { createdAt: "desc" },
    });
    if (next) await prisma.paymentMethod.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  return NextResponse.json({ ok: true });
}
