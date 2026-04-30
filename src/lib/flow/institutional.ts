// Institutional Flow Engine — blueprint § 7.4 + § 6.
//
// Estimates institutional buy/sell pressure from brain-derived proxies.
// IMPORTANT: this is approximation, not exact order flow. Per the
// blueprint we say "Institutional sell pressure is ~likely~ rising"
// not "Institutions sold $X here". Score outputs are 0-100 with the
// scoring legend:
//   0-30  weak evidence
//   31-60 mixed/developing
//   61-75 strong pressure
//   76-100 high-confidence pressure / overcrowding
//
// Inputs (Phase 1 — proxy):
//   • synthetic CVD across last 30 5m bars
//   • VWAP position (close vs VWAP, ATR-normalised) + slope
//   • volume z-score on 1h timeframe (most stable for FX tick volume)
//   • liquidity sweep direction + reversal strength (recent)
//   • structure event (last BOS/CHoCH on 1h)
//
// Inputs (Phase 3 — when wired):
//   • CME futures OI delta (oiChange field)
//   • COT net commercial position (cotNet field)
//   • options call/put volume (not yet wired)

import type { FlowContext, InstitutionalFlowResult } from "@/lib/flow/types";
import { syntheticCvd, volumeZScore, clipScore } from "@/lib/flow/normalise";
import { fetchCotForSymbol } from "@/lib/flow/sources/cftc-cot";
import { fetchBinanceDerivatives } from "@/lib/flow/sources/binance-derivatives";
import { fetchBinanceRealCvd, isCryptoSymbolForRealCvd } from "@/lib/flow/sources/binance-trades";

export interface InstitutionalFlowResultWithSource extends InstitutionalFlowResult {
  cvdSource: "synthetic" | "real_aggressor";
  cvdTradeCount?: number;
  cvdWindowMs?: number;
}

