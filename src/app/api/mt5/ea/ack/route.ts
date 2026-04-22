import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateEa } from "@/lib/trading/ea-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * EA ack endpoint. The EA calls this after it attempts an order locally
 * in MT4/MT5 — either with a successful fill or with an error.
 *
 * Auth: x-ea-secret header.
 * Body:
 *   {
 *     accountLogin: "12345",
 *     requestId: "cmo...",
 *     executionStatus: "filled" | "rejected" | "partial" | "error",
 *     brokerTicketRef?: string,
 *     fillPrice?: number,
 *     filledVolume?: number,
 *     remainingVolume?: number,
 *     slippagePips?: number,
 *     commissionCost?: number,
 *     swap?: number,
 *     rejectionReason?: string,
 *     adapterResponse?: object  // raw MT5 return for forensic logs
 *   }
 *
 * Writes TradeExecutionResult + flips the matching TradeExecutionRequest
 * status. Idempotent by (requestId) — duplicate acks for the same request
 * are ignored.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const accountLogin = String(body.accountLogin ?? "");
  const auth = await authenticateEa(req, accountLogin);
  if (!auth.ok) return auth.response;
  const account = auth.account!;

  const requestId = String(body.requestId ?? "");
  if (!requestId) {
    return NextResponse.json({ error: "missing_request_id" }, { status: 400 });
  }

  const request = await prisma.tradeExecutionRequest.findFirst({
    where: { id: requestId, accountId: account.id },
    include: { result: true },
  });
  if (!request) {
    return NextResponse.json({ error: "request_not_found_for_account" }, { status: 404 });
  }
  if (request.result) {
    // Idempotent: already acknowledged — return the existing result.
    return NextResponse.json({ ok: true, alreadyAcked: true, result: request.result });
  }

  // Normalize the EA's reported status to the schema's allowed set:
  // accepted | rejected | partial | pending | error. "filled" from the EA
  // maps to "accepted" on the result row.
  const rawStatus = String(body.executionStatus ?? "").toLowerCase();
  const execStatus =
    rawStatus === "filled" ? "accepted"
    : ["accepted", "rejected", "partial", "pending", "error"].includes(rawStatus)
    ? rawStatus
    : "error";

  const toNum = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const result = await prisma.tradeExecutionResult.create({
    data: {
      requestId: request.id,
      executionStatus: execStatus,
      brokerTicketRef: typeof body.brokerTicketRef === "string" ? body.brokerTicketRef : null,
      fillPrice: toNum(body.fillPrice),
      filledVolume: toNum(body.filledVolume),
      remainingVolume: toNum(body.remainingVolume),
      slippagePips: toNum(body.slippagePips),
      commissionCost: toNum(body.commissionCost),
      swap: toNum(body.swap),
      rejectionReason: typeof body.rejectionReason === "string" ? body.rejectionReason : null,
      adapterResponse: body.adapterResponse ? JSON.stringify(body.adapterResponse).slice(0, 4000) : null,
    },
  });

  // Map adapter status → request status.
  const nextStatus =
    execStatus === "accepted" ? "filled"
    : execStatus === "partial" ? "submitted"
    : execStatus === "rejected" ? "rejected"
    : "failed";
  const statusReason = typeof body.rejectionReason === "string" ? body.rejectionReason : null;

  await prisma.tradeExecutionRequest.update({
    where: { id: request.id },
    data: { status: nextStatus, statusReason },
  });

  await prisma.linkedTradingAccount.update({
    where: { id: account.id },
    data: { lastConnectedAt: new Date(), connectionStatus: "linked" },
  });

  return NextResponse.json({ ok: true, result });
}
