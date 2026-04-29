// Triple Lock (Power of 3) — auto-detector port of the manual checklist
// strategy from TripleLockStrategy.jsx.
//
// 3 engines, 12 gates, max 120 pts:
//   PO3       (g1-g3, 45 pts)  HTF bias, accumulation, manipulation+CHoCH
//   VP/OF     (g4-g6, 32 pts)  HEURISTICS — brain has no tick/footprint
//   CCTE      (g7-g9, 23 pts)  bias re-confirm, counter-candle, streak
//   Universal (g10-g12, 20 pts) session, S/R clear, ≥3:1 RR
//
// Tiers: Tier 1 ≥90% (≥108pts), Tier 2 ≥75% (≥90), Tier 3 ≥60% (≥72).
// Below 72 we drop the detection (too noisy to surface).
//
// VP/OF heuristic stand-ins (gates 4-6) are tagged source: "heuristic"
// in the per-gate breakdown so the trader knows those points are
// approximations, not confirmed reads from a real volume profile or
// footprint chart. Each emits a plausible substitute:
//   g4: sweep wick lands within 5p of an active liquidityLevel
//       (prev day H/L, prev week H/L, swing) — proxies "hit a VP level"
//   g5: candle morphology — long wick + body closes ≥70% back inside
//       + next 1-2 candles fail to break the wick extreme — proxies
//       "absorption"
//   g6: synthetic delta = Σ(volume × candle direction) across recent
//       swing — proxies "cumulative delta divergence"
//
// Run on the 15m pass — the strategy's central event (sweep + CHoCH)
// is a 15m structure event. Multi-timeframe context is loaded
// internally for HTF bias (4h, 1h) and the LTF execution (5m).

import { prisma } from "@/lib/prisma";
import type { DetectedSetup } from "@/lib/brain/strategies-types";

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandleRowWithVolume extends CandleRow {
  volume: number | null;
}

