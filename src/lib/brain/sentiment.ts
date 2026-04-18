import { prisma } from "@/lib/prisma";
import type { MarketQuote, CurrencyStrength } from "@/lib/market-data";

export interface SentimentResult {
  riskTone: "risk_on" | "risk_off" | "neutral";
  riskScore: number;
  usdBias: "strong" | "weak" | "neutral";
  usdScore: number;
  goldBias: "bid" | "offered" | "neutral";
  goldChange: number;
  cryptoBias: "bid" | "offered" | "neutral";
  cryptoChange: number;
  reasoning: string;
  reasons: string[];
}

function scoreUsd(strengths: CurrencyStrength[]): number {
  const usd = strengths.find((s) => s.currency === "USD");
  if (!usd) return 0;
  // Map strength score (0-100) onto -100..+100 centered on 50.
  return (usd.score - 50) * 2;
}

export function computeSentiment(
  quotes: MarketQuote[],
  strengths: CurrencyStrength[]
): SentimentResult {
  const gold = quotes.find((q) => q.symbol === "XAUUSD");
  const btc = quotes.find((q) => q.symbol === "BTCUSD");
  const usdScore = scoreUsd(strengths);

  const goldChange = gold?.changePercent ?? 0;
  const cryptoChange = btc?.changePercent ?? 0;

  let riskScore = 0;
  const reasons: string[] = [];

  if (cryptoChange > 1.5) {
    riskScore += 30;
    reasons.push(`BTC up ${cryptoChange.toFixed(2)}% — risk-on`);
  } else if (cryptoChange < -1.5) {
    riskScore -= 30;
    reasons.push(`BTC down ${cryptoChange.toFixed(2)}% — risk-off`);
  } else if (Math.abs(cryptoChange) > 0.5) {
    const delta = cryptoChange > 0 ? 10 : -10;
    riskScore += delta;
    reasons.push(`BTC ${cryptoChange > 0 ? "up" : "down"} ${cryptoChange.toFixed(2)}%`);
  }

  if (goldChange > 0.5 && usdScore > 20) {
    riskScore -= 25;
    reasons.push(`Gold + USD both bid — safety rally (risk-off)`);
  } else if (goldChange > 0.5 && usdScore < -20) {
    riskScore += 5;
    reasons.push(`Gold bid while USD weak — mild inflation / dovish narrative`);
  } else if (goldChange < -0.5 && usdScore > 20) {
    riskScore += 10;
    reasons.push(`Gold offered while USD strong — rate-driven tightening tone`);
  }

  if (usdScore > 30) {
    riskScore -= 20;
    reasons.push(`USD strong (${usdScore.toFixed(0)}) — typically risk-off`);
  } else if (usdScore < -30) {
    riskScore += 15;
    reasons.push(`USD weak (${usdScore.toFixed(0)}) — typically risk-on`);
  }

  riskScore = Math.max(-100, Math.min(100, riskScore));
  const riskTone: SentimentResult["riskTone"] =
    riskScore > 20 ? "risk_on" : riskScore < -20 ? "risk_off" : "neutral";

  const usdBias: SentimentResult["usdBias"] =
    usdScore > 20 ? "strong" : usdScore < -20 ? "weak" : "neutral";
  const goldBias: SentimentResult["goldBias"] =
    goldChange > 0.3 ? "bid" : goldChange < -0.3 ? "offered" : "neutral";
  const cryptoBias: SentimentResult["cryptoBias"] =
    cryptoChange > 0.5 ? "bid" : cryptoChange < -0.5 ? "offered" : "neutral";

  const reasoning = reasons.length > 0 ? reasons.join(" · ") : "No dominant cross-asset signal.";

  return {
    riskTone, riskScore,
    usdBias, usdScore,
    goldBias, goldChange,
    cryptoBias, cryptoChange,
    reasoning,
    reasons,
  };
}

export async function persistSentiment(
  scanCycleId: string | null,
  sentiment: SentimentResult
): Promise<{ id: string }> {
  const row = await prisma.sentimentSnapshot.create({
    data: {
      scanCycleId: scanCycleId ?? undefined,
      riskTone: sentiment.riskTone,
      riskScore: Math.round(sentiment.riskScore),
      usdBias: sentiment.usdBias,
      usdScore: sentiment.usdScore,
      goldBias: sentiment.goldBias,
      goldChange: sentiment.goldChange,
      cryptoBias: sentiment.cryptoBias,
      cryptoChange: sentiment.cryptoChange,
      reasoning: sentiment.reasoning,
      reasoningJson: JSON.stringify(sentiment.reasons),
    },
  });
  return { id: row.id };
}
