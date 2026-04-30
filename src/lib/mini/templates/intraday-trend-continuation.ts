// Mini Template — Intraday Trend Continuation (blueprint § 5).
//
// 1H bias aligns with 15m structure; price pulls back into FVG, supply/
// demand zone, VWAP, or EMA20 zone; 5m confirms continuation. Designed
// for the "buy-the-dip in an uptrend / sell-the-rally in a downtrend"
// idea but with intraday tightness — the entry must be RIGHT NOW or
// within the next bar, not "sometime today".

import type { DetectedMiniSetup, MiniContext } from "@/lib/mini/types";
import { computeMiniScore, scoreRR, scoreVolatility, type MiniGate } from "@/lib/mini/scoring";

export async function detectIntradayTrendContinuation(ctx: MiniContext): Promise<DetectedMiniSetup | null> {
  if (ctx.bias.session.noTradeZone) return null;
  if (ctx.candles15m.length < 12 || !ctx.atr15m) return null;
  // Bias must be directional with conviction.
  if (ctx.bias.state !== "bullish" && ctx.bias.state !== "bearish") return null;
  if (ctx.bias.conviction < 50) return null;
  const direction = ctx.bias.state;

  // 15m structure must agree (latest event = BOS in trade direction or
  // a recent CHoCH that flipped INTO the trade direction).
  const expectedBos = direction === "bullish" ? "bos_bullish" : "bos_bearish";
  const expectedChoch = direction === "bullish" ? "choch_bullish" : "choch_bearish";
  const ev15 = ctx.structureEvents15m?.lastEventType ?? null;
  const structureAligned = ev15 === expectedBos || ev15 === expectedChoch;
  if (!structureAligned) return null;

  // Pullback test — price must currently be near a known retracement
  // anchor: VWAP, EMA20 (15m), a directional FVG, or a swing point.
  const last15m = ctx.candles15m[ctx.candles15m.length - 1];
  const close = last15m.close;
  const vwap = ctx.bias.vwap.current;
  const atr = ctx.atr15m;
  const tolerance = atr * 0.5;

  const anchors: Array<{ price: number; label: string }> = [];
  if (vwap != null) anchors.push({ price: vwap, label: "VWAP" });
  // FVGs in trend direction from the last 20 15m bars.
  const fvgs = findFvgs(ctx.candles15m, direction).slice(-3);
  for (const f of fvgs) {
    anchors.push({ price: (f.high + f.low) / 2, label: `15m ${direction} FVG ${f.low.toFixed(5)}-${f.high.toFixed(5)}` });
  }
  // Swing levels.
  const recentSwingLevels = ctx.activeLevels
    .filter((l) => /swing|prev_session|prev_day|prev_week/.test(l.levelType))
    .map((l) => ({ price: l.price, label: l.levelType }));
  anchors.push(...recentSwingLevels);

  // Pick the closest anchor in the pullback direction (price is
  // pulling back AWAY from the trend, so for bullish setups we want
  // the closest anchor BELOW close; for bearish, ABOVE close).
  const pullbackAnchors = anchors.filter((a) =>
    direction === "bullish" ? a.price <= close + tolerance && a.price >= close - tolerance * 3
                            : a.price >= close - tolerance && a.price <= close + tolerance * 3,
  );
  if (pullbackAnchors.length === 0) return null;
  // Closest to current price wins.
  pullbackAnchors.sort((a, b) => Math.abs(close - a.price) - Math.abs(close - b.price));
  const anchor = pullbackAnchors[0];

  // 5m confirmation: latest 5m must be a body candle in trend direction.
  const last5m = ctx.candles5m[ctx.candles5m.length - 1];
  const range5m = last5m.high - last5m.low;
  const body5m = Math.abs(last5m.close - last5m.open);
  if (range5m <= 0) return null;
  const bodyRatio5m = body5m / range5m;
  const continuationCandle = bodyRatio5m >= 0.5 &&
    (direction === "bullish" ? last5m.close > last5m.open : last5m.close < last5m.open);
  if (!continuationCandle) return null;

  // ── Levels ─────────────────────────────────────────────────────────────
  const entryMid = last5m.close;
  const buffer = (ctx.atr5m ?? atr) * 0.3;
  // SL beyond the most recent 15m swing OR anchor price.
  const swingFloor = direction === "bullish"
    ? Math.min(...ctx.candles15m.slice(-6).map((c) => c.low))
    : Math.max(...ctx.candles15m.slice(-6).map((c) => c.high));
  const stopLoss = direction === "bullish" ? swingFloor - buffer : swingFloor + buffer;
  const risk = Math.abs(entryMid - stopLoss);
  if (risk <= 0) return null;
  const minTp = risk * 1.5;
  const opposingLevels = ctx.activeLevels
    .map((l) => l.price)
    .filter((p) => direction === "bullish" ? p > entryMid + minTp : p < entryMid - minTp)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = opposingLevels[0] ?? (direction === "bullish" ? entryMid + risk * 1.8 : entryMid - risk * 1.8);
  const tp2 = opposingLevels[1] ?? (direction === "bullish" ? entryMid + risk * 2.5 : entryMid - risk * 2.5);
  const tp3 = direction === "bullish" ? entryMid + risk * 3.5 : entryMid - risk * 3.5;
  const rr = Math.abs(tp1 - entryMid) / risk;
  if (rr < 1.2) return null;

  // ── 8-component score ─────────────────────────────────────────────────
  const biasAlignment = Math.min(15, Math.round((ctx.bias.conviction / 100) * 15));
  // No specific liquidity event required here; reward if a recent sweep aligned.
  const sweep = ctx.recentSweeps[0];
  const sweepDirOk = sweep && (
    (direction === "bullish" && sweep.sweepDirection === "bullish_sweep") ||
    (direction === "bearish" && sweep.sweepDirection === "bearish_sweep")
  );
  const liquidityEvent = sweepDirOk ? 12 : 7;
  const microStructure = ev15 === expectedBos ? 14 : 10; // BOS = strong, CHoCH = good
  // Entry zone quality: closer to the anchor = higher.
  const distToAnchor = Math.abs(close - anchor.price);
  const entryZoneQuality = distToAnchor < tolerance * 0.3 ? 14
                         : distToAnchor < tolerance * 0.6 ? 11
                         : 8;
  const momentum = Math.round(bodyRatio5m * 14);
  const volatilitySpread = scoreVolatility(range5m, ctx.atr5m ?? atr, rr, risk);
  const rrScore = scoreRR(rr);
  const sessionTiming = ctx.bias.session.timingScore;

  const score = computeMiniScore({
    biasAlignment, liquidityEvent, microStructure,
    entryZoneQuality, momentumDisplacement: momentum,
    volatilitySpread, riskReward: rrScore, sessionTiming,
  });

  const gates: MiniGate[] = [
    { id: "session",   label: "Active session",                              passed: !ctx.bias.session.noTradeZone, evidence: ctx.bias.session.label, hard: true },
    { id: "bias",      label: `1H bias ${direction} with conviction ≥50`,    passed: true, evidence: `${ctx.bias.state} (${ctx.bias.conviction})`, hard: true },
    { id: "structure", label: `15m structure agrees (BOS/CHoCH ${direction})`, passed: structureAligned, evidence: ev15 ?? "—", hard: true },
    { id: "anchor",    label: "Price near retracement anchor",                passed: true, evidence: `${anchor.label} @ ${anchor.price.toFixed(5)}, dist=${(distToAnchor / atr).toFixed(2)} ATR` },
    { id: "5m",        label: "5m continuation candle (body ≥50% range)",     passed: continuationCandle, evidence: `body ${(bodyRatio5m * 100).toFixed(0)}% of range`, hard: true },
    { id: "rr",        label: "≥1.5R on TP1",                                  passed: rr >= 1.5, evidence: `${rr.toFixed(2)}R` },
  ];

  const explanation =
    `${direction === "bullish" ? "Bullish" : "Bearish"} intraday trend continuation — ` +
    `1H bias ${ctx.bias.state} (conviction ${ctx.bias.conviction}), ` +
    `15m ${ev15 === expectedBos ? "BOS" : "CHoCH"} aligned, ` +
    `pullback into ${anchor.label} @ ${anchor.price.toFixed(5)}, ` +
    `5m continuation candle confirms. Score ${score.total}/100 (${score.grade}). RR ${rr.toFixed(2)}R.`;

  return {
    template: "intraday_trend_continuation",
    direction,
    entryTimeframe: "15m",
    speedClass: "intraday_15m",
    entryZoneLow: Math.min(anchor.price, entryMid),
    entryZoneHigh: Math.max(anchor.price, entryMid),
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: tp3,
    riskReward: rr,
    entryType: "market",
    expectedHoldMinutes: 60,
    validityMinutes: 60,
    components: score.components,
    gates,
    explanation,
    invalidation: `15m close beyond SL ${stopLoss.toFixed(5)} or opposing 15m CHoCH invalidates this signal.`,
  };
}

interface FVG { direction: "bullish" | "bearish"; high: number; low: number; }
function findFvgs(candles: { open: number; high: number; low: number; close: number }[], dir: "bullish" | "bearish"): FVG[] {
  const out: FVG[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    const range = c2.high - c2.low;
    if (range <= 0) continue;
    const body = Math.abs(c2.close - c2.open);
    if (body / range < 0.6) continue;
    if (dir === "bullish" && c1.high < c3.low && c2.close > c2.open) {
      out.push({ direction: "bullish", high: c3.low, low: c1.high });
    } else if (dir === "bearish" && c1.low > c3.high && c2.close < c2.open) {
      out.push({ direction: "bearish", high: c1.low, low: c3.high });
    }
  }
  return out;
}
