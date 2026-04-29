// PDF Strategy 10 — ICT Silver Bullet.
//
// Hard time-gated FVG strategy. The detector is COMPLETELY INACTIVE
// outside the three windows:
//   W1 London early : 08:00–09:00 UTC
//   W2 NY AM        : 15:00–16:00 UTC
//   W3 NY afternoon : 19:00–20:00 UTC
//
// Inside a window: a liquidity sweep occurred → FVG forms in the
// reversal direction on M1/M5 → price returns to the FVG and rejects.

import type { DetectedSetup } from "@/lib/brain/strategies-types";
import { scoreEps, volumeMA, loadCandles, loadStructure, type CandleRow, type GateOutcome } from "@/lib/brain/strategies/eps-scoring";

interface StrategyContext {
  symbol: string;
  timeframe: string;
  candles: CandleRow[];
  structure: { bias?: string | null; lastEventType?: string | null } | null;
  indicators: { atr14?: number | null } | null;
  recentSweeps: Array<{ detectedAt: Date; sweepDirection?: string; sweepHigh?: number; sweepLow?: number; levelType?: string; levelPrice?: number }>;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  atr: number | null;
}

interface FVG { direction: "bullish" | "bearish"; high: number; low: number; formedAtIndex: number; formedAt: Date; }
const DISPLACEMENT_BODY_RATIO = 0.6;

interface Window { name: "W1" | "W2" | "W3"; startH: number; endH: number; }
const WINDOWS: Window[] = [
  { name: "W1", startH: 8,  endH: 9  },
  { name: "W2", startH: 15, endH: 16 },
  { name: "W3", startH: 19, endH: 20 },
];

