// PDF Strategy 09 — ICT Dealing Range / OTE.
//
// 100% = Swing High (BSL above)
// 50%  = Equilibrium
// 0%   = Swing Low  (SSL below)
//
// Long setups only when price retraces into discount (below 50%) AND
// price is at the OTE band (62-79% retracement INTO discount). Short
// setups: mirror in premium. An OB or FVG must exist within the OTE
// band to give the entry institutional structure.

import type { DetectedSetup } from "@/lib/brain/strategies-types";
import { scoreEps, killzone, volumeMA, loadCandles, loadStructure, type CandleRow, type GateOutcome } from "@/lib/brain/strategies/eps-scoring";

interface StrategyContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastSwingHigh?: number | null; lastSwingLow?: number | null; lastEventType?: string | null } | null;
  indicators: { rsi14?: number | null; ema20?: number | null; atr14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date; sweepDirection?: string; sweepHigh?: number; sweepLow?: number; levelType?: string; levelPrice?: number }>;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

interface FVG { direction: "bullish" | "bearish"; high: number; low: number; }
const DISPLACEMENT_BODY_RATIO = 0.6;

export async function detectDealingRangeOte(ctx: StrategyContext): Promise<DetectedSetup | null> {
  if (ctx.timeframe !== "15m") return null;
  if (!ctx.atr) return null;

  // Define dealing range from H4 most-recent significant swing high & low.
  // Pull H4 candles + per-tf structure for the swing references.
  const [candles4h, structure4h, structureD1, candles15mVol] = await Promise.all([
    loadCandles(ctx.symbol, "4h", 60),
    loadStructure(ctx.symbol, "4h"),
    loadStructure(ctx.symbol, "1d"),
    loadCandles(ctx.symbol, "15m", 80, true),
  ]);
  if (candles4h.length < 10) return null;

  // Range from structure (preferred) or fall back to last 4h slice extremes.
  const swingHigh = structure4h?.lastSwingHigh ?? Math.max(...candles4h.map((c) => c.high));
  const swingLow = structure4h?.lastSwingLow ?? Math.min(...candles4h.map((c) => c.low));
  if (!Number.isFinite(swingHigh) || !Number.isFinite(swingLow) || swingHigh <= swingLow) return null;
  const rangeSize = swingHigh - swingLow;

  const last = ctx.candles[ctx.candles.length - 1];
  const fillPct = (last.close - swingLow) / rangeSize;
  // Dealing-range half determines direction. Discount = bullish setup, premium = bearish.
  let direction: "bullish" | "bearish" | null = null;
  // OTE band: 62-79% retracement from the recent extreme back into the range.
  // For bullish: 62-79% retracement DOWN from swingHigh = price between
  // swingHigh - 0.79*range and swingHigh - 0.62*range. That sits in discount.
  const oteBullLow = swingHigh - rangeSize * 0.79;
  const oteBullHigh = swingHigh - rangeSize * 0.62;
  const oteBearLow = swingLow + rangeSize * 0.62;
  const oteBearHigh = swingLow + rangeSize * 0.79;
  if (fillPct < 0.5 && last.close >= oteBullLow && last.close <= oteBullHigh) direction = "bullish";
  else if (fillPct > 0.5 && last.close >= oteBearLow && last.close <= oteBearHigh) direction = "bearish";
  if (!direction) return null;

  // HTF D1 bias must align.
  if (structureD1?.bias && structureD1.bias !== direction) return null;

  // OB or FVG must exist within the OTE band.
  const fvgs15m = findFVGs(ctx.candles).filter((f) => f.direction === direction);
  const oteLow = direction === "bullish" ? oteBullLow : oteBearLow;
  const oteHigh = direction === "bullish" ? oteBullHigh : oteBearHigh;
  const fvgInOte = fvgs15m.find((f) => f.high >= oteLow && f.low <= oteHigh);
  // Active OB-style level inside OTE.
  const obInOte = ctx.activeLevels.find((l) =>
    /order_block|breaker|swing|prev_/.test(l.levelType) && l.price >= oteLow && l.price <= oteHigh,
  );
  if (!fvgInOte && !obInOte) return null;

  // Body reaction candle at OTE — 15m close + body ≥40% of range.
  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  if (range <= 0 || body / range < 0.4) return null;
  const reactionDirOk = direction === "bullish" ? last.close > last.open : last.close < last.open;
  if (!reactionDirOk) return null;

  // ── Levels ────────────────────────────────────────────────────────────
  const entry = last.close;
  const buffer = ctx.atr * 0.3;
  // SL beyond 100% retracement of the dealing range (i.e., outside the swing extreme).
  const stopLoss = direction === "bullish" ? swingLow - buffer : swingHigh + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;
  const tp1 = direction === "bullish" ? swingHigh : swingLow;
  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 2) return null;
  const tp2 = direction === "bullish" ? entry + (entry - stopLoss) * rr * 1.5 : entry - (stopLoss - entry) * rr * 1.5;

  // ── EPS factors ──────────────────────────────────────────────────────
  const recentSweep = ctx.recentSweeps[0];
  const sweepRecent = recentSweep && (Date.now() - new Date(recentSweep.detectedAt).getTime()) < 6 * 60 * 60 * 1000;
  const lq = sweepRecent ? 88 : 60;
  const loc = (fvgInOte && obInOte) ? 95 : 85;
  const mom = body / range >= 0.6 ? 80 : 65;
  const vol20 = volumeMA(candles15mVol, 20);
  const vol = vol20 != null && last.volume != null && last.volume > vol20 ? 82 : 55;
  const kz = killzone();
  const eps = scoreEps({ lq, loc, mom, vol, time: kz.score });
  if (eps.tier === "SUPPRESSED") return null;

  const gates: GateOutcome[] = [
    { id: "zone",   label: `${direction === "bullish" ? "Discount" : "Premium"} half of dealing range`, passed: true, evidence: `fill ${(fillPct * 100).toFixed(0)}%` },
    { id: "ote",    label: "Inside OTE band (62–79%)",  passed: true,         evidence: `last ${last.close.toFixed(5)} in [${oteLow.toFixed(5)},${oteHigh.toFixed(5)}]` },
    { id: "struct", label: "OB or FVG inside OTE",      passed: true,         evidence: fvgInOte ? `15m FVG ${fvgInOte.low.toFixed(5)}-${fvgInOte.high.toFixed(5)}` : `${obInOte!.levelType} @ ${obInOte!.price.toFixed(5)}` },
    { id: "d1",     label: "D1 bias aligns",             passed: !structureD1?.bias || structureD1.bias === direction, evidence: `D1 bias=${structureD1?.bias ?? "—"}` },
    { id: "react",  label: "Body reaction candle",      passed: true,         evidence: `body ${(body/range*100).toFixed(0)}% of range` },
    { id: "sweep",  label: "Liquidity swept before OTE", passed: !!sweepRecent, evidence: sweepRecent ? `${recentSweep!.sweepDirection} of ${recentSweep!.levelType}` : "no recent sweep" },
    { id: "rr",     label: "≥2:1 RR to opposing extreme", passed: rr >= 2,    evidence: `${rr.toFixed(2)}R to ${tp1.toFixed(5)}` },
    { id: "killzone", label: "Killzone active",          passed: kz.score === 100, evidence: kz.name },
  ];

  return {
    setupType: "dealing_range_ote",
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: rr,
    confidenceScore: eps.score,
    qualityGrade: eps.qualityGrade,
    explanation: `${direction === "bullish" ? "Discount" : "Premium"} OTE on dealing range [${swingLow.toFixed(5)}–${swingHigh.toFixed(5)}]. EPS ${eps.score}/100 (${eps.tier}). Reaction candle at ${entry.toFixed(5)} with ${fvgInOte ? "FVG" : "OB-level"} confluence. SL at swing extreme ${stopLoss.toFixed(5)}, TP1 = opposing extreme ${tp1.toFixed(5)} (${rr.toFixed(2)}R).`,
    invalidation: `Close beyond 100% retracement of dealing range — must redraw range.`,
    validHours: 12,
    metadata: { strategy: "dealing_range_ote", tier: eps.tier, eps: eps.score, factors: eps.factors, gates },
  };
}

function findFVGs(candles: CandleRow[]): FVG[] {
  const out: FVG[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    if (c1.high < c3.low && isDisplacement(c2, "bull")) out.push({ direction: "bullish", high: c3.low, low: c1.high });
    if (c1.low > c3.high && isDisplacement(c2, "bear")) out.push({ direction: "bearish", high: c1.low, low: c3.high });
  }
  return out;
}
function isDisplacement(c: CandleRow, dir: "bull" | "bear"): boolean {
  const range = c.high - c.low;
  if (range <= 0) return false;
  const body = Math.abs(c.close - c.open);
  if (body / range < DISPLACEMENT_BODY_RATIO) return false;
  return dir === "bull" ? c.close > c.open : c.close < c.open;
}
