/**
 * Market Prediction Engine — pure math extracted from
 * src/app/dashboard/screener/page.tsx so the Brain's execution engine can
 * reuse the exact same bias / score / grade for its confluence gate.
 *
 * Nothing here reads from the DOM or network; it's all derived from a
 * single quote snapshot. Server and client callers get identical output
 * as long as they hand in the same QuoteInput shape.
 */

export interface QuoteInput {
  price: number;
  previousClose: number;
  high: number;
  low: number;
  changePercent: number;
}

export interface ScoreBreakdown {
  structureQuality: number;
  mtfAlignment: number;
  confluenceDensity: number;
  entryPrecision: number;
  riskRewardQuality: number;
  sessionTiming: number;
  eventSafety: number;
  freshness: number;
}

export type PredictionBias = "bullish" | "bearish" | "neutral";
export type PredictionGrade = "A+" | "A" | "B" | "C" | "NO_TRADE";

export interface Prediction {
  bias: PredictionBias;
  score: number;
  grade: PredictionGrade;
  breakdown: ScoreBreakdown;
}

export function getSession(now: Date = new Date()): string {
  const hour = now.getUTCHours();
  if (hour >= 0 && hour < 7) return "Asian";
  if (hour >= 7 && hour < 12) return "London";
  if (hour >= 12 && hour < 17) return "New York";
  if (hour >= 17 && hour < 21) return "Late NY";
  return "Off-Hours";
}

export function getBias(changePercent: number): PredictionBias {
  if (changePercent > 0.15) return "bullish";
  if (changePercent < -0.15) return "bearish";
  return "neutral";
}

export function getGrade(score: number): PredictionGrade {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "NO_TRADE";
}

export function computeBreakdown(q: QuoteInput, now: Date = new Date()): ScoreBreakdown {
  const absPct = Math.abs(q.changePercent);
  const range = q.high - q.low;
  const pricePos = range > 0 ? (q.price - q.low) / range : 0.5;
  const isTrending = absPct > 0.2;
  const isDirectional = (q.changePercent > 0 && pricePos > 0.5) || (q.changePercent < 0 && pricePos < 0.5);

  const structureQuality = Math.min(25, Math.round(
    (isTrending ? 12 : 5) + (isDirectional ? 10 : 3) + Math.min(3, absPct * 2),
  ));

  const mtfAlignment = Math.min(15, Math.round(
    (isDirectional ? 8 : 3) + (isTrending ? 5 : 2) + (absPct > 0.5 ? 2 : 0),
  ));

  const confluenceDensity = Math.min(15, Math.round(
    (pricePos > 0.8 || pricePos < 0.2 ? 10 : 5) + Math.min(5, absPct * 3),
  ));

  const entryPrecision = Math.min(10, Math.round(
    pricePos > 0.7 || pricePos < 0.3 ? 7 + Math.min(3, absPct) : 3 + Math.min(3, absPct),
  ));

  const riskRewardQuality = Math.min(10, Math.round(
    range > 0 ? 4 + Math.min(6, (range / q.price) * 5000) : 3,
  ));

  const session = getSession(now);
  const sessionTiming = session === "London" ? 10 : session === "New York" ? 9 : session === "Asian" ? 6 : 4;

  const hour = now.getUTCHours();
  const eventSafety = (hour >= 13 && hour <= 14) ? 4 : (hour >= 8 && hour <= 9) ? 5 : 8;

  const freshness = Math.min(5, Math.round(absPct > 0.3 ? 4 : absPct > 0.1 ? 3 : 1));

  return { structureQuality, mtfAlignment, confluenceDensity, entryPrecision, riskRewardQuality, sessionTiming, eventSafety, freshness };
}

export function computeScore(breakdown: ScoreBreakdown): number {
  return breakdown.structureQuality + breakdown.mtfAlignment + breakdown.confluenceDensity +
    breakdown.entryPrecision + breakdown.riskRewardQuality + breakdown.sessionTiming +
    breakdown.eventSafety + breakdown.freshness;
}

/** One-shot helper: quote in → full prediction out. */
export function predictForQuote(q: QuoteInput, now: Date = new Date()): Prediction {
  const breakdown = computeBreakdown(q, now);
  const score = computeScore(breakdown);
  return {
    bias: getBias(q.changePercent),
    score,
    grade: getGrade(score),
    breakdown,
  };
}
