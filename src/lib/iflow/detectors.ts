/**
 * Detectors that derive Flow-Capture (L1) evidence from the data we already
 * have in the brain (MarketSnapshot + Candle + StructureEvent + LiquidityEvent).
 * These are *inference heuristics* — not true order-book reads. Real feeds
 * (broker book, exchange tape) plug in through the same interface later.
 */

import { prisma } from "@/lib/prisma";

export interface FlowEvidence {
  assetSymbol: string;
  session: string;
  side: "buy" | "sell" | "neutral";
  aggressorRatio: number;
  sweepCount: number;
  spreadBps: number | null;
  orderBookImbalance: number | null;
  vwapDistance: number | null;
  absorptionScore: number;
  refillScore: number;
  rawNotional: number;
}

function sessionNow(): string {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7) return "asia";
  if (h >= 7 && h < 12) return "london";
  if (h >= 12 && h < 16) return "overlap";
  if (h >= 16 && h < 21) return "newyork";
  return "after_hours";
}

/**
 * Derive flow-capture evidence for one symbol from recent candles + structure/
 * liquidity events. Returns null if we don't have enough data to reason.
 */
export async function deriveFlowEvidence(symbol: string): Promise<FlowEvidence | null> {
  // Grab the last ~24 closed 5-min candles — ~2h of session context.
  const candles = await prisma.candle.findMany({
    where: { symbol, timeframe: "5min", isClosed: true },
    orderBy: { openTime: "desc" },
    take: 24,
  });
  if (candles.length < 6) return null;
  const recent = [...candles].reverse();

  // Aggressor ratio from candle body bias. A long green body = buyer aggression.
  // Weighted by body size so doji candles don't dominate.
  let buyPressure = 0, sellPressure = 0, totalWeight = 0;
  for (const c of recent) {
    const body = c.close - c.open;
    const range = Math.max(c.high - c.low, 1e-9);
    const weight = Math.abs(body) / range;
    totalWeight += weight;
    if (body > 0) buyPressure += weight;
    else if (body < 0) sellPressure += weight;
  }
  const aggressorRatio = totalWeight > 0 ? (buyPressure - sellPressure) / totalWeight : 0;

  // Session VWAP approximation from candles in session
  const typical = recent.map((c) => (c.high + c.low + c.close) / 3);
  const vols = recent.map((c) => Math.max(c.volume, 1));
  const vwap = typical.reduce((s, p, i) => s + p * vols[i], 0) / vols.reduce((s, v) => s + v, 0);
  const last = recent[recent.length - 1];
  const vwapDistance = vwap > 0 ? ((last.close - vwap) / vwap) * 100 : null;

  // Sweep count — use LiquidityEvent sweeps in the last hour
  const sweeps = await prisma.liquidityEvent.count({
    where: { symbol, detectedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });

  // Absorption: candles with big upper/lower wicks vs body — price rejected
  // at a level where a large passive hand probably sat.
  let absorptionHits = 0;
  for (const c of recent.slice(-6)) {
    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const dominantWick = Math.max(upperWick, lowerWick);
    if (body > 0 && dominantWick / body > 1.8) absorptionHits++;
  }
  const absorptionScore = Math.min(100, (absorptionHits / 6) * 100);

  // Refill: successive lows/highs holding within a tight band = repeated bids/offers
  const last6Lows = recent.slice(-6).map((c) => c.low);
  const last6Highs = recent.slice(-6).map((c) => c.high);
  const lowBand = Math.max(...last6Lows) - Math.min(...last6Lows);
  const highBand = Math.max(...last6Highs) - Math.min(...last6Highs);
  const avgRange = recent.reduce((s, c) => s + (c.high - c.low), 0) / recent.length;
  const refillScore = avgRange > 0
    ? Math.min(100, Math.max(0, 100 - (Math.min(lowBand, highBand) / avgRange) * 50))
    : 0;

  // Raw notional relative to recent median of summed 5-min volumes
  const recentVolSum = recent.slice(-6).reduce((s, c) => s + c.volume, 0);
  const historicalMedian = (() => {
    const sums: number[] = [];
    for (let i = 0; i <= recent.length - 6; i++) {
      sums.push(recent.slice(i, i + 6).reduce((s, c) => s + c.volume, 0));
    }
    sums.sort((a, b) => a - b);
    return sums[Math.floor(sums.length / 2)] ?? 1;
  })();
  const rawNotional = historicalMedian > 0 ? recentVolSum / historicalMedian : 1;

  return {
    assetSymbol: symbol,
    session: sessionNow(),
    side: aggressorRatio > 0.15 ? "buy" : aggressorRatio < -0.15 ? "sell" : "neutral",
    aggressorRatio,
    sweepCount: sweeps,
    spreadBps: null,
    orderBookImbalance: null,
    vwapDistance,
    absorptionScore,
    refillScore,
    rawNotional,
  };
}

const CROSS_ASSET_MAP: Record<string, Array<{ symbol: string; sign: 1 | -1 }>> = {
  // FX majors — DXY inverse, correlated crosses
  EURUSD: [{ symbol: "GBPUSD", sign: 1 }, { symbol: "USDCHF", sign: -1 }, { symbol: "AUDUSD", sign: 1 }],
  GBPUSD: [{ symbol: "EURUSD", sign: 1 }, { symbol: "USDCHF", sign: -1 }],
  USDJPY: [{ symbol: "USDCHF", sign: 1 }, { symbol: "XAUUSD", sign: -1 }],
  AUDUSD: [{ symbol: "NZDUSD", sign: 1 }, { symbol: "EURUSD", sign: 1 }],
  // Metals
  XAUUSD: [{ symbol: "XAGUSD", sign: 1 }, { symbol: "USDJPY", sign: -1 }],
  XAGUSD: [{ symbol: "XAUUSD", sign: 1 }],
  // Indices — correlated broad-market
  NAS100: [{ symbol: "SPX500", sign: 1 }, { symbol: "US30", sign: 1 }],
  SPX500: [{ symbol: "NAS100", sign: 1 }, { symbol: "US30", sign: 1 }],
  US30:   [{ symbol: "SPX500", sign: 1 }, { symbol: "NAS100", sign: 1 }],
  // Crypto
  BTCUSD: [{ symbol: "ETHUSD", sign: 1 }],
  ETHUSD: [{ symbol: "BTCUSD", sign: 1 }],
};

/**
 * Cross-asset confirmation (L3). Returns value in [-1, 1] — share of
 * correlated assets that agree with the direction implied by this symbol's
 * recent price action. null if no related assets are mapped or we lack data.
 */
export async function deriveCrossAssetAgreement(
  symbol: string,
  direction: "long" | "short" | "neutral",
): Promise<number | null> {
  const related = CROSS_ASSET_MAP[symbol];
  if (!related || related.length === 0 || direction === "neutral") return null;

  // For each related symbol, compute its last-hour return sign.
  const since = new Date(Date.now() - 60 * 60 * 1000);
  let agreeing = 0, total = 0;
  for (const r of related) {
    const candles = await prisma.candle.findMany({
      where: { symbol: r.symbol, timeframe: "5min", isClosed: true, openTime: { gte: since } },
      orderBy: { openTime: "asc" },
    });
    if (candles.length < 2) continue;
    const change = candles[candles.length - 1].close - candles[0].open;
    const relDir = change > 0 ? 1 : change < 0 ? -1 : 0;
    const selfDir = direction === "long" ? 1 : -1;
    if (relDir === 0) continue;
    // Apply correlation sign: negative correlations agree when they move opposite
    const matches = (relDir * r.sign) === selfDir;
    if (matches) agreeing++;
    total++;
  }
  if (total === 0) return null;
  return (agreeing / total) * 2 - 1;
}

/**
 * Catalyst lookup (L6) — active event in the window for this asset.
 * Reads from the existing FundamentalEvent + EventRiskSnapshot tables plus
 * the new CatalystEvent table.
 */
export async function findActiveCatalyst(symbol: string): Promise<{
  surpriseScore: number | null;
  severity: "low" | "medium" | "high" | null;
  sentiment: "bullish" | "bearish" | "neutral" | null;
  inWindow: boolean;
} | null> {
  const now = new Date();
  // Check dedicated CatalystEvent table first
  const active = await prisma.catalystEvent.findFirst({
    where: {
      assetSymbol: symbol,
      relevanceWindowStart: { lte: now },
      relevanceWindowEnd: { gte: now },
    },
    orderBy: { capturedAt: "desc" },
  });
  if (active) {
    return {
      surpriseScore: active.surpriseScore ?? null,
      severity: active.severity as any,
      sentiment: active.sentiment as any,
      inWindow: true,
    };
  }

  // Fall back to existing EventRiskSnapshot (news filter signals)
  const eventRisk = await prisma.eventRiskSnapshot.findFirst({
    where: {
      symbol,
      computedAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) },
    },
    orderBy: { computedAt: "desc" },
  });
  if (!eventRisk) return null;
  return {
    surpriseScore: null,
    severity: (eventRisk.riskLevel as any) ?? "medium",
    sentiment: "neutral",
    inWindow: eventRisk.riskLevel === "high" || eventRisk.riskLevel === "medium",
  };
}

export async function readRegimeContext(symbol: string): Promise<{
  trendStrength: number | null;
  volatilityZscore: number | null;
  liquidityOk: boolean;
} | null> {
  const snap = await prisma.regimeSnapshot.findFirst({
    where: { symbol },
    orderBy: { computedAt: "desc" },
  });
  if (!snap) return null;
  // Convert string trend-strength into a 0-100 number.
  const trendMap: Record<string, number> = { none: 10, weak: 30, moderate: 60, strong: 85 };
  const trendStrength = trendMap[snap.trendStrength] ?? null;
  // Derive a rough volatility z from atrPercent vs regime buckets.
  const vol = snap.atrPercent ?? null;
  const volatilityZscore = vol != null
    ? snap.volatilityRegime === "spike" ? 2.5
    : snap.volatilityRegime === "high" ? 1.3
    : snap.volatilityRegime === "low" ? -1 : 0
    : null;
  const liquidityOk = !snap.unstable;
  return { trendStrength, volatilityZscore, liquidityOk };
}
