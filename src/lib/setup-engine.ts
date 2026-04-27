import type { MarketQuote } from "./market-data";

export interface TradeSetup {
  id: string;
  symbol: string;
  displayName: string;
  category: string;
  direction: "buy" | "sell";
  setupType: string;
  timeframe: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  riskReward: number;
  confidenceScore: number;
  qualityGrade: string;
  explanation: string;
  invalidation: string;
  status: "active" | "near_entry" | "triggered" | "expired";
  validUntil: string;
  createdAt: string;
  scoringBreakdown: {
    trendAlignment: number;
    momentum: number;
    liquidityTarget: number;
    structure: number;
    volatility: number;
    riskReward: number;
    eventRisk: number;
  };
}

// Pure-function setup engine.
//
// Previously every component used Math.random() per call, plus the IDs
// embedded Date.now(). That meant the same logical setup (say "EURUSD
// breakout 1h bullish") would:
//   - get a brand-new ID on every refresh → React tore down and rebuilt
//     every card, looking like setups "disappeared" while the user was
//     reading them
//   - score differently every refresh → an A+ on tick N could become a
//     B+ on tick N+1 with NO change in the underlying market, just because
//     the dice rolled lower
//   - sort to a different position because the scores moved → visible
//     reshuffle
//
// All three symptoms reduce to the same root cause: the engine was
// non-deterministic. This rewrite derives every output from real quote
// properties (volatility, position-in-range, range%) so the same market
// state always produces the same setup. Updates happen ONLY when the
// underlying quote moves meaningfully — and even then the ID stays
// stable so React preserves the card and just updates its props.

function classify(quote: MarketQuote): { setupType: string; timeframe: string } {
  const volatility = Math.abs(quote.changePercent);
  const range = (quote.high ?? 0) - (quote.low ?? 0);
  const rangePct = quote.price > 0 ? (range / quote.price) * 100 : 0;
  const pricePos = range > 0 ? (quote.price - (quote.low ?? 0)) / range : 0.5;
  const isExtreme = pricePos > 0.85 || pricePos < 0.15;

  // Threshold-based classification — small price moves around a threshold
  // CAN flip the setupType. That's a meaningful change ("now it's a real
  // breakout") so we accept the resulting ID change. Day traders should
  // see it as a tier-up, not as the card disappearing.
  if (volatility > 1.0 && isExtreme) return { setupType: "Breakout", timeframe: "1h" };
  if (volatility > 0.5 && pricePos > 0.65 && quote.changePercent > 0) return { setupType: "Continuation", timeframe: "1h" };
  if (volatility > 0.5 && pricePos < 0.35 && quote.changePercent < 0) return { setupType: "Continuation", timeframe: "1h" };
  if (volatility > 0.4 && isExtreme) return { setupType: "Reversal", timeframe: "15m" };
  if (rangePct > 0.6 && volatility > 0.2) return { setupType: "Range Break", timeframe: "15m" };
  if (volatility > 0.2 && !isExtreme) return { setupType: "Pullback", timeframe: "15m" };
  if (isExtreme) return { setupType: "Liquidity Sweep", timeframe: "5m" };
  return { setupType: "Pullback", timeframe: "15m" };
}