export async function detectSilverBullet(ctx: StrategyContext): Promise<DetectedSetup | null> {
  if (ctx.timeframe !== "5m") return null;
  if (!ctx.atr) return null;

  // Hard gate 1: must be inside a Silver Bullet window. PDF: "Bot is
  // HARD-CODED inactive outside these three windows — no exceptions."
  const now = new Date();
  const h = now.getUTCHours();
  const window = WINDOWS.find((w) => h >= w.startH && h < w.endH);
  if (!window) return null;

  // Pull D1 + 4h structure for direction. PDF: "FVG must form in the
  // direction of H4/D1 bias — no counter-trend Silver Bullets."
  const [structure4h, structureD1, candles5mVol] = await Promise.all([
    loadStructure(ctx.symbol, "4h"),
    loadStructure(ctx.symbol, "1d"),
    loadCandles(ctx.symbol, "5m", 60, true),
  ]);
  const direction = (structureD1?.bias ?? structure4h?.bias ?? null) as "bullish" | "bearish" | null;
  if (direction !== "bullish" && direction !== "bearish") return null;

  // Hard gate 3: a liquidity sweep must have occurred WITHIN the same
  // killzone window (i.e., within last 60 min — windows are 1h wide).
  const sweep = ctx.recentSweeps[0];
  const sweepInWindow = sweep && (Date.now() - new Date(sweep.detectedAt).getTime()) < 60 * 60 * 1000;
  const sweepDirOk = sweep && (
    (direction === "bullish" && sweep.sweepDirection === "bullish_sweep") ||
    (direction === "bearish" && sweep.sweepDirection === "bearish_sweep")
  );
  if (!sweepInWindow || !sweepDirOk) return null;

  // Find a directional FVG that formed AFTER the sweep on 5m.
  const sweepTime = new Date(sweep!.detectedAt).getTime();
  const fvgs = findFVGs(ctx.candles).filter((f) =>
    f.direction === direction && f.formedAt.getTime() > sweepTime,
  );
  if (fvgs.length === 0) return null;
  const fvg = fvgs[fvgs.length - 1]; // most recent post-sweep FVG

  // Price must be returning to the FVG to fill it.
  const last = ctx.candles[ctx.candles.length - 1];
  const inFvg = last.close >= fvg.low && last.close <= fvg.high;
  if (!inFvg) return null;
  // Rejection candle: real body in the trade direction.
  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  if (range <= 0 || body / range < 0.4) return null;
  const rejectionDirOk = direction === "bullish" ? last.close > last.open : last.close < last.open;
  if (!rejectionDirOk) return null;

  // ── Levels ────────────────────────────────────────────────────────────
  const entry = last.close;
  const buffer = ctx.atr * 0.3;
  const stopLoss = direction === "bullish" ? fvg.low - buffer : fvg.high + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;
  // Target = session high/low or previous day extreme.
  const candidates = ctx.activeLevels
    .filter((l) => /prev_day|session/.test(l.levelType))
    .filter((l) => direction === "bullish" ? l.price > entry + risk * 2 : l.price < entry - risk * 2)
    .map((l) => l.price)
    .sort((a, b) => direction === "bullish" ? a - b : b - a);
  const tp1 = candidates[0] ?? (direction === "bullish" ? entry + risk * 2.5 : entry - risk * 2.5);
  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 2) return null;
  const tp2 = direction === "bullish" ? entry + risk * 4 : entry - risk * 4;

  // ── EPS factors ──────────────────────────────────────────────────────
  const lq = sweepInWindow && sweepDirOk ? 90 : 60;
  const loc = 80; // FVG aligned with HTF bias = standard A score
  const mom = body / range >= 0.6 ? 88 : 70;
  const vol20 = volumeMA(candles5mVol, 20);
  const vol = vol20 != null && last.volume != null && last.volume > vol20 ? 85 : 55;
  const eps = scoreEps({ lq, loc, mom, vol, time: 100 }); // window gated above ⇒ TIME = 100
  if (eps.tier === "SUPPRESSED") return null;

  const gates: GateOutcome[] = [
    { id: "window",    label: `Silver Bullet ${window.name} (${window.startH}-${window.endH} UTC)`, passed: true, evidence: `current ${h.toString().padStart(2,"0")}:${now.getUTCMinutes().toString().padStart(2,"0")} UTC` },
    { id: "htf",       label: "Direction matches H4/D1 bias",  passed: true, evidence: `D1=${structureD1?.bias ?? "—"}, 4h=${structure4h?.bias ?? "—"}` },
    { id: "sweep",     label: "Sweep within window",            passed: true, evidence: `${sweep!.sweepDirection} ${sweep!.levelType} @ ${sweep!.levelPrice?.toFixed(5)}` },
    { id: "fvg",       label: "FVG formed AFTER sweep",          passed: true, evidence: `${direction} FVG ${fvg.low.toFixed(5)}-${fvg.high.toFixed(5)}` },
    { id: "rejection", label: "Body rejection inside FVG",       passed: true, evidence: `body ${(body/range*100).toFixed(0)}% of range` },
    { id: "rr",        label: "≥2:1 RR",                         passed: rr >= 2, evidence: `${rr.toFixed(2)}R to ${tp1.toFixed(5)}` },
  ];

  return {
    setupType: "silver_bullet",
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward: rr,
    confidenceScore: eps.score,
    qualityGrade: eps.qualityGrade,
    explanation: `Silver Bullet ${window.name} — ${direction} FVG ${fvg.low.toFixed(5)}-${fvg.high.toFixed(5)} formed after ${sweep!.sweepDirection} of ${sweep!.levelType}. EPS ${eps.score}/100 (${eps.tier}). Entry ${entry.toFixed(5)}, SL ${stopLoss.toFixed(5)}, TP1 ${tp1.toFixed(5)} (${rr.toFixed(2)}R).`,
    invalidation: `Price fills FVG and continues through it without rejection — window closes, signal expires.`,
    validHours: 1, // window is 1h wide
    metadata: { strategy: "silver_bullet", tier: eps.tier, eps: eps.score, factors: eps.factors, window: window.name, gates },
  };
}

function findFVGs(candles: CandleRow[]): FVG[] {
  const out: FVG[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];
    if (c1.high < c3.low && isDisplacement(c2, "bull")) out.push({ direction: "bullish", high: c3.low, low: c1.high, formedAtIndex: i, formedAt: c3.openTime });
    if (c1.low > c3.high && isDisplacement(c2, "bear")) out.push({ direction: "bearish", high: c1.low, low: c3.high, formedAtIndex: i, formedAt: c3.openTime });
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
