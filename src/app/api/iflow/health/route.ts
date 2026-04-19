import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WATCHED_SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "XAUUSD", "XAGUSD",
  "NAS100", "US30", "SPX500",
  "BTCUSD", "ETHUSD",
];

type Status = "healthy" | "degraded" | "down";

interface CheckResult {
  status: Status;
  message: string;
  detail?: any;
}

function combine(...results: CheckResult[]): Status {
  if (results.some((r) => r.status === "down")) return "down";
  if (results.some((r) => r.status === "degraded")) return "degraded";
  return "healthy";
}

function ageMs(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Date.now() - new Date(d).getTime();
}

function msToReadable(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

async function checkEngineCadence(): Promise<CheckResult> {
  const last = await prisma.flowEvent.findFirst({ orderBy: { capturedAt: "desc" } });
  const age = ageMs(last?.capturedAt);
  if (age == null) return { status: "down", message: "Engine has never produced a FlowEvent." };
  if (age > 15 * 60_000) return {
    status: "down",
    message: `Last FlowEvent was ${msToReadable(age)} ago — engine appears stalled (brain scan should fire every 2 minutes).`,
    detail: { lastCapturedAt: last?.capturedAt, ageMs: age },
  };
  if (age > 6 * 60_000) return {
    status: "degraded",
    message: `Last FlowEvent was ${msToReadable(age)} ago — cadence degraded.`,
    detail: { lastCapturedAt: last?.capturedAt, ageMs: age },
  };
  return { status: "healthy", message: `Engine firing on cadence (last event ${msToReadable(age)} ago).` };
}

async function checkActiveSignals(): Promise<CheckResult> {
  const [active, stale] = await Promise.all([
    prisma.institutionalSignal.count({ where: { active: true } }),
    prisma.institutionalSignal.count({
      where: { active: true, capturedAt: { lt: new Date(Date.now() - 2 * 60 * 60_000) } },
    }),
  ]);
  if (stale > 0) return {
    status: "degraded",
    message: `${stale} signals marked active but older than 2h — invalidator didn't run.`,
    detail: { active, stale },
  };
  return {
    status: "healthy",
    message: `${active} active signals on the board.`,
    detail: { active, stale },
  };
}

async function checkSymbolCoverage(): Promise<{
  result: CheckResult;
  perSymbol: Array<{
    symbol: string;
    status: Status;
    lastFlowAt: Date | null;
    lastFlowAgeMs: number | null;
    candleFreshnessMs: number | null;
    activeSignals: number;
    notes: string[];
  }>;
}> {
  const perSymbol: Array<any> = [];
  for (const symbol of WATCHED_SYMBOLS) {
    const notes: string[] = [];
    const [lastFlow, lastCandle, active] = await Promise.all([
      prisma.flowEvent.findFirst({
        where: { assetSymbol: symbol },
        orderBy: { capturedAt: "desc" },
      }),
      prisma.candle.findFirst({
        where: { symbol, timeframe: "5min", isClosed: true },
        orderBy: { openTime: "desc" },
      }),
      prisma.institutionalSignal.count({ where: { assetSymbol: symbol, active: true } }),
    ]);
    const flowAge = ageMs(lastFlow?.capturedAt);
    const candleAge = ageMs(lastCandle?.fetchedAt);

    let status: Status = "healthy";
    if (!lastCandle) { status = "down"; notes.push("no candles on file"); }
    else if (candleAge != null && candleAge > 20 * 60_000) { status = "degraded"; notes.push(`candles ${msToReadable(candleAge)} stale`); }
    if (!lastFlow) {
      status = status === "down" ? "down" : "degraded";
      notes.push("no flow events yet");
    } else if (flowAge != null && flowAge > 15 * 60_000) {
      status = status === "down" ? "down" : "degraded";
      notes.push(`flow ${msToReadable(flowAge)} stale`);
    }

    perSymbol.push({
      symbol,
      status,
      lastFlowAt: lastFlow?.capturedAt ?? null,
      lastFlowAgeMs: flowAge,
      candleFreshnessMs: candleAge,
      activeSignals: active,
      notes,
    });
  }

  const down = perSymbol.filter((s) => s.status === "down").length;
  const degraded = perSymbol.filter((s) => s.status === "degraded").length;
  const overall: Status = down > WATCHED_SYMBOLS.length / 2 ? "down"
    : down + degraded > 0 ? "degraded" : "healthy";
  return {
    result: {
      status: overall,
      message: `${WATCHED_SYMBOLS.length - down - degraded}/${WATCHED_SYMBOLS.length} symbols healthy · ${degraded} degraded · ${down} down`,
      detail: { down, degraded, total: WATCHED_SYMBOLS.length },
    },
    perSymbol,
  };
}

async function checkUpstream(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];

  // Last brain scan cycle
  const lastScan = await prisma.scanCycle.findFirst({ orderBy: { startedAt: "desc" } });
  const scanAge = ageMs(lastScan?.startedAt);
  if (!lastScan) out.push({ status: "down", message: "No brain scan cycle found — the engine runs inside the scan." });
  else if (scanAge == null) out.push({ status: "degraded", message: "Last scan cycle timestamp missing." });
  else if (scanAge > 10 * 60_000) out.push({
    status: "down",
    message: `Brain scan hasn't run in ${msToReadable(scanAge)} — cron is stalled.`,
    detail: { lastScan: lastScan?.startedAt, status: lastScan?.status },
  });
  else out.push({
    status: lastScan.status === "failed" ? "degraded" : "healthy",
    message: `Brain scan ran ${msToReadable(scanAge)} ago · ${lastScan.status}${lastScan.errorCount > 0 ? ` · ${lastScan.errorCount} errors` : ""}`,
    detail: { lastScan: lastScan?.startedAt, status: lastScan?.status, errors: lastScan?.errorCount },
  });

  // Regime coverage
  const regimeCount = await prisma.regimeSnapshot.count();
  if (regimeCount === 0) out.push({ status: "degraded", message: "No RegimeSnapshot rows — regime sub-score will always be 0." });
  else out.push({ status: "healthy", message: `Regime context available (${regimeCount} snapshots).` });

  // Liquidity coverage for defended/invalidation levels
  const liquidityCount = await prisma.liquidityLevel.count({ where: { status: "active" } });
  if (liquidityCount === 0) out.push({ status: "degraded", message: "No active LiquidityLevel rows — defended/invalidation levels will be null." });
  else out.push({ status: "healthy", message: `Liquidity levels tracked (${liquidityCount} active).` });

  // Catalyst coverage
  const catalystCount = await prisma.catalystEvent.count({
    where: { relevanceWindowEnd: { gte: new Date() } },
  });
  const eventRiskCount = await prisma.eventRiskSnapshot.count();
  if (catalystCount === 0 && eventRiskCount === 0) out.push({
    status: "degraded",
    message: "No active CatalystEvent and no EventRiskSnapshot — catalyst sub-score will always be 0.",
  });
  else out.push({
    status: "healthy",
    message: `Catalyst backdrop OK (${catalystCount} active catalysts · ${eventRiskCount} event-risk snapshots).`,
  });

  return out;
}

export async function GET(_req: NextRequest) {
  const startedAt = Date.now();
  try {
    const [engine, signals, coverage, upstream] = await Promise.all([
      checkEngineCadence(),
      checkActiveSignals(),
      checkSymbolCoverage(),
      checkUpstream(),
    ]);
    const overall = combine(engine, signals, coverage.result, ...upstream);

    return NextResponse.json({
      status: overall,
      checkedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      checks: {
        engineCadence: engine,
        activeSignals: signals,
        symbolCoverage: coverage.result,
        upstream,
      },
      perSymbol: coverage.perSymbol,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: "down" as Status,
      message: err?.message ?? String(err),
      checkedAt: new Date().toISOString(),
    }, { status: 500 });
  }
}
