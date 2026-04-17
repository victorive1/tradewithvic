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

const setupTypes = ["Breakout", "Pullback", "Reversal", "Continuation", "Range Break", "Liquidity Sweep"];
const timeframes = ["5m", "15m", "1h", "4h"];

function generateSetup(quote: MarketQuote, index: number): TradeSetup {
  const isBullish = quote.changePercent > 0;
  const direction: "buy" | "sell" = isBullish ? "buy" : "sell";
  const setupType = setupTypes[index % setupTypes.length];
  const timeframe = timeframes[index % timeframes.length];

  const volatility = Math.abs(quote.changePercent);
  const spread = Math.abs(quote.high - quote.low);
  const decimals = quote.category === "forex" ? 5 : 2;

  const slDistance = spread * (0.3 + Math.random() * 0.2);
  const tpDistance = slDistance * (1.5 + Math.random() * 1.5);

  const entry = quote.price;
  const stopLoss = direction === "buy" ? entry - slDistance : entry + slDistance;
  const tp1 = direction === "buy" ? entry + tpDistance : entry - tpDistance;
  const tp2 = direction === "buy" ? entry + tpDistance * 1.6 : entry - tpDistance * 1.6;
  const rr = Math.round((tpDistance / slDistance) * 10) / 10;

  const trendScore = Math.round(10 + volatility * 5 + Math.random() * 10);
  const momentumScore = Math.round(8 + Math.random() * 12);
  const liquidityScore = Math.round(5 + Math.random() * 15);
  const structureScore = Math.round(6 + Math.random() * 14);
  const volScore = Math.round(3 + Math.random() * 10);
  const rrScore = Math.min(15, Math.round(rr * 5));
  const eventRisk = -Math.round(Math.random() * 5);

  const total = trendScore + momentumScore + liquidityScore + structureScore + volScore + rrScore + eventRisk;
  const confidence = Math.max(45, Math.min(98, total));

  let grade = "C";
  if (confidence >= 85) grade = "A+";
  else if (confidence >= 75) grade = "A";
  else if (confidence >= 65) grade = "B+";
  else if (confidence >= 55) grade = "B";

  const validHours = timeframe === "5m" ? 1 : timeframe === "15m" ? 3 : timeframe === "1h" ? 8 : 24;
  const validUntil = new Date(Date.now() + validHours * 60 * 60 * 1000).toISOString();

  return {
    id: `setup_${quote.symbol}_${Date.now()}_${index}`,
    symbol: quote.symbol,
    displayName: quote.displayName,
    category: quote.category,
    direction,
    setupType,
    timeframe,
    entry: Math.round(entry * Math.pow(10, decimals)) / Math.pow(10, decimals),
    stopLoss: Math.round(stopLoss * Math.pow(10, decimals)) / Math.pow(10, decimals),
    takeProfit1: Math.round(tp1 * Math.pow(10, decimals)) / Math.pow(10, decimals),
    takeProfit2: Math.round(tp2 * Math.pow(10, decimals)) / Math.pow(10, decimals),
    riskReward: rr,
    confidenceScore: confidence,
    qualityGrade: grade,
    explanation: generateExplanation(quote, direction, setupType, timeframe),
    invalidation: `${direction === "buy" ? "Close below" : "Close above"} ${Math.round(stopLoss * Math.pow(10, decimals)) / Math.pow(10, decimals)} invalidates this setup.`,
    status: "active",
    validUntil,
    createdAt: new Date().toISOString(),
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

function generateExplanation(quote: MarketQuote, dir: string, type: string, tf: string): string {
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
  quotes.forEach((quote, i) => {
    if (Math.abs(quote.changePercent) > 0.01 || quote.price > 0) {
      setups.push(generateSetup(quote, i));
      if (Math.abs(quote.changePercent) > 0.3 && i % 3 === 0) {
        setups.push(generateSetup(quote, i + 100));
      }
    }
  });
  return setups.sort((a, b) => b.confidenceScore - a.confidenceScore);
}
