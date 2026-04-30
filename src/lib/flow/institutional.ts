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

export function computeInstitutionalFlow(ctx: FlowContext): InstitutionalFlowResult {
  const reasons: string[] = [];

  // ── Synthetic CVD ─────────────────────────────────────────────────
  const cvd = syntheticCvd(ctx.candles5m, 30);
  let cvdBuyContribution = 0, cvdSellContribution = 0;
  if (cvd != null) {
    // Compare CVD magnitude to total signed volume in the same window.
    const totalVol = ctx.candles5m.slice(-30).reduce((s, c) => s + (c.volume ?? 1), 0);
    if (totalVol > 0) {
      const cvdRatio = cvd / totalVol;          // -1..+1, dominance ratio
      if (cvdRatio > 0.15) {
        cvdBuyContribution = clipScore(cvdRatio, 0.15, 0.55);
        reasons.push(`synthetic CVD strongly positive (${(cvdRatio * 100).toFixed(0)}% buy dominance)`);
      } else if (cvdRatio < -0.15) {
        cvdSellContribution = clipScore(-cvdRatio, 0.15, 0.55);
        reasons.push(`synthetic CVD strongly negative (${(-cvdRatio * 100).toFixed(0)}% sell dominance)`);
      } else {
        reasons.push(`CVD balanced (${(cvdRatio * 100).toFixed(0)}%)`);
      }
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
  const buyRaw =
    cvdBuyContribution    * W_CVD    * volWeight +
    vwapBuyContribution   * W_VWAP   * volWeight +
    sweepBuyContribution  * W_SWEEP  +
    structBuyContribution * W_STRUCT;
  const sellRaw =
    cvdSellContribution    * W_CVD    * volWeight +
    vwapSellContribution   * W_VWAP   * volWeight +
    sweepSellContribution  * W_SWEEP  +
    structSellContribution * W_STRUCT;

  // Clamp to 0-100 ints.
  const buyScore  = Math.max(0, Math.min(100, Math.round(buyRaw)));
  const sellScore = Math.max(0, Math.min(100, Math.round(sellRaw)));

  return {
    buyScore,
    sellScore,
    syntheticCvd: cvd,
    vwapPosition: vwapPos,
    vwapSlope,
    volumeZScore: volZ,
    oiChange: null,  // wired in Phase 3 when futures data is connected
    cotNet: null,    // wired in Phase 3 (CFTC weekly cron)
    reasons,
  };
}