export async function computeInstitutionalFlow(ctx: FlowContext): Promise<InstitutionalFlowResultWithSource> {
  const reasons: string[] = [];

  // ── CVD: real aggressor flow if available, otherwise synthetic ───────
  // Crypto symbols (BTCUSD, ETHUSD) get REAL CVD computed from Binance's
  // aggregated-trades endpoint — every trade carries an `m` flag that
  // identifies the aggressor side. For everything else (FX, metals,
  // indices) we fall back to the synthetic approximation which sums
  // sign(close-open) × volume per candle.
  let cvd: number | null = null;
  let cvdSource: "synthetic" | "real_aggressor" = "synthetic";
  let cvdTradeCount: number | undefined;
  let cvdWindowMs: number | undefined;
  let cvdRatio: number | null = null;

  if (isCryptoSymbolForRealCvd(ctx.symbol)) {
    const real = await fetchBinanceRealCvd(ctx.symbol, 30).catch(() => null);
    if (real && real.totalVolume > 0) {
      cvd = real.cvd;
      cvdSource = "real_aggressor";
      cvdTradeCount = real.tradeCount;
      cvdWindowMs = real.windowMs;
      cvdRatio = real.cvd / real.totalVolume;
    }
  }
  if (cvd === null) {
    cvd = syntheticCvd(ctx.candles5m, 30);
    if (cvd != null) {
      const totalVol = ctx.candles5m.slice(-30).reduce((s, c) => s + (c.volume ?? 1), 0);
      if (totalVol > 0) cvdRatio = cvd / totalVol;
    }
  }

  let cvdBuyContribution = 0, cvdSellContribution = 0;
  if (cvdRatio != null) {
    const sourceLabel = cvdSource === "real_aggressor" ? "real CVD" : "synthetic CVD";
    if (cvdRatio > 0.15) {
      cvdBuyContribution = clipScore(cvdRatio, 0.15, 0.55);
      reasons.push(`${sourceLabel} strongly positive (${(cvdRatio * 100).toFixed(0)}% buy dominance${cvdTradeCount ? `, ${cvdTradeCount} trades` : ""})`);
    } else if (cvdRatio < -0.15) {
      cvdSellContribution = clipScore(-cvdRatio, 0.15, 0.55);
      reasons.push(`${sourceLabel} strongly negative (${(-cvdRatio * 100).toFixed(0)}% sell dominance${cvdTradeCount ? `, ${cvdTradeCount} trades` : ""})`);
    } else {
      reasons.push(`${sourceLabel} balanced (${(cvdRatio * 100).toFixed(0)}%)`);
    }
  }

  // ── VWAP position + slope ─────────────────────────────────────────
  const vwapPos = ctx.vwap.position;
  const vwapSlope = ctx.vwap.slope;
  let vwapBuyContribution = 0, vwapSellContribution = 0;
  if (vwapPos != null && vwapSlope != null) {
    if (vwapPos > 0.3 && vwapSlope > 0) {
      vwapBuyContribution = clipScore(vwapPos, 0.3, 1.5);
      reasons.push(`price meaningfully above rising VWAP (+${(vwapPos).toFixed(2)} ATR)`);
    } else if (vwapPos < -0.3 && vwapSlope < 0) {
      vwapSellContribution = clipScore(-vwapPos, 0.3, 1.5);
      reasons.push(`price meaningfully below falling VWAP (${(vwapPos).toFixed(2)} ATR)`);
    } else if (Math.abs(vwapPos) > 0.5 && Math.sign(vwapPos) !== Math.sign(vwapSlope)) {
      // Price extended away from VWAP but slope flipping = exhaustion.
      reasons.push(`VWAP showing exhaustion divergence`);
    }
  }

  // ── Volume z-score on 1h ─────────────────────────────────────────
  const volZ = volumeZScore(ctx.candles1h, 50);
  let volWeight = 1.0;
  if (volZ != null) {
    if (volZ > 1.5) {
      // Above-average volume amplifies whichever side CVD/VWAP suggest.
      volWeight = 1.4;
      reasons.push(`1h volume ${volZ.toFixed(2)}σ above average — institutional engagement likely`);
    } else if (volZ < -1) {
      volWeight = 0.6;
      reasons.push(`1h volume ${volZ.toFixed(2)}σ below average — low institutional engagement`);
    }
  }

  // ── Liquidity sweep direction ─────────────────────────────────────
  const sweep = ctx.recentSweeps[0];
  const sweepRecent = sweep && (Date.now() - new Date(sweep.detectedAt).getTime()) < 4 * 60 * 60 * 1000;
  let sweepBuyContribution = 0, sweepSellContribution = 0;
  if (sweepRecent && sweep) {
    const strength = sweep.reversalStrength ?? 0;
    const strengthScore = clipScore(strength, 0.3, 0.9);
    // Bullish sweep (price wicked below SSL then closed back) =
    // institutional BUYING absorption.
    if (sweep.sweepDirection === "bullish_sweep") {
      sweepBuyContribution = strengthScore;
      reasons.push(`bullish sweep of ${sweep.levelType} with ${(strength * 100).toFixed(0)}% reversal strength = institutional absorption on the bid`);
    } else if (sweep.sweepDirection === "bearish_sweep") {
      sweepSellContribution = strengthScore;
      reasons.push(`bearish sweep of ${sweep.levelType} with ${(strength * 100).toFixed(0)}% reversal strength = institutional absorption on the offer`);
    }
  }

  // ── Structure event ──────────────────────────────────────────────
  const struct1h = ctx.structure1h?.lastEventType ?? null;
  let structBuyContribution = 0, structSellContribution = 0;
  if (struct1h === "bos_bullish") {
    structBuyContribution = 70; reasons.push("1h BOS bullish — structural commitment to upside");
  } else if (struct1h === "choch_bullish") {
    structBuyContribution = 55; reasons.push("1h CHoCH bullish — early reversal signal");
  } else if (struct1h === "bos_bearish") {
    structSellContribution = 70; reasons.push("1h BOS bearish — structural commitment to downside");
  } else if (struct1h === "choch_bearish") {
    structSellContribution = 55; reasons.push("1h CHoCH bearish — early reversal signal");
  }

  // ── Aggregate ─────────────────────────────────────────────────────
  // Weighted combine. Each contributor caps at its own ceiling so a
  // single signal can't push the total to 100. Volume z-score acts as
  // a multiplier on the directional contributions only.
  const W_CVD = 0.30, W_VWAP = 0.25, W_SWEEP = 0.20, W_STRUCT = 0.25;
  let buyRaw =
    cvdBuyContribution    * W_CVD    * volWeight +
    vwapBuyContribution   * W_VWAP   * volWeight +
    sweepBuyContribution  * W_SWEEP  +
    structBuyContribution * W_STRUCT;
  let sellRaw =
    cvdSellContribution    * W_CVD    * volWeight +
    vwapSellContribution   * W_VWAP   * volWeight +
    sweepSellContribution  * W_SWEEP  +
    structSellContribution * W_STRUCT;

  // ── Phase 3: external derivatives data ──────────────────────────
  // Crypto: Binance perp OI / funding / top-trader ratio. The OI delta
  // and funding rate give us real institutional commitment signals.
  // For BTCUSD/ETHUSD we boost the score directly.
  let oiChange: number | null = null;
  const derivs = await fetchBinanceDerivatives(ctx.symbol).catch(() => null);
  if (derivs) {
    oiChange = derivs.oiChange1h;
    if (oiChange != null && Math.abs(oiChange) > 0.3) {
      // Rising OI + bullish CVD = real buyers committing capital.
      // Rising OI + bearish CVD = real sellers committing capital.
      // Use sign of CVD (or absent CVD, sign of last bar) to direct.
      const directionalSign = cvd != null && cvd !== 0 ? Math.sign(cvd)
                            : ctx.candles5m.length > 0 ? Math.sign(ctx.candles5m[ctx.candles5m.length - 1].close - ctx.candles5m[ctx.candles5m.length - 1].open)
                            : 0;
      if (oiChange > 0.3 && directionalSign > 0) {
        cvdBuyContribution = Math.min(100, cvdBuyContribution + 25);
        reasons.push(`Binance OI +${oiChange.toFixed(2)}% in last hour with bullish CVD — committed long flow`);
      } else if (oiChange > 0.3 && directionalSign < 0) {
        cvdSellContribution = Math.min(100, cvdSellContribution + 25);
        reasons.push(`Binance OI +${oiChange.toFixed(2)}% with bearish CVD — committed short flow`);
      } else if (oiChange < -0.3) {
        reasons.push(`Binance OI ${oiChange.toFixed(2)}% — positions being closed (deleveraging)`);
      }
    }
    if (derivs.fundingRate != null) {
      // Heavy positive funding = longs paying shorts = crowded long
      // (contrarian SELL signal). Heavy negative = crowded short
      // (contrarian BUY).
      if (derivs.fundingRate > 0.05) {
        sellRaw = sellRaw + 8;  // boost sell side via raw bump
        reasons.push(`Binance funding +${derivs.fundingRate.toFixed(3)}% — crowded long, mean-revert risk`);
      } else if (derivs.fundingRate < -0.05) {
        buyRaw = buyRaw + 8;
        reasons.push(`Binance funding ${derivs.fundingRate.toFixed(3)}% — crowded short, squeeze risk`);
      }
    }
  }

  // FX / metals: CFTC COT weekly net commercial position (Phase 3 stub —
  // returns null until parser is wired).
  let cotNet: number | null = null;
  const cot = await fetchCotForSymbol(ctx.symbol).catch(() => null);
  if (cot) cotNet = cot.commercialNet;

  // Re-aggregate (the OI bump may have changed contributions).
  const buyRawFinal =
    cvdBuyContribution    * W_CVD    * volWeight +
    vwapBuyContribution   * W_VWAP   * volWeight +
    sweepBuyContribution  * W_SWEEP  +
    structBuyContribution * W_STRUCT;
  const sellRawFinal =
    cvdSellContribution    * W_CVD    * volWeight +
    vwapSellContribution   * W_VWAP   * volWeight +
    sweepSellContribution  * W_SWEEP  +
    structSellContribution * W_STRUCT;

  void buyRaw; void sellRaw;
  const buyScore  = Math.max(0, Math.min(100, Math.round(buyRawFinal)));
  const sellScore = Math.max(0, Math.min(100, Math.round(sellRawFinal)));

  return {
    buyScore,
    sellScore,
    syntheticCvd: cvd,
    vwapPosition: vwapPos,
    vwapSlope,
    volumeZScore: volZ,
    oiChange,
    cotNet,
    reasons,
    cvdSource,
    cvdTradeCount,
    cvdWindowMs,
  };
}
