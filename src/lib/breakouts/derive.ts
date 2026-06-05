import { ALL_INSTRUMENTS } from "@/lib/constants";
import type { MarketQuote } from "@/lib/market-data";

// Pure breakout derivation, extracted from the Breakouts page so it can run
// server-side (in /api/market/breakouts) for backlog capture as well as
// client-side for display.

export const breakoutTypes = ["All", "Structure", "Momentum", "Range", "Retest", "FVG"] as const;
export type BreakoutType = (typeof breakoutTypes)[number];

export interface Breakout {
  symbol: string; // canonical (EURUSD)
  displayName: string; // formatted (EUR/USD)
  type: Exclude<BreakoutType, "All">;
  direction: "Bullish" | "Bearish";
  timeframe: string;
  htfBias: string;
  confidence: "A+" | "A" | "B+" | "B";
  score: number;
  zone: string;
  posted: string;
  reasoning: string;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  decimals: number;
  price: number;
  changePct: number;
  // Real, immutable first-dropped instant (ISO), attached by the API from
  // the backlog capture. Absent until persisted.
  firstDroppedAt?: string | null;
}

function timeframeForMove(absChange: number): string {
  // Rough heuristic: big % moves read as higher-TF breakouts, small ones as intraday.
  if (absChange > 1.5) return "4h";
  if (absChange > 0.6) return "1h";
  if (absChange > 0.25) return "15m";
  return "5m";
}

/**
 * Derive a live breakout signal from a single MarketQuote. Returns null if
 * the quote doesn't represent a current breakout — no signal is the honest
 * answer when the market is range-bound.
 */
export function deriveBreakout(q: MarketQuote): Breakout | null {
  const changePct = q.changePercent ?? 0;
  const absChange = Math.abs(changePct);
  const range = (q.high ?? 0) - (q.low ?? 0);
  if (!q.price || range <= 0) return null;

  const pricePos = (q.price - q.low) / range;
  const rangePct = (range / q.price) * 100;

  const isBullish = changePct > 0.25 && pricePos > 0.7;
  const isBearish = changePct < -0.25 && pricePos < 0.3;
  if (!isBullish && !isBearish) return null;

  const direction: "Bullish" | "Bearish" = isBullish ? "Bullish" : "Bearish";
  const inst = ALL_INSTRUMENTS.find((i) => i.symbol === q.symbol);
  const decimals = inst?.decimals ?? 2;

  let type: Exclude<BreakoutType, "All"> = "Structure";
  if (absChange > 0.75) type = "Momentum";
  else if (rangePct > 0.9) type = "Range";
  else if (pricePos > 0.6 && pricePos < 0.85 && isBullish) type = "Retest";
  else if (pricePos > 0.15 && pricePos < 0.4 && isBearish) type = "Retest";
  else if (rangePct > 0.45) type = "FVG";

  const score = Math.min(
    100,
    Math.round(40 + absChange * 22 + (pricePos > 0.85 || pricePos < 0.15 ? 15 : 6) + Math.min(18, rangePct * 12)),
  );
  const confidence: Breakout["confidence"] =
    score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B+" : "B";

  const entry = q.price;
  const entryBand = Math.max(range * 0.03, q.price * 0.0005);
  const entryLow = entry - entryBand;
  const entryHigh = entry + entryBand;
  const stopLoss = isBullish ? q.low - range * 0.12 : q.high + range * 0.12;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit1 = isBullish ? entry + risk * 1.5 : entry - risk * 1.5;
  const takeProfit2 = isBullish ? entry + risk * 2.5 : entry - risk * 2.5;

  const tf = timeframeForMove(absChange);
  const htfBias = isBullish
    ? `Bullish session (${absChange.toFixed(2)}%)`
    : `Bearish session (${absChange.toFixed(2)}%)`;
  const zone = isBullish
    ? pricePos > 0.9
      ? "Breaking Session High"
      : "Leaving Demand Zone"
    : pricePos < 0.1
      ? "Breaking Session Low"
      : "Rejecting Supply Zone";

  const reasoning = isBullish
    ? `${q.displayName} is pressing ${pricePos > 0.9 ? "into session highs" : "toward session highs"} with a ${absChange.toFixed(2)}% move over the session (range ${rangePct.toFixed(2)}%). Price is sitting at ${(pricePos * 100).toFixed(0)}% of the day's range, consistent with a ${type.toLowerCase()} breakout. Stop sits beneath the session demand; targets step at 1R / 2R.`
    : `${q.displayName} is pressing ${pricePos < 0.1 ? "into session lows" : "toward session lows"} with a ${absChange.toFixed(2)}% decline over the session (range ${rangePct.toFixed(2)}%). Price is sitting at ${(pricePos * 100).toFixed(0)}% of the day's range, consistent with a ${type.toLowerCase()} breakout. Stop sits above the session supply; targets step at 1R / 2R.`;

  return {
    symbol: q.symbol,
    displayName: q.displayName,
    type,
    direction,
    timeframe: tf,
    htfBias,
    confidence,
    score,
    zone,
    posted: "live",
    reasoning,
    entryLow,
    entryHigh,
    stopLoss,
    takeProfit1,
    takeProfit2,
    decimals,
    price: q.price,
    changePct,
  };
}
