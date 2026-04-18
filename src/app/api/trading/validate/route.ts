import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUserKey } from "@/lib/trading/user-key";
import { mapSymbolForBroker } from "@/lib/trading/symbol-mapping";
import { validateOrderTicket } from "@/lib/trading/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const userKey = readUserKey(req);
  if (!userKey) return NextResponse.json({ error: "no_user_key" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const accountId = String(body.accountId ?? "");
  const account = await prisma.linkedTradingAccount.findFirst({
    where: { id: accountId, userKey, isActive: true },
  });
  if (!account) {
    return NextResponse.json({
      ok: false,
      error: "Select a valid linked trading account.",
      warnings: [],
    });
  }

  const mapping = await mapSymbolForBroker({
    internalSymbol: String(body.internalSymbol ?? ""),
    brokerName: account.brokerName,
    platformType: account.platformType as "MT4" | "MT5",
  });

  const report = validateOrderTicket(
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

  return NextResponse.json({
    ...report,
    brokerSymbol: mapping.brokerSymbol,
    mappingFound: Boolean(mapping.rule),
    contractSize: mapping.rule?.contractSize ?? null,
  });
}
