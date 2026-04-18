import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUserKey } from "@/lib/trading/user-key";
import { mapSymbolForBroker } from "@/lib/trading/symbol-mapping";
import { validateOrderTicket } from "@/lib/trading/validation";
import { resolveAdapter, type NormalizedOrder } from "@/lib/trading/adapter";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * Submit a trade execution request (spec §3, §4).
 *
 * Flow:
 *   1. Authenticate + load linked account
 *   2. Re-validate the ticket server-side (never trust client)
 *   3. Create TradeExecutionRequest row (status=pending_submission)
 *   4. Log "created" audit event
 *   5. Resolve adapter + submit → AdapterResult
 *   6. Persist TradeExecutionResult + update request.status
 *   7. Log adapter ack/fill/reject event
 *   8. Return request + result to the UI
 */
export async function POST(req: NextRequest) {
  const userKey = readUserKey(req);
  if (!userKey) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId ?? "");
  const account = await prisma.linkedTradingAccount.findFirst({
    where: { id: accountId, userKey, isActive: true },
  });
  if (!account) return NextResponse.json({ error: "invalid_account" }, { status: 400 });

  if (account.connectionStatus !== "linked") {
    return NextResponse.json({
      error: "account_not_connected",
      message: `Account ${account.accountLogin} is ${account.connectionStatus}. Reconnect before executing.`,
    }, { status: 409 });
  }

  const mapping = await mapSymbolForBroker({
    internalSymbol: String(body.internalSymbol ?? ""),
    brokerName: account.brokerName,
    platformType: account.platformType as "MT4" | "MT5",
  });

  const validation = validateOrderTicket(
    {
      accountId,
      internalSymbol: String(body.internalSymbol ?? ""),
      side: body.side,
      orderType: body.orderType,
      requestedVolume: Number(body.requestedVolume),
      sizingMode: body.sizingMode ?? "fixed_lots",
      riskPercent: body.riskPercent != null ? Number(body.riskPercent) : undefined,
      entryPrice: body.entryPrice != null ? Number(body.entryPrice) : null,
      stopLoss: body.stopLoss != null ? Number(body.stopLoss) : null,
      takeProfit: body.takeProfit != null ? Number(body.takeProfit) : null,
      timeInForce: body.timeInForce ?? "gtc",
      slippagePips: body.slippagePips != null ? Number(body.slippagePips) : null,
      currentPrice: body.currentPrice != null ? Number(body.currentPrice) : null,
      accountBalance: body.accountBalance != null ? Number(body.accountBalance) : null,
    },
    {
      digits: mapping.rule?.digits ?? null,
      minVolume: mapping.rule?.minVolume ?? null,
      maxVolume: mapping.rule?.maxVolume ?? null,
      volumeStep: mapping.rule?.volumeStep ?? null,
    },
  );
  if (!validation.ok) {
    return NextResponse.json({ error: "validation_failed", message: validation.error }, { status: 400 });
  }

  const request = await prisma.tradeExecutionRequest.create({
    data: {
      userKey,
      accountId,
      internalSymbol: String(body.internalSymbol ?? ""),
      brokerSymbol: mapping.brokerSymbol,
      side: body.side,
      orderType: body.orderType,
      requestedVolume: Number(body.requestedVolume),
      sizingMode: body.sizingMode ?? "fixed_lots",
      riskPercent: body.riskPercent != null ? Number(body.riskPercent) : null,
      entryPrice: body.entryPrice != null ? Number(body.entryPrice) : null,
      stopLoss: body.stopLoss != null ? Number(body.stopLoss) : null,
      takeProfit: body.takeProfit != null ? Number(body.takeProfit) : null,
      timeInForce: body.timeInForce ?? "gtc",
      slippagePips: body.slippagePips != null ? Number(body.slippagePips) : null,
      comment: body.comment ?? null,
      magicNumber: body.magicNumber ?? null,
      sourceType: body.sourceType ?? "manual",
      sourceRef: body.sourceRef ?? null,
      status: "pending_submission",
    },
  });

  await prisma.tradeExecutionAuditLog.create({
    data: {
      requestId: request.id,
      eventType: "created",
      actor: "user",
      payloadJson: JSON.stringify({
        warnings: validation.warnings,
        mappingFound: Boolean(mapping.rule),
        brokerSymbol: mapping.brokerSymbol,
      }),
    },
  });

  // Resolve adapter + submit to the bridge.
  const adapter = resolveAdapter(account.adapterKind);
  const normalized: NormalizedOrder = {
    requestId: request.id,
    brokerSymbol: mapping.brokerSymbol,
    side: body.side,
    orderType: body.orderType,
    volume: Number(body.requestedVolume),
    entryPrice: body.entryPrice != null ? Number(body.entryPrice) : null,
    stopLoss: body.stopLoss != null ? Number(body.stopLoss) : null,
    takeProfit: body.takeProfit != null ? Number(body.takeProfit) : null,
    timeInForce: body.timeInForce ?? "gtc",
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    slippagePips: body.slippagePips != null ? Number(body.slippagePips) : null,
    magicNumber: body.magicNumber ?? null,
    comment: body.comment ?? null,
  };

  await prisma.tradeExecutionRequest.update({
    where: { id: request.id },
    data: { status: "submitted", submittedAt: new Date() },
  });
  await prisma.tradeExecutionAuditLog.create({
    data: {
      requestId: request.id,
      eventType: "submitted",
      actor: "system",
      payloadJson: JSON.stringify({ adapterKind: account.adapterKind }),
    },
  });

  let adapterResult;
  try {
    adapterResult = await adapter.submit(normalized, {
      accountLogin: account.accountLogin,
      brokerName: account.brokerName,
      serverName: account.serverName,
      platformType: account.platformType as "MT4" | "MT5",
      adapterConfigJson: account.adapterConfigJson,
    });
  } catch (err: any) {
    adapterResult = {
      executionStatus: "error" as const,
      rejectionReason: err?.message ?? "adapter_threw",
      adapterResponse: { error: String(err) },
    };
  }

  const result = await prisma.tradeExecutionResult.create({
    data: {
      requestId: request.id,
      executionStatus: adapterResult.executionStatus,
      brokerTicketRef: adapterResult.brokerTicketRef ?? null,
      fillPrice: adapterResult.fillPrice ?? null,
      filledVolume: adapterResult.filledVolume ?? null,
      remainingVolume: adapterResult.remainingVolume ?? null,
      slippagePips: adapterResult.slippagePips ?? null,
      commissionCost: adapterResult.commissionCost ?? null,
      swap: adapterResult.swap ?? null,
      rejectionReason: adapterResult.rejectionReason ?? null,
      adapterResponse: adapterResult.adapterResponse
        ? JSON.stringify(adapterResult.adapterResponse).slice(0, 4000)
        : null,
    },
  });

  const nextStatus =
    adapterResult.executionStatus === "accepted" ? "filled" :
    adapterResult.executionStatus === "partial"  ? "filled" :
    adapterResult.executionStatus === "pending"  ? "submitted" :
    adapterResult.executionStatus === "rejected" ? "rejected" :
    "failed";

  await prisma.tradeExecutionRequest.update({
    where: { id: request.id },
    data: { status: nextStatus, statusReason: adapterResult.rejectionReason ?? null },
  });

  const eventType =
    adapterResult.executionStatus === "accepted" || adapterResult.executionStatus === "partial" ? "fill" :
    adapterResult.executionStatus === "rejected" ? "reject" :
    adapterResult.executionStatus === "error"    ? "error" :
    "ack";
  await prisma.tradeExecutionAuditLog.create({
    data: {
      requestId: request.id,
      eventType,
      actor: "adapter",
      payloadJson: JSON.stringify({
        executionStatus: adapterResult.executionStatus,
        brokerTicketRef: adapterResult.brokerTicketRef,
        fillPrice: adapterResult.fillPrice,
        rejectionReason: adapterResult.rejectionReason,
      }),
    },
  });

  const finalRequest = await prisma.tradeExecutionRequest.findUnique({ where: { id: request.id } });
  return NextResponse.json({
    request: finalRequest,
    result,
    warnings: validation.warnings,
  });
}
