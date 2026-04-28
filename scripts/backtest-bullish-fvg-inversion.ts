// Quick backtest harness for the Bullish FVG Inversion signal.
//
// Re-implements the core detection logic against historical candles in the
// candle store (≈50 days of 1h + 5min). Limitations vs. live:
//   - HTF bias is derived from candles only (close > EMA50 + recent HH),
//     not from the brain's StructureState.
//   - No activeLevels / recentSweeps from the DB. TPs default to R-multiples;
//     opposing-supply gate is skipped. Slightly more permissive than live.
//   - Score is computed but only the final grade is reported per signal —
//     in production the live algos require A or A+.
//
// For each detected signal, looks ahead up to 24 1H bars to determine
// outcome: which level was touched first (TP1 or SL). Sequence ties broken
// using 5-min candles within the same hour.

import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

interface Candle {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

const DISPLACEMENT_BODY_RATIO = 0.6;
const MIN_HTF_CANDLES = 30;
const MIN_LTF_CANDLES = 12;
const MAX_HTF_FVG_AGE_BARS = 30;
const MIN_TAP_DEPTH = 0.25;
const MAX_TAP_DEPTH = 0.85;
const DEALING_RANGE_LOOKBACK = 30;
const LOOK_FORWARD_HOURS = 24;
const ATR_PERIOD = 14;
const EMA50_PERIOD = 50;

interface FVGZone {
  direction: "bullish" | "bearish";
  high: number;
  low: number;
  formedAtIndex: number;
  originOpen: number;
}

interface Signal {
  symbol: string;
  triggeredAt: Date;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  score: number;
}

interface Outcome {
  signal: Signal;
  result: "tp1" | "sl" | "open" | "neither";
  hoursToResolution: number | null;
  rMultiple: number | null;
}

function isBullishDisplacement(c: Candle): boolean {
  const range = c.high - c.low;
  const body = Math.abs(c.close - c.open);
  return c.close > c.open && range > 0 && body / range >= DISPLACEMENT_BODY_RATIO;
}
function isBearishDisplacement(c: Candle): boolean {
  const range = c.high - c.low;
  const body = Math.abs(c.close - c.open);
  return c.close < c.open && range > 0 && body / range >= DISPLACEMENT_BODY_RATIO;
}

function findFVGs(candles: Candle[]): FVGZone[] {
  const out: FVGZone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2], c2 = candles[i - 1], c3 = candles[i];
    if (c1.high < c3.low && isBullishDisplacement(c2)) {
      out.push({ direction: "bullish", high: c3.low, low: c1.high, formedAtIndex: i, originOpen: c1.open });
    }
    if (c1.low > c3.high && isBearishDisplacement(c2)) {
      out.push({ direction: "bearish", high: c1.low, low: c3.high, formedAtIndex: i, originOpen: c1.open });
    }
  }
  return out;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

function atr(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function biasFromCandles(candles: Candle[]): "bullish" | "bearish" | "range" {
  // Looser proxy than the production detector's StructureState.
  // Bullish if last close > EMA20 AND EMA20 > EMA50 (a basic trend stack).
  const closes = candles.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, EMA50_PERIOD);
  if (e20 == null) return "range";
  const last = candles[candles.length - 1].close;
  if (e50 == null) return last > e20 ? "bullish" : "bearish";
  if (last > e20 && e20 > e50) return "bullish";
  if (last < e20 && e20 < e50) return "bearish";
  return "range";
}

function pickTappedBullishFVG(fvgs: FVGZone[], candles: Candle[]): FVGZone | null {
  const lastIdx = candles.length - 1;
  for (let k = fvgs.length - 1; k >= 0; k--) {
    const fvg = fvgs[k];
    const age = lastIdx - fvg.formedAtIndex;
    if (age > MAX_HTF_FVG_AGE_BARS || age < 1) continue;
    const height = fvg.high - fvg.low;
    if (height <= 0) continue;
    let deepest = 0, closedBelow = false;
    for (let i = fvg.formedAtIndex + 1; i < candles.length; i++) {
      const c = candles[i];
      if (c.close < fvg.low) { closedBelow = true; break; }
      if (c.low <= fvg.high && c.low >= fvg.low) {
        const d = (fvg.high - c.low) / height;
        if (d > deepest) deepest = d;
      } else if (c.low < fvg.low) {
        deepest = 1;
      }
    }
    if (closedBelow) continue;
    if (deepest >= MIN_TAP_DEPTH && deepest <= MAX_TAP_DEPTH) return fvg;
  }
  return null;
}

interface InversionZone { high: number; low: number; originOpen: number }

