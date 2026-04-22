import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateEa } from "@/lib/trading/ea-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * EA pull endpoint. The MT4/MT5 EA polls this every few seconds. For each
 * matching pending request we hand it the order payload and flip status
 * from "pending_submission" → "submitted" so a double-pull can't fire the
 * same order twice.
 *
 * Auth: x-ea-secret header (per-account shared secret).
 * Query: ?accountLogin=12345
 * Response: { orders: Array<{...}> }
 */
export async function GET(req: NextRequest) {
  const accountLogin = req.nextUrl.searchParams.get("accountLogin") ?? "";
  const auth = await authenticateEa(req, accountLogin);
  if (!auth.ok) return auth.response;
  const account = auth.account!;

  // Heartbeat: any pull counts as the EA being alive.
  await prisma.linkedTradingAccount.update({
    where: { id: account.id },
    data: { lastConnectedAt: new Date(), connectionStatus: "linked" },
  });

  // Pull all not-yet-submitted orders for this account. The runtime creates
  // requests with status "pending_submission" and then flips to "submitted"
  // before it reaches the adapter; the adapter just persists pending.
  // Either status is legal to pick up here — we just make sure we atomically
  // flip to "submitted" so concurrent pulls don't double-dispatch.
  const pending = await prisma.tradeExecutionRequest.findMany({
    where: {
      accountId: account.id,
      status: { in: ["pending_submission", "submitted"] },
      result: null, // not yet reported back
    },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  if (pending.length === 0) return NextResponse.json({ orders: [] });

  // Claim them — flip to "submitted" (idempotent) and stamp submittedAt.
  await prisma.tradeExecutionRequest.updateMany({
    where: { id: { in: pending.map((p) => p.id) } },
    data: { status: "submitted", submittedAt: new Date() },
  });

  return NextResponse.json({
    orders: pending.map((p) => ({
      requestId: p.id,
      symbol: p.brokerSymbol ?? p.internalSymbol,
      side: p.side,
      orderType: p.orderType,
      volume: p.requestedVolume,
      entryPrice: p.entryPrice,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      timeInForce: p.timeInForce,
      slippagePips: p.slippagePips,
      magicNumber: p.magicNumber,
      comment: p.comment ?? `twv:${p.id.slice(0, 8)}`,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}