interface StrategyContext {
  symbol: string;
  timeframe: string;
  instrumentId: string | null;
  candles: CandleRow[];
  structure: { bias?: string | null; lastSwingHigh?: number | null; lastSwingLow?: number | null; lastEventType?: string | null } | null;
  indicators: { trendBias?: string | null; momentum?: string | null; rsi14?: number | null; ema20?: number | null; atr14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date; sweepCandleTime?: Date; sweepDirection?: string; sweepHigh?: number; sweepLow?: number; sweepClose?: number; levelType?: string; levelPrice?: number; reversalStrength?: number }>;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

// One gate's result. `pts` is the gate's max contribution; the gate
// either contributes the full amount or zero (no partial credit in
// this implementation — keeps the breakdown legible).
interface GateResult {
  id: string;
  num: number;
  engine: "PO3" | "VP/OF" | "CCTE" | "Universal";
  label: string;
  pts: number;
  passed: boolean;
  evidence: string;
  source: "direct" | "heuristic";
}

const GATE_DEFS = [
  { id: "g1",  num: 1,  engine: "PO3" as const,       pts: 15, label: "HTF bias confirmed" },
  { id: "g2",  num: 2,  engine: "PO3" as const,       pts: 15, label: "Accumulation range detected" },
  { id: "g3",  num: 3,  engine: "PO3" as const,       pts: 15, label: "Manipulation sweep + CHoCH" },
  { id: "g4",  num: 4,  engine: "VP/OF" as const,     pts: 12, label: "Sweep hit a key level (~heuristic)" },
  { id: "g5",  num: 5,  engine: "VP/OF" as const,     pts: 12, label: "Absorption proxy (~heuristic)" },
  { id: "g6",  num: 6,  engine: "VP/OF" as const,     pts: 8,  label: "Synthetic CD divergence (~heuristic)" },
  { id: "g7",  num: 7,  engine: "CCTE" as const,      pts: 10, label: "CCTE HTF bias matches distribution" },
  { id: "g8",  num: 8,  engine: "CCTE" as const,      pts: 8,  label: "5m counter-candle formed" },
  { id: "g9",  num: 9,  engine: "CCTE" as const,      pts: 5,  label: "No 5m streak violation" },
  { id: "g10", num: 10, engine: "Universal" as const, pts: 5,  label: "Session timing active" },
  { id: "g11", num: 11, engine: "Universal" as const, pts: 8,  label: "S/R path clear to TP" },
  { id: "g12", num: 12, engine: "Universal" as const, pts: 7,  label: "≥3:1 RR achievable" },
] as const;

const MAX_SCORE = 120;
const TIER_3_THRESHOLD = 72;  // 60% — minimum we'll surface
const TIER_2_THRESHOLD = 90;  // 75%
const TIER_1_THRESHOLD = 108; // 90%

// Asian session window in UTC (per script). Used for the accumulation
// range detection. The window crosses UTC midnight, so the helper
// handles both halves.
const ASIAN_START_HOUR_UTC = 20; // previous day 20:00
const ASIAN_END_HOUR_UTC = 2;    // current day 02:00

export async function detectTripleLock(ctx: StrategyContext): Promise<DetectedSetup | null> {
  // Anchor pass: 15m. The strategy's central event (sweep + CHoCH) is a
  // 15m structure event; we cross-load 4h/1h/5m below.
  if (ctx.timeframe !== "15m") return null;
  if (ctx.candles.length < 20 || !ctx.atr) return null;

  // Cross-timeframe context loaded once.
  const [
    candles4h,
    candles1h,
    candles5m,
    candles15mWithVol,
    structure4h,
    structure1h,
    structure5m,
  ] = await Promise.all([
    loadCandles(ctx.symbol, "4h", 60),
    loadCandles(ctx.symbol, "1h", 80),
    loadCandlesWithVolume(ctx.symbol, "5m", 100),
    loadCandlesWithVolume(ctx.symbol, "15m", 100),
    loadStructure(ctx.symbol, "4h"),
    loadStructure(ctx.symbol, "1h"),
    loadStructure(ctx.symbol, "5m"),
  ]);

  if (candles4h.length < 5 || candles1h.length < 10 || candles5m.length < 10) return null;

  // ── Direction: from the 4h structure bias ──────────────────────────────
  const htfBias = structure4h?.bias ?? null;
  if (htfBias !== "bullish" && htfBias !== "bearish") return null;
  const direction: "bullish" | "bearish" = htfBias;

  // ── Run all 12 gate checks ─────────────────────────────────────────────
  const gates: GateResult[] = [];

  // Gate 1: HTF bias confirmed (4h, 1h, 15m all agree)
  gates.push(gate("g1", () => {
    const b1h = structure1h?.bias ?? null;
    const b15m = ctx.structure?.bias ?? null;
    const allAgree = b1h === htfBias && b15m === htfBias;
    return {
      passed: allAgree,
      evidence: `4h=${htfBias}, 1h=${b1h ?? "—"}, 15m=${b15m ?? "—"}`,
      source: "direct",
    };
  }));

  // Gate 2: Accumulation range — 4-12 M15 candles inside Asian session,
  // ≥10 pips wide.
  const asian = pickLatestAsianRange(candles15mWithVol, ctx.symbol);
  gates.push(gate("g2", () => {
    if (!asian) return { passed: false, evidence: "no Asian session candles in last 36h", source: "direct" };
    const widthPips = pricePips(asian.high - asian.low, ctx.symbol);
    const ok = asian.candleCount >= 4 && asian.candleCount <= 12 && widthPips >= 10;
    return {
      passed: ok,
      evidence: `${asian.candleCount} M15 bars, ${widthPips.toFixed(1)}p wide [${fmtTime(asian.startUtc)}–${fmtTime(asian.endUtc)} UTC]`,
      source: "direct",
    };
  }));

  // Gate 3: Manipulation sweep complete + CHoCH on 15m within 1-2 candles
  // after the sweep. We use the most recent liquidityEvent as the sweep
  // marker and the 15m structureState.lastEvent as the CHoCH check.
  const recentSweep = ctx.recentSweeps[0] ?? null;
  const sweepIsRecent = recentSweep && (Date.now() - new Date(recentSweep.detectedAt).getTime()) < 4 * 60 * 60 * 1000;
  const sweepDirMatch =
    recentSweep && (
      (direction === "bullish" && recentSweep.sweepDirection === "bullish_sweep") ||
      (direction === "bearish" && recentSweep.sweepDirection === "bearish_sweep")
    );
  const chochEvent = ctx.structure?.lastEventType ?? null;
  const chochMatch =
    (direction === "bullish" && chochEvent === "choch_bullish") ||
    (direction === "bearish" && chochEvent === "choch_bearish");
  gates.push(gate("g3", () => {
    const passed = !!(sweepIsRecent && sweepDirMatch && chochMatch);
    const parts: string[] = [];
    if (!sweepIsRecent) parts.push("no recent sweep (4h window)");
    else if (!sweepDirMatch) parts.push(`sweep direction mismatch (${recentSweep!.sweepDirection})`);
    if (!chochMatch) parts.push(`15m lastEvent=${chochEvent ?? "—"}, expected choch_${direction}`);
    return {
      passed,
      evidence: passed
        ? `swept ${recentSweep!.levelType ?? "level"} @ ${recentSweep!.levelPrice?.toFixed(5) ?? "?"} → 15m ${chochEvent}`
        : parts.join("; "),
      source: "direct",
    };
  }));

  // Gate 4 (HEURISTIC): sweep wick lands within 5p of an active liquidity level.
  gates.push(gate("g4", () => {
    if (!sweepIsRecent || !recentSweep) {
      return { passed: false, evidence: "no sweep to anchor", source: "heuristic" };
    }
    const wickPrice = direction === "bullish" ? (recentSweep.sweepLow ?? recentSweep.levelPrice ?? 0) : (recentSweep.sweepHigh ?? recentSweep.levelPrice ?? 0);
    const fivePips = pipsToPrice(5, ctx.symbol);
    const nearest = ctx.activeLevels
      .map((l) => ({ ...l, dist: Math.abs(l.price - wickPrice) }))
      .sort((a, b) => a.dist - b.dist)[0];
    const passed = !!nearest && nearest.dist <= fivePips;
    return {
      passed,
      evidence: nearest
        ? `wick ${wickPrice.toFixed(5)} ${passed ? "within" : "outside"} 5p of ${nearest.levelType} @ ${nearest.price.toFixed(5)} (${pricePips(nearest.dist, ctx.symbol).toFixed(1)}p)`
        : "no active levels nearby",
      source: "heuristic",
    };
  }));

  // Gate 5 (HEURISTIC): absorption proxy — long wick + body closes ≥70%
  // back inside range + next 1-2 candles fail to break wick extreme.
  gates.push(gate("g5", () => {
    if (!sweepIsRecent || !recentSweep) {
      return { passed: false, evidence: "no sweep to evaluate", source: "heuristic" };
    }
    const sweepClose = recentSweep.sweepClose ?? 0;
    const sweepHigh = recentSweep.sweepHigh ?? 0;
    const sweepLow = recentSweep.sweepLow ?? 0;
    const range = sweepHigh - sweepLow;
    if (range <= 0) return { passed: false, evidence: "sweep range zero", source: "heuristic" };
    const closeBackPct = direction === "bullish"
      ? (sweepClose - sweepLow) / range
      : (sweepHigh - sweepClose) / range;
    const closeBackOk = closeBackPct >= 0.7;
    // Check next 1-2 candles haven't broken the wick extreme.
    const sweepIdx = candles15mWithVol.findIndex((c) => Math.abs(c.openTime.getTime() - new Date(recentSweep.sweepCandleTime ?? 0).getTime()) < 60_000);
    let extremeHeld = true;
    if (sweepIdx >= 0) {
      const next = candles15mWithVol.slice(sweepIdx + 1, sweepIdx + 3);
      for (const c of next) {
        if (direction === "bullish" && c.low < sweepLow) extremeHeld = false;
        if (direction === "bearish" && c.high > sweepHigh) extremeHeld = false;
      }
    }
    const passed = closeBackOk && extremeHeld;
    return {
      passed,
      evidence: `body closed ${(closeBackPct * 100).toFixed(0)}% back inside range, next bars ${extremeHeld ? "held" : "broke"} wick extreme`,
      source: "heuristic",
    };
  }));

  // Gate 6 (HEURISTIC): synthetic CD divergence. Sum signed volume across
  // last 30 5m bars, compare to swing structure on price.
  gates.push(gate("g6", () => {
    const slice = candles5m.slice(-30);
    if (slice.length < 10) return { passed: false, evidence: "insufficient 5m history", source: "heuristic" };
    let synthDelta = 0;
    for (const c of slice) {
      const dir = c.close > c.open ? 1 : c.close < c.open ? -1 : 0;
      synthDelta += dir * (c.volume ?? 1);
    }
    const half = Math.floor(slice.length / 2);
    const firstHalfPriceLow = Math.min(...slice.slice(0, half).map((c) => c.low));
    const secondHalfPriceLow = Math.min(...slice.slice(half).map((c) => c.low));
    const firstHalfPriceHigh = Math.max(...slice.slice(0, half).map((c) => c.high));
    const secondHalfPriceHigh = Math.max(...slice.slice(half).map((c) => c.high));
    let firstHalfDelta = 0, secondHalfDelta = 0;
    for (const c of slice.slice(0, half)) firstHalfDelta += (c.close > c.open ? 1 : -1) * (c.volume ?? 1);
    for (const c of slice.slice(half)) secondHalfDelta += (c.close > c.open ? 1 : -1) * (c.volume ?? 1);
    let diverging = false;
    if (direction === "bullish") {
      diverging = secondHalfPriceLow >= firstHalfPriceLow && secondHalfDelta < firstHalfDelta;
    } else {
      diverging = secondHalfPriceHigh <= firstHalfPriceHigh && secondHalfDelta > firstHalfDelta;
    }
    return {
      passed: diverging,
      evidence: `synth CD ${synthDelta >= 0 ? "+" : ""}${synthDelta.toFixed(0)} across 30 bars; ${diverging ? "diverging" : "lockstep"} with price`,
      source: "heuristic",
    };
  }));

  // Gate 7: CCTE — 15m + 1h bias both match distribution direction.
  gates.push(gate("g7", () => {
    const b1h = structure1h?.bias ?? null;
    const b15m = ctx.structure?.bias ?? null;
    const passed = b1h === direction && b15m === direction;
    return {
      passed,
      evidence: `1h=${b1h ?? "—"}, 15m=${b15m ?? "—"}, expected ${direction}`,
      source: "direct",
    };
  }));

  // Gate 8: 5m counter-candle (real body, opposite trend direction).
  // We treat the most recent fully-closed 5m bar as the trigger candidate.
  const trigger5m = candles5m[candles5m.length - 1] ?? null;
  gates.push(gate("g8", () => {
    if (!trigger5m) return { passed: false, evidence: "no 5m candle", source: "direct" };
    const range = trigger5m.high - trigger5m.low;
    const body = Math.abs(trigger5m.close - trigger5m.open);
    const realBody = range > 0 && body / range >= 0.4;
    const opposite = direction === "bullish" ? trigger5m.close < trigger5m.open : trigger5m.close > trigger5m.open;
    const passed = realBody && opposite;
    return {
      passed,
      evidence: passed
        ? `${direction === "bullish" ? "red" : "green"} 5m bar at ${fmtTime(trigger5m.openTime)} UTC, body ${pricePips(body, ctx.symbol).toFixed(1)}p`
        : `latest 5m: body ${pricePips(body, ctx.symbol).toFixed(1)}p, ${opposite ? "opposite-side" : "trend-side"}, ${realBody ? "real body" : "wick-only"}`,
      source: "direct",
    };
  }));

  // Gate 9: No streak violation — fewer than 3 consecutive trend-direction
  // 5m candles since the last counter-candle.
  gates.push(gate("g9", () => {
    let streak = 0;
    for (let i = candles5m.length - 1; i >= 0; i--) {
      const c = candles5m[i];
      const isTrendCandle = direction === "bullish" ? c.close > c.open : c.close < c.open;
      if (!isTrendCandle) break;
      streak++;
    }
    return {
      passed: streak < 3,
      evidence: `${streak} consecutive trend-side 5m bars (3+ = engine reset)`,
      source: "direct",
    };
  }));

  // Gate 10: Session timing — London 07-10 UTC or NY 13-16 UTC.
  const nowUtc = new Date();
  const hourUtc = nowUtc.getUTCHours();
  gates.push(gate("g10", () => {
    const inLondon = hourUtc >= 7 && hourUtc < 10;
    const inNY = hourUtc >= 13 && hourUtc < 16;
    const session = inLondon ? "London" : inNY ? "NY" : "off-session";
    return {
      passed: inLondon || inNY,
      evidence: `${hourUtc}:${nowUtc.getUTCMinutes().toString().padStart(2, "0")} UTC — ${session}`,
      source: "direct",
    };
  }));

  // Compute provisional entry / SL before gates 11-12 (they need them).
  const entry = trigger5m?.close ?? ctx.candles[ctx.candles.length - 1].close;
  const slBuffer = ctx.atr * 0.3;
  const stopLoss = direction === "bullish"
    ? (recentSweep?.sweepLow ?? entry - ctx.atr) - slBuffer
    : (recentSweep?.sweepHigh ?? entry + ctx.atr) + slBuffer;
  const risk = Math.abs(entry - stopLoss);
  const minTpDistance = risk * 3;

  // Gate 11: S/R path clear from entry to TP (no major level in the way
  // between entry and entry ± 3R).
  gates.push(gate("g11", () => {
    const tpProvisional = direction === "bullish" ? entry + minTpDistance : entry - minTpDistance;
    const between = ctx.activeLevels.filter((l) => {
      if (direction === "bullish") return l.price > entry && l.price < tpProvisional;
      return l.price < entry && l.price > tpProvisional;
    });
    return {
      passed: between.length === 0,
      evidence: between.length === 0
        ? `no levels between ${entry.toFixed(5)} and ${tpProvisional.toFixed(5)}`
        : `${between.length} level(s) blocking: ${between.slice(0, 3).map((l) => l.levelType).join(", ")}`,
      source: "direct",
    };
  }));

  // Gate 12: ≥3:1 RR achievable. Find a viable TP at ≥3R that doesn't
  // overshoot active levels.
  const validLevels = ctx.activeLevels
    .filter((l) => direction === "bullish" ? l.price > entry + minTpDistance : l.price < entry - minTpDistance)
    .map((l) => l.price)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = validLevels[0] ?? (direction === "bullish" ? entry + risk * 3 : entry - risk * 3);
  const tp2 = validLevels[1] ?? (direction === "bullish" ? entry + risk * 5 : entry - risk * 5);
  const rr1 = Math.abs(tp1 - entry) / Math.max(risk, 1e-9);
  gates.push(gate("g12", () => ({
    passed: rr1 >= 3,
    evidence: `TP1 = ${tp1.toFixed(5)} = ${rr1.toFixed(2)}R (entry ${entry.toFixed(5)}, SL ${stopLoss.toFixed(5)})`,
    source: "direct",
  })));

  // ── Score & tier ───────────────────────────────────────────────────────
  const score = gates.filter((g) => g.passed).reduce((sum, g) => sum + g.pts, 0);
  if (score < TIER_3_THRESHOLD) return null; // not strong enough to surface
  if (risk <= 0) return null;
  if (rr1 < 3) return null;

  const tier = score >= TIER_1_THRESHOLD ? "TIER 1 — FIRE"
             : score >= TIER_2_THRESHOLD ? "TIER 2 — ARMED"
             : "TIER 3 — MONITOR";
  // Map to existing qualityGrade strings the rest of the app uses.
  const qualityGrade = score >= TIER_1_THRESHOLD ? "A+"
                     : score >= TIER_2_THRESHOLD ? "A"
                     : "B";

  // EPS as 0-100 percentage — confidence column only takes ints.
  const confidenceScore = Math.round((score / MAX_SCORE) * 100);

  const passedCount = gates.filter((g) => g.passed).length;
  const explanationParts: string[] = [
    `Triple Lock ${direction}: EPS ${confidenceScore}/100, ${passedCount}/12 gates, ${tier}.`,
    asian ? `Asian range ${pricePips(asian.high - asian.low, ctx.symbol).toFixed(1)}p.` : "",
    recentSweep ? `Sweep ${recentSweep.levelType ?? "level"} → 15m ${chochEvent ?? "—"}.` : "",
    `Entry ${entry.toFixed(5)}, SL ${stopLoss.toFixed(5)}, TP1 ${tp1.toFixed(5)} (${rr1.toFixed(2)}R).`,
  ].filter((s) => s.length > 0);

  return {
    setupType: "triple_lock",
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: rr1,
    confidenceScore,
    qualityGrade,
    explanation: explanationParts.join(" "),
    invalidation: `Time-based exit at T-5s of next 5m candle. Hard stop at ${stopLoss.toFixed(5)}. Bias break on 15m or 1h invalidates immediately.`,
    // 30-min shelf life — Triple Lock is a same-candle execution strategy
    // with a 5m time-based exit. After 30 min the structure has shifted
    // enough that the original gates no longer apply.
    validHours: 0.5,
    originalThesis: explanationParts.join(" "),
    requiredConditions: [
      `15m bias remains ${direction}`,
      `1h bias remains ${direction}`,
      `Price stays beyond ${stopLoss.toFixed(5)} stop`,
      `Time exit by T-5s of next 5m candle`,
    ],
    invalidationConditions: [
      `Bias break on 15m or 1h`,
      `${direction === "bullish" ? "Close below" : "Close above"} ${stopLoss.toFixed(5)}`,
      `Streak violation: 3+ trend-side 5m bars without counter-candle`,
      `Session window expires (off-session)`,
    ],
    metadata: {
      strategy: "triple_lock",
      tier,
      eps: confidenceScore,
      score,
      maxScore: MAX_SCORE,
      gatesPassed: passedCount,
      gatesTotal: 12,
      gates,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function gate(id: string, fn: () => { passed: boolean; evidence: string; source: "direct" | "heuristic" }): GateResult {
  const def = GATE_DEFS.find((g) => g.id === id)!;
  const r = fn();
  return { id: def.id, num: def.num, engine: def.engine, label: def.label, pts: def.pts, ...r };
}

async function loadCandles(symbol: string, timeframe: string, take: number): Promise<CandleRow[]> {
  const rows = await prisma.candle.findMany({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "desc" },
    take,
    select: { openTime: true, open: true, high: true, low: true, close: true },
  });
  return rows.reverse() as CandleRow[];
}

async function loadCandlesWithVolume(symbol: string, timeframe: string, take: number): Promise<(CandleRowWithVolume & { sweepCandleTime?: Date })[]> {
  const rows = await prisma.candle.findMany({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "desc" },
    take,
    select: { openTime: true, open: true, high: true, low: true, close: true, volume: true },
  });
  return rows.reverse() as CandleRowWithVolume[];
}

async function loadStructure(symbol: string, timeframe: string) {
  return prisma.structureState.findUnique({
    where: { symbol_timeframe: { symbol, timeframe } },
    select: { bias: true, lastSwingHigh: true, lastSwingLow: true, lastEventType: true },
  });
}

// Pull the most recent Asian-session window from the M15 candles.
// Asian session = previous-day 20:00 UTC → current-day 02:00 UTC. We
// look back through the last 36h of M15 bars to find the most recent
// closed window.
function pickLatestAsianRange(candles: CandleRowWithVolume[], _symbol: string): { high: number; low: number; candleCount: number; startUtc: Date; endUtc: Date } | null {
  if (candles.length < 4) return null;
  const inWindow: CandleRowWithVolume[] = [];
  // Walk newest-first; group bars whose UTC hour is in [20,24) ∪ [0,2).
  for (let i = candles.length - 1; i >= 0; i--) {
    const c = candles[i];
    const h = c.openTime.getUTCHours();
    const inAsian = h >= ASIAN_START_HOUR_UTC || h < ASIAN_END_HOUR_UTC;
    if (inAsian) inWindow.unshift(c);
    else if (inWindow.length > 0) break; // gap means we've passed the window
  }
  if (inWindow.length < 1) return null;
  let high = -Infinity, low = Infinity;
  for (const c of inWindow) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  return {
    high, low,
    candleCount: inWindow.length,
    startUtc: inWindow[0].openTime,
    endUtc: inWindow[inWindow.length - 1].openTime,
  };
}

// Pip arithmetic — JPY pairs use 0.01, indices/metals use 0.1, others 0.0001.
// Crude but matches the rest of the brain's pip handling.
function pipUnit(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.endsWith("JPY")) return 0.01;
  if (s === "XAUUSD" || s === "XAGUSD") return 0.1;
  if (/NAS|US30|SPX|GER|UK|JPN/.test(s)) return 1;
  return 0.0001;
}
function pricePips(priceDelta: number, symbol: string): number {
  return priceDelta / pipUnit(symbol);
}
function pipsToPrice(pips: number, symbol: string): number {
  return pips * pipUnit(symbol);
}
function fmtTime(d: Date): string {
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}