function findRecentBearishFVGFailure(candles: Candle[]): InversionZone | null {
  const fvgs = findFVGs(candles).filter((f) => f.direction === "bearish");
  for (let k = fvgs.length - 1; k >= 0; k--) {
    const fvg = fvgs[k];
    const age = candles.length - 1 - fvg.formedAtIndex;
    if (age > 30 || age < 1) continue;
    let failedAt = -1;
    for (let i = fvg.formedAtIndex + 1; i < candles.length; i++) {
      const c = candles[i];
      if (c.close > fvg.originOpen && isBullishDisplacement(c)) { failedAt = i; break; }
    }
    if (failedAt === -1) continue;
    let stillInverted = true;
    for (let i = failedAt + 1; i < candles.length; i++) {
      if (candles[i].close < fvg.low) { stillInverted = false; break; }
    }
    if (!stillInverted) continue;
    return { high: fvg.high, low: fvg.low, originOpen: fvg.originOpen };
  }
  return null;
}

const layerCounts: Record<string, number> = {};
function bail(layer: string): null { layerCounts[layer] = (layerCounts[layer] ?? 0) + 1; return null; }

// Set HTF_ONLY=1 to skip the 5m inversion gate (sparse historical data).
// Useful to see whether the 1H side of the strategy is well-calibrated.
const HTF_ONLY = process.env.HTF_ONLY === "1";

function detect(htf: Candle[], ltf: Candle[]): Signal | null {
  if (htf.length < MIN_HTF_CANDLES) return bail("L0_data");
  if (!HTF_ONLY && ltf.length < MIN_LTF_CANDLES) return bail("L0_ltf_data");
  const a = atr(htf, ATR_PERIOD);
  if (!a) return bail("L0_atr");
  if (biasFromCandles(htf) !== "bullish") return bail("L1_bias");

  const range = htf.slice(-DEALING_RANGE_LOOKBACK);
  const high = Math.max(...range.map((c) => c.high));
  const low = Math.min(...range.map((c) => c.low));
  const fillPct = (htf[htf.length - 1].close - low) / Math.max(high - low, 1e-9);
  if (fillPct > 0.6) return bail("L1_premium");

  const fvgs = findFVGs(htf).filter((f) => f.direction === "bullish");
  if (fvgs.length === 0) return bail("L2_no_fvg");
  const tap = pickTappedBullishFVG(fvgs, htf);
  if (!tap) return bail("L3_no_tap");

  let inv: InversionZone;
  if (HTF_ONLY) {
    // Synthetic inversion = bottom 30% of the 1H FVG.
    const h = tap.high - tap.low;
    inv = { high: tap.low + h * 0.3, low: tap.low, originOpen: tap.originOpen };
  } else {
    const real = findRecentBearishFVGFailure(ltf);
    if (!real) return bail("L4_no_inversion");
    if (real.high < tap.low || real.low > tap.high) return bail("L4_no_overlap");
    inv = real;
  }

  const entry = (inv.low + inv.high) / 2;
  const stopLoss = inv.low - a * 0.2;
  if (stopLoss >= entry) return bail("L5_bad_sl");
  const risk = entry - stopLoss;
  const tp1 = entry + risk * 2;
  const tp2 = entry + risk * 3;

  // Score (truncated — no ctx.activeLevels/recentSweeps in backtest)
  let score = 0;
  score += 15; // bias
  score += 10; // 1h FVG
  score += 15; // 1m inversion
  score += 15; // 1m displacement
  if (fillPct <= 0.5) score += 10;
  else score += Math.max(0, (0.6 - fillPct) * 100);
  score += 5; // session
  score += 10; // no news (default)
  score += 10; // no opposing supply (skipped gate)
  score += 5; // RR floor
  return {
    symbol: "",
    triggeredAt: htf[htf.length - 1].openTime,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: 2,
    score: Math.min(100, score),
  };
}

async function loadCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  const rows = await prisma.candle.findMany({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "asc" },
    select: { openTime: true, open: true, high: true, low: true, close: true },
  });
  return rows;
}

function resolveOutcome(signal: Signal, htfFuture: Candle[], ltfAll: Candle[]): { result: Outcome["result"]; hours: number | null; r: number | null } {
  const futureWindow = htfFuture.slice(0, LOOK_FORWARD_HOURS);
  const startTime = signal.triggeredAt.getTime();
  for (let i = 0; i < futureWindow.length; i++) {
    const c = futureWindow[i];
    const hitTP = c.high >= signal.takeProfit1;
    const hitSL = c.low <= signal.stopLoss;
    if (!hitTP && !hitSL) continue;
    if (hitTP && !hitSL) return { result: "tp1", hours: i + 1, r: 2 };
    if (hitSL && !hitTP) return { result: "sl", hours: i + 1, r: -1 };
    // Both touched in same 1h bar — break tie with 5m sequence
    const barStart = c.openTime.getTime();
    const barEnd = barStart + 60 * 60 * 1000;
    const ltfBars = ltfAll.filter((l) => l.openTime.getTime() >= barStart && l.openTime.getTime() < barEnd);
    for (const lc of ltfBars) {
      if (lc.high >= signal.takeProfit1) return { result: "tp1", hours: i + 1, r: 2 };
      if (lc.low <= signal.stopLoss) return { result: "sl", hours: i + 1, r: -1 };
    }
    // Couldn't disambiguate — call it a wash
    return { result: "neither", hours: i + 1, r: null };
  }
  // Look-forward exhausted with no resolution
  void startTime;
  return { result: "open", hours: null, r: null };
}

