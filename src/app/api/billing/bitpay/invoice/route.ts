import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateBillingAccount } from "@/lib/billing/account";
import { isBitPayConfigured, createBitPayInvoice } from "@/lib/billing/bitpay-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  if (!isBitPayConfigured()) {
    return NextResponse.json({ error: "bitpay_not_configured" }, { status: 503 });
  }
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  const currency = (typeof body.currency === "string" ? body.currency : account.currency).toUpperCase();

  const orderId = `dep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const siteOrigin = req.nextUrl.origin;

  const invoice = await createBitPayInvoice({
    price: amount,
    currency,
    orderId,
    notificationURL: `${siteOrigin}/api/billing/bitpay/webhook`,
    redirectURL: `${siteOrigin}/dashboard/payments?deposit=bitpay&order=${orderId}`,
    itemDesc: "Account deposit",
  });

  await prisma.depositRequest.create({
    data: {
      billingAccountId: account.id,
      userKey: account.userKey,
      amount,
      currency: account.currency,
      methodType: "crypto",
      processorChargeRef: invoice.id,
      status: "pending",
      statusReason: "awaiting_bitpay_payment",
      feeAmount: 0,
      netAmount: amount,
      expiresAt: invoice.expirationTime ? new Date(invoice.expirationTime) : null,
    },
  });

  return NextResponse.json({ invoice });
}