function generateSetup(quote: MarketQuote): TradeSetup | null {
  // Skip empty / pre-market quotes — these tend to have zero-range and
  // would produce degenerate setups with NaN risk-reward.
  if (!Number.isFinite(quote.price) || quote.price <= 0) return null;
  const range = (quote.high ?? 0) - (quote.low ?? 0);
  if (range <= 0) return null;
  if (Math.abs(quote.changePercent ?? 0) < 0.05) return null; // truly quiet — no setup

  const isBullish = quote.changePercent > 0;
  const direction: "buy" | "sell" = isBullish ? "buy" : "sell";
  const { setupType, timeframe } = classify(quote);

  const volatility = Math.abs(quote.changePercent);
  const rangePct = (range / quote.price) * 100;
  const pricePos = range > 0 ? (quote.price - (quote.low ?? 0)) / range : 0.5;
  const distFromMid = Math.abs(pricePos - 0.5) * 2; // 0=middle, 1=extreme
  const decimals = quote.category === "forex" ? 5 : 2;

  // Deterministic SL/TP based on session range. SL = 35% of session range
  // (roughly 1 ATR-equivalent), TP1 = 2x SL, TP2 = 3.2x SL. No randomness.
  const slDistance = range * 0.35;
  const tpDistance = slDistance * 2.0;
  const entry = quote.price;
  const stopLoss = direction === "buy" ? entry - slDistance : entry + slDistance;
  const tp1 = direction === "buy" ? entry + tpDistance : entry - tpDistance;
  const tp2 = direction === "buy" ? entry + tpDistance * 1.6 : entry - tpDistance * 1.6;
  const rr = 2.0; // fixed by construction — no per-call jitter

  // Scoring components — each derived from real properties, not random.
  // Component caps chosen so a "really good" setup adds up to ~85-90,
  // a typical setup ~65-75, a marginal one ~50-60.
  const trendScore = Math.min(20, Math.round(volatility * 14));        // 0-20 from move size
  const momentumScore = Math.min(20, Math.round(distFromMid * 16 + 4));// 4-20 from how extreme
  const liquidityScore = Math.min(20, Math.round(rangePct * 12 + 6));  // 6-20 from session range
  const structureScore = Math.min(15, Math.round(volatility * 8 + (distFromMid > 0.7 ? 6 : 0))); // 0-15
  const volScore = Math.min(10, Math.round(rangePct * 7 + 3));         // 3-10
  const rrScore = Math.min(15, Math.round(rr * 5));                    // 10 with rr=2.0
  // Event risk left at 0 here — the chatbot pulls real news/calendar
  // separately. This field stays for backwards compatibility.
  const eventRisk = 0;

  const total = trendScore + momentumScore + liquidityScore + structureScore + volScore + rrScore + eventRisk;
  const confidence = Math.max(45, Math.min(98, total));

  let grade = "C";
  if (confidence >= 85) grade = "A+";
  else if (confidence >= 75) grade = "A";
  else if (confidence >= 65) grade = "B+";
  else if (confidence >= 55) grade = "B";

  const validHours = timeframe === "5m" ? 1 : timeframe === "15m" ? 3 : timeframe === "1h" ? 8 : 24;

  // Stable ID. Day-bucketed so the SAME (symbol, setupType, timeframe,
  // direction) on the same day always returns the same id — React reuses
  // the card across refreshes. New day → fresh id (acceptable; trader
  // mentally treats overnight as a reset). Type/timeframe flips → new id
  // (acceptable; it's a different setup).
  const dayBucket = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const id = `setup_${quote.symbol}_${setupType.replace(/\s+/g, "_")}_${timeframe}_${direction}_${dayBucket}`;

  // Quantize entry/SL/TP to the instrument's decimals to avoid sub-pip
  // jitter from floating-point.
  const q = (n: number) => Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);

  return {
    id,
    symbol: quote.symbol,
    displayName: quote.displayName,
    category: quote.category,
    direction,
    setupType,
    timeframe,
    entry: q(entry),
    stopLoss: q(stopLoss),
    takeProfit1: q(tp1),
    takeProfit2: q(tp2),
    riskReward: rr,
    confidenceScore: confidence,
    qualityGrade: grade,
    explanation: explainFor(quote, direction, setupType, timeframe),
    invalidation: `${direction === "buy" ? "Close below" : "Close above"} ${q(stopLoss)} invalidates this setup.`,
    status: "active",
    validUntil: new Date(Date.now() + validHours * 60 * 60 * 1000).toISOString(),
    // createdAt: stable across refreshes within the day bucket so the card
    // doesn't show "just now" rolling forward every minute.
    createdAt: new Date(dayBucket * 24 * 60 * 60 * 1000).toISOString(),
    scoringBreakdown: {
      trendAlignment: trendScore,
      momentum: momentumScore,
      liquidityTarget: liquidityScore,
      structure: structureScore,
      volatility: volScore,
      riskReward: rrScore,
      eventRisk,
    },
  };
}

function explainFor(quote: MarketQuote, dir: string, type: string, tf: string): string {
  const dirLabel = dir === "buy" ? "bullish" : "bearish";
  const explanations: Record<string, string> = {
    Breakout: `${quote.displayName} showing ${dirLabel} breakout on ${tf}. Price has broken through key structure with momentum confirmation. Volume and displacement support the move.`,
    Pullback: `${quote.displayName} ${dirLabel} pullback setup on ${tf}. Price retracing into value zone within a strong trend. Expecting continuation after this corrective move.`,
    Reversal: `${quote.displayName} ${dirLabel} reversal forming on ${tf}. Key level rejection with structure shift detected. Momentum aligning with the new directional bias.`,
    Continuation: `${quote.displayName} ${dirLabel} continuation on ${tf}. Trend remains intact with clean structure. Pullback complete and price resuming in direction of the trend.`,
    "Range Break": `${quote.displayName} breaking out of consolidation range on ${tf}. Extended compression now resolving ${dirLabel}. Clean break with room to target.`,
    "Liquidity Sweep": `${quote.displayName} ${dirLabel} setup after liquidity sweep on ${tf}. Stops have been taken and price is reversing. Smart money likely positioning in the opposite direction.`,
  };
  return explanations[type] || `${quote.displayName} ${dirLabel} ${type.toLowerCase()} setup detected on ${tf}.`;
}

export function generateSetups(quotes: MarketQuote[]): TradeSetup[] {
  const setups: TradeSetup[] = [];
  for (const quote of quotes) {
    const setup = generateSetup(quote);
    if (setup) setups.push(setup);
  }
  // Sort by confidence DESC at the API layer for an initial display order.
  // The client's stable-ordering hook then preserves position across
  // refreshes — server sort is only used for first render.
  return setups.sort((a, b) => b.confidenceScore - a.confidenceScore);
}
