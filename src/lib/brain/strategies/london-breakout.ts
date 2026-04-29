// PDF Strategy 11 — London Breakout.
//
// Asian range = 20:00 EST → 02:00 EST = 00:00 UTC → 07:00 UTC
// (the brain's day boundary lands at midnight UTC; we compute the
// range from the M15 candles whose openTime falls in that window).
//
// Setup: at London open (07:00–10:00 UTC), price closes a full body
// outside the Asian range, retests the broken level within 1–3 candles,
// and re-rejects with a body close back in the breakout direction.

import type { DetectedSetup } from "@/lib/brain/strategies-types";
import { scoreEps, volumeMA, loadCandles, loadStructure, type CandleRow, type GateOutcome, pricePips } from "@/lib/brain/strategies/eps-scoring";

interface StrategyContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastEventType?: string | null } | null;
  indicators: { atr14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date; sweepDirection?: string }>;
  activeLevels: Array<{ levelType: string; price: number }>;
  atr: number | null;
}

export async function detectLondonBreakout(ctx: StrategyContext): Promise<DetectedSetup | null> {
  if (ctx.timeframe !== "15m") return null;
  if (ctx.candles.length < 30 || !ctx.atr) return null;

  // Hard time gate: only fires during London Open window 07:00–10:00 UTC.
  const now = new Date();
  const h = now.getUTCHours();
  if (h < 7 || h >= 10) return null;

  // ── Build the Asian range from candles inside 20:00–02:00 UTC ────────
  // Walk backward from the most recent candle and collect candles whose
  // openTime hour ∈ {20,21,22,23,0,1}. Group them into a single window.
  const asianBars: CandleRow[] = [];
  for (let i = ctx.candles.length - 1; i >= 0 && asianBars.length < 30; i--) {
    const c = ctx.candles[i];
    const ch = c.openTime.getUTCHours();
    if (ch >= 20 || ch < 2) asianBars.unshift(c);
    else if (asianBars.length > 0) break;
  }
  if (asianBars.length < 4) return null;
  let asianHigh = -Infinity, asianLow = Infinity;
  for (const c of asianBars) {
    if (c.high > asianHigh) asianHigh = c.high;
    if (c.low < asianLow) asianLow = c.low;
  }
  const rangeWidth = asianHigh - asianLow;
  if (!Number.isFinite(rangeWidth) || rangeWidth <= 0) return null;

  // ── Find the break candle (full body outside Asian range, post-07:00 UTC) ──
  let breakIdx = -1;
  let direction: "bullish" | "bearish" | null = null;
  for (let i = ctx.candles.length - 1; i >= Math.max(0, ctx.candles.length - 12); i--) {
    const c = ctx.candles[i];
    if (c.openTime.getUTCHours() < 7) break;
    if (c.close > asianHigh && c.open < asianHigh) { breakIdx = i; direction = "bullish"; break; }
    if (c.close < asianLow && c.open > asianLow)  { breakIdx = i; direction = "bearish"; break; }
  }
  if (breakIdx === -1 || !direction) return null;

  // Retest: one of the candles AFTER the break must touch the broken
  // level within 1–3 candles, and price should now be re-rejecting it.
  const postBreak = ctx.candles.slice(breakIdx + 1, breakIdx + 5);
  const brokenLevel = direction === "bullish" ? asianHigh : asianLow;
  const retest = postBreak.find((c) =>
    direction === "bullish" ? c.low <= brokenLevel : c.high >= brokenLevel,
  );
  if (!retest) return null;

  // Latest candle must be a body rejection in trade direction.
  const last = ctx.candles[ctx.candles.length - 1];
  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  if (range <= 0 || body / range < 0.4) return null;
  const bodyDirOk = direction === "bullish" ? last.close > last.open : last.close < last.open;
  if (!bodyDirOk) return null;

  // HTF bias must align — D1 trend.
  const [structureD1, candles15mVol] = await Promise.all([
    loadStructure(ctx.symbol, "1d"),
    loadCandles(ctx.symbol, "15m", 80, true),
  ]);
  if (structureD1?.bias && structureD1.bias !== direction) return null;

  // ── Levels ────────────────────────────────────────────────────────────
  const entry = last.close;
  const buffer = ctx.atr * 0.3;
  // PDF SL: below Asian range midpoint (aggressive) or below Asian low (conservative).
  // Use conservative: beyond opposite extreme.
  const stopLoss = direction === "bullish" ? asianLow - buffer : asianHigh + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;
  // Target = previous day high/low.
  const targets = ctx.activeLevels
    .filter((l) => /prev_day|session_high|session_low/.test(l.levelType))
    .filter((l) => direction === "bullish" ? l.price > entry + risk * 2 : l.price < entry - risk * 2)
    .map((l) => l.price)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = targets[0] ?? (direction === "bullish" ? entry + risk * 2.5 : entry - risk * 2.5);
  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 2) return null;
  const tp2 = direction === "bullish" ? entry + risk * 4 : entry - risk * 4;

  // ── EPS factors ──────────────────────────────────────────────────────
  const widthPips = pricePips(rangeWidth, ctx.symbol);
  // Tighter Asian range = higher LQ (PDF: "tighter coil = more explosive breakout")
  const lq = widthPips <= 25 ? 95 : widthPips <= 40 ? 80 : 65;
  const loc = 75; // breakout level backed by Asian range
  const mom = body / range >= 0.6 ? 88 : 72;
  const vol20 = volumeMA(candles15mVol, 20);
  const vol = vol20 != null && last.volume != null && last.volume > vol20 ? 85 : 60;
  const eps = scoreEps({ lq, loc, mom, vol, time: 100 }); // gated to London window
  if (eps.tier === "SUPPRESSED") return null;

  const gates: GateOutcome[] = [
    { id: "session", label: "London open window 07–10 UTC",       passed: true, evidence: `${h.toString().padStart(2,"0")}:${now.getUTCMinutes().toString().padStart(2,"0")} UTC` },
    { id: "range",   label: "Asian range identified",              passed: true, evidence: `[${asianLow.toFixed(5)}–${asianHigh.toFixed(5)}] (${widthPips.toFixed(1)}p, ${asianBars.length} bars)` },
    { id: "break",   label: "Body close outside Asian range",      passed: true, evidence: `${direction} break candle close ${ctx.candles[breakIdx].close.toFixed(5)}` },
    { id: "retest",  label: "Retest within 1–3 candles",           passed: true, evidence: `retest ${retest.openTime.getUTCHours()}:${retest.openTime.getUTCMinutes().toString().padStart(2,"0")} UTC` },
    { id: "rejection", label: "Body rejection candle",             passed: true, evidence: `body ${(body/range*100).toFixed(0)}% of range` },
    { id: "d1",      label: "D1 bias aligns",                      passed: !structureD1?.bias || structureD1.bias === direction, evidence: `D1=${structureD1?.bias ?? "—"}` },
    { id: "rr",      label: "≥2:1 RR",                              passed: rr >= 2, evidence: `${rr.toFixed(2)}R to ${tp1.toFixed(5)}` },
  ];

  return {
    setupType: "london_breakout",
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: rr,
    confidenceScore: eps.score,
    qualityGrade: eps.qualityGrade,
    explanation: `London breakout — Asian range [${asianLow.toFixed(5)}–${asianHigh.toFixed(5)}] (${widthPips.toFixed(1)}p) broken ${direction} at ${ctx.candles[breakIdx].close.toFixed(5)}, retested and rejected. EPS ${eps.score}/100 (${eps.tier}). Entry ${entry.toFixed(5)}, SL ${stopLoss.toFixed(5)}, TP1 ${tp1.toFixed(5)} (${rr.toFixed(2)}R).`,
    invalidation: `Break candle closes back inside Asian range on the same candle — failed breakout.`,
    validHours: 3, // London open window remainder
    metadata: { strategy: "london_breakout", tier: eps.tier, eps: eps.score, factors: eps.factors, asianRange: { high: asianHigh, low: asianLow, widthPips }, gates },
  };
}
