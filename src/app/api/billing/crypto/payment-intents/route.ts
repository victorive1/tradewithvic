import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateBillingAccount } from "@/lib/billing/account";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPPORTED_CURRENCIES = new Set(["BTC", "ETH", "USDC", "USDT"]);

/**
 * Creates a crypto deposit intent. In production this would call Coinbase
 * Commerce or BTCPay to mint an invoice with a unique deposit address + TTL.
 * Sandbox mode returns a placeholder address and reserves the amount as
 * pending balance. Webhook ingestion would flip the request to completed
 * when the network confirms.
 */
export async function POST(req: NextRequest) {
  const account = await getOrCreateBillingAccount(req);
  if (!account) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  const currency = typeof body.currency === "string" && SUPPORTED_CURRENCIES.has(body.currency.toUpperCase()) ? body.currency.toUpperCase() : null;
  if (!currency) return NextResponse.json({ error: "unsupported_currency" }, { status: 400 });

  const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sandboxAddress = `${currency.toLowerCase()}-sandbox-${invoiceId}`;

  const deposit = await prisma.$transaction(async (tx: any) => {
    const d = await tx.depositRequest.create({
      data: {
        billingAccountId: account.id,
        userKey: account.userKey,
        amount,
        currency: account.currency,
        methodType: "crypto",
        processorChargeRef: invoiceId,
        status: "pending",
        statusReason: "awaiting_network_confirmation",
        feeAmount: 0,
        netAmount: amount,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    await tx.billingAccount.update({
      where: { id: account.id },
      data: { pendingBalance: { increment: amount } },
    });
    return d;
  });

  return NextResponse.json({
    deposit,
    invoice: {
      id: invoiceId,
      currency,
      amount,
      address: sandboxAddress,
      network: currency === "BTC" ? "bitcoin" : "ethereum",
      expiresAt: deposit.expiresAt,
      note: "Sandbox mode — real network integration lands with Coinbase Commerce / BTCPay in Phase 2.",
    },
  });
}
