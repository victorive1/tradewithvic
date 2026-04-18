import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBitPayInvoice, isBitPayConfigured } from "@/lib/billing/bitpay-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * BitPay IPN handler. Configure in the BitPay merchant dashboard so every
 * invoice status change hits this URL. We RE-FETCH the invoice from BitPay
 * by ID before crediting — never trust the webhook body for amount/status;
 * treat it purely as a "something changed, go look" notification.
 */
export async function POST(req: NextRequest) {
  if (!isBitPayConfigured()) {
    return NextResponse.json({ error: "bitpay_not_configured" }, { status: 503 });
  }

  const raw = await req.text();
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch {}

  const invoiceId = payload?.data?.id ?? payload?.id;
  if (!invoiceId) return NextResponse.json({ error: "missing_invoice_id" }, { status: 400 });

  // Log for audit / idempotency
  const eventRef = `${invoiceId}_${payload?.event?.name ?? "unknown"}`;
  const existing = await prisma.billingWebhookEvent.findFirst({
    where: { providerName: "bitpay", eventRef },
  });
  if (existing?.processingStatus === "processed") {
    return NextResponse.json({ ok: true, deduped: true });
  }
  const row = existing
    ? existing
    : await prisma.billingWebhookEvent.create({
        data: {
          providerName: "bitpay",
          eventType: payload?.event?.name ?? "invoice_updated",
          eventRef,
          payloadJson: raw,
          processingStatus: "pending",
        },
      });

  try {
    // Re-fetch invoice from BitPay — do not trust webhook body with amounts/statuses.
    const invoice = await getBitPayInvoice(invoiceId);
    if (!invoice) throw new Error("invoice_not_found_at_bitpay");

    const deposit = await prisma.depositRequest.findFirst({ where: { processorChargeRef: invoiceId } });
    if (!deposit) throw new Error("deposit_record_not_found");

    if (deposit.status !== "completed" && (invoice.status === "paid" || invoice.status === "confirmed" || invoice.status === "complete")) {
      await prisma.$transaction([
        prisma.depositRequest.update({
          where: { id: deposit.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            statusReason: `bitpay_status_${invoice.status}`,
            netAmount: invoice.price,
          },
        }),
        prisma.billingAccount.update({
          where: { id: deposit.billingAccountId },
          data: { availableBalance: { increment: invoice.price } },
        }),
        prisma.billingTransaction.create({
          data: {
            billingAccountId: deposit.billingAccountId,
            userKey: deposit.userKey,
            transactionType: "deposit",
            referenceType: "deposit_request",
            referenceId: deposit.id,
            amount: invoice.price,
            currency: deposit.currency,
            status: "completed",
            description: `BitPay ${invoice.currency} deposit · ${invoice.id}`,
            metadataJson: JSON.stringify({ bitpayInvoiceId: invoice.id, bitpayStatus: invoice.status }),
          },
        }),
      ]);
    } else if (invoice.status === "expired" || invoice.status === "invalid") {
      await prisma.depositRequest.update({
        where: { id: deposit.id },
        data: { status: "failed", statusReason: `bitpay_${invoice.status}` },
      });
    }

    await prisma.billingWebhookEvent.update({
      where: { id: row.id },
      data: { processingStatus: "processed", processedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await prisma.billingWebhookEvent.update({
      where: { id: row.id },
      data: { processingStatus: "failed", processingError: err?.message ?? String(err) },
    });
    return NextResponse.json({ error: err?.message ?? "processing_failed" }, { status: 500 });
  }
}
