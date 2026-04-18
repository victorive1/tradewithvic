import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateBillingAccount } from "@/lib/billing/account";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });
  const cards = await prisma.paymentMethod.findMany({
    where: { billingAccountId: account.id, methodType: "card", isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ cards });
}

/**
 * Register a card via the tokenized processor flow. The frontend is expected to
 * hand the PAN directly to the processor (Stripe Elements, Coinbase hosted, etc.)
 * and only forward the resulting token reference here. We NEVER receive or
 * persist the raw PAN or CVV.
 */
export async function POST(req: NextRequest) {
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body.processorTokenRef === "string" ? body.processorTokenRef : null;
  if (!token) return NextResponse.json({ error: "missing_processor_token" }, { status: 400 });

  const last4 = typeof body.last4 === "string" && /^\d{4}$/.test(body.last4) ? body.last4 : null;
  const brand = typeof body.brand === "string" ? body.brand.slice(0, 40) : null;
  const expiryMonth = Number.isInteger(body.expiryMonth) && body.expiryMonth >= 1 && body.expiryMonth <= 12 ? body.expiryMonth : null;
  const expiryYear = Number.isInteger(body.expiryYear) && body.expiryYear >= new Date().getFullYear() ? body.expiryYear : null;
  const nickname = typeof body.nickname === "string" ? body.nickname.slice(0, 40) : null;
  const processorName = typeof body.processorName === "string" ? body.processorName.slice(0, 30) : "manual";

  // If this is the account's first active card, mark it default.
  const existing = await prisma.paymentMethod.count({
    where: { billingAccountId: account.id, methodType: "card", isActive: true },
  });

  const card = await prisma.paymentMethod.create({
    data: {
      billingAccountId: account.id,
      methodType: "card",
      processorName,
      processorTokenRef: token,
      brand,
      last4,
      expiryMonth,
      expiryYear,
      nickname,
      isDefault: existing === 0,
    },
  });

  return NextResponse.json(card);
}