async function main() {
  const symbols = ["EURUSD", "GBPUSD", "AUDUSD", "USDJPY", "NZDUSD", "USDCHF", "USDCAD", "EURJPY", "GBPJPY", "XAUUSD", "BTCUSD", "ETHUSD"];

  const allOutcomes: Outcome[] = [];
  let totalChecks = 0;

  for (const symbol of symbols) {
    const [htf, ltf] = await Promise.all([loadCandles(symbol, "1h"), loadCandles(symbol, "5min")]);
    if (htf.length < MIN_HTF_CANDLES + 20) {
      console.log(`  ${symbol}: skipped (only ${htf.length} 1h bars)`);
      continue;
    }

    let symbolFires = 0;
    for (let i = MIN_HTF_CANDLES; i < htf.length - LOOK_FORWARD_HOURS; i++) {
      totalChecks++;
      const htfSlice = htf.slice(0, i + 1);
      // 5-min candles up to this 1h close
      const closeTime = htfSlice[htfSlice.length - 1].openTime.getTime() + 60 * 60 * 1000;
      const ltfSlice = ltf.filter((l) => l.openTime.getTime() < closeTime).slice(-60);
      const sig = detect(htfSlice, ltfSlice);
      if (!sig) continue;
      sig.symbol = symbol;
      const future = htf.slice(i + 1);
      const { result, hours, r } = resolveOutcome(sig, future, ltf);
      allOutcomes.push({ signal: sig, result, hoursToResolution: hours, rMultiple: r });
      symbolFires++;
    }
    console.log(`  ${symbol}: ${symbolFires} signals fired across ${htf.length - MIN_HTF_CANDLES - LOOK_FORWARD_HOURS} bar checks`);
  }

  console.log(`\n=== Layer-by-layer bail counts ===`);
  for (const [k, v] of Object.entries(layerCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }

  console.log(`\n=== Backtest Summary ===`);
  console.log(`Total signals: ${allOutcomes.length} (from ${totalChecks} bar evaluations)`);
  if (allOutcomes.length === 0) {
    console.log("No fires — detector is too tight against historical data, OR data is too thin.");
    await prisma.$disconnect();
    return;
  }
  const tp = allOutcomes.filter((o) => o.result === "tp1");
  const sl = allOutcomes.filter((o) => o.result === "sl");
  const open = allOutcomes.filter((o) => o.result === "open");
  const wash = allOutcomes.filter((o) => o.result === "neither");
  const resolved = tp.length + sl.length;
  const winRate = resolved > 0 ? (tp.length / resolved) * 100 : 0;
  const avgR = resolved > 0
    ? allOutcomes.filter((o) => o.rMultiple != null).reduce((acc, o) => acc + o.rMultiple!, 0) / resolved
    : 0;
  console.log(`  TP1 hits:       ${tp.length}`);
  console.log(`  SL hits:        ${sl.length}`);
  console.log(`  Wash (both):    ${wash.length}`);
  console.log(`  Still open:     ${open.length}`);
  console.log(`  Win rate:       ${winRate.toFixed(1)}%`);
  console.log(`  Avg R/trade:    ${avgR.toFixed(2)}`);
  console.log(`  Expectancy:     ${(winRate / 100 * 2 - (1 - winRate / 100) * 1).toFixed(2)}R per signal at ${winRate.toFixed(0)}% with 2:1 RR`);
  if (resolved >= 3) {
    const grades: Record<string, { n: number; wins: number }> = {};
    for (const o of allOutcomes) {
      const g = o.signal.score >= 90 ? "A+" : o.signal.score >= 80 ? "A" : o.signal.score >= 65 ? "B" : "C";
      const k = grades[g] ?? (grades[g] = { n: 0, wins: 0 });
      k.n++;
      if (o.result === "tp1") k.wins++;
    }
    console.log(`\nBy grade:`);
    for (const [g, v] of Object.entries(grades)) {
      console.log(`  ${g}: ${v.n} signals, ${v.wins} wins (${v.n > 0 ? ((v.wins / v.n) * 100).toFixed(0) : 0}%)`);
    }
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
