// EPS — Edge Probability Score. Single source of truth for the formula
// every Strategy-Bible detector uses to compute its 0-100 score, tier,
// and qualityGrade. Per the Bible:
//
//   EPS = (LQ × 0.30) + (LOC × 0.25) + (MOM × 0.20) + (VOL × 0.15) + (TIME × 0.10)
//
//   Tier 1 / A+ : 90–100  full signal, full size
//   Tier 2 / A  : 80–89   reduced size
//   Suppressed  : <80     blocked, never surfaces
//
// Each factor scored 0–100 by the calling detector based on its specific
// confluences. See the Strategy Bible PDF (~/Downloads/ICT_SMC_Strategy_Bible.pdf
// page 03) for the master formula and per-strategy scoring tables.
//
// Detectors should NOT surface signals below the SUPPRESSED threshold —
// keep them out of the TradeSetup table to avoid noise.

import { prisma } from "@/lib/prisma";

export interface EpsFactors {
  lq: number;   // 0-100 — liquidity (known stop cluster at signal level)
  loc: number;  // 0-100 — location (HTF point of interest)
  mom: number;  // 0-100 — momentum (RSI/MACD/displacement)
  vol: number;  // 0-100 — volume (above recent MA)
  time: number; // 0/100 — binary: killzone active or not
}

export interface EpsResult {
  score: number;             // 0-100 weighted sum, rounded
  tier: "TIER 1" | "TIER 2" | "SUPPRESSED";
  qualityGrade: "A+" | "A" | "B";
  factors: EpsFactors;
}

export const EPS_WEIGHTS = { lq: 0.30, loc: 0.25, mom: 0.20, vol: 0.15, time: 0.10 } as const;
export const TIER_1_MIN = 90;
export const TIER_2_MIN = 80;

export function scoreEps(factors: EpsFactors): EpsResult {
  const score = Math.round(
    factors.lq * EPS_WEIGHTS.lq +
    factors.loc * EPS_WEIGHTS.loc +
    factors.mom * EPS_WEIGHTS.mom +
    factors.vol * EPS_WEIGHTS.vol +
    factors.time * EPS_WEIGHTS.time,
  );
  const tier: EpsResult["tier"] = score >= TIER_1_MIN ? "TIER 1" : score >= TIER_2_MIN ? "TIER 2" : "SUPPRESSED";
  const qualityGrade: EpsResult["qualityGrade"] = tier === "TIER 1" ? "A+" : tier === "TIER 2" ? "A" : "B";
  return { score, tier, qualityGrade, factors };
}

// Killzone helper — identical across every Bible strategy. London open
// 07–10 UTC, NY open 13–16 UTC. Returns the binary 0/100 TIME factor
// + the human-readable session name for evidence strings.
export function killzone(): { score: 0 | 100; name: string; hourUtc: number } {
  const now = new Date();
  const h = now.getUTCHours();
  if (h >= 7 && h < 10) return { score: 100, name: "London", hourUtc: h };
  if (h >= 13 && h < 16) return { score: 100, name: "NY", hourUtc: h };
  if (h >= 12 && h < 13) return { score: 100, name: "LDN/NY Overlap", hourUtc: h };
  if (h >= 19 && h < 20) return { score: 100, name: "NY Afternoon", hourUtc: h };
  return { score: 0, name: "off-session", hourUtc: h };
}

// Candle/structure loader shared by detectors. Mirrors the pattern used
// by the existing strategies (bullish_fvg_inversion, triple_lock) —
// pulls multi-tf candles + per-tf structure in parallel.

export interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export async function loadCandles(symbol: string, timeframe: string, take: number, withVolume = false): Promise<CandleRow[]> {
  const rows = await prisma.candle.findMany({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "desc" },
    take,
    select: withVolume
      ? { openTime: true, open: true, high: true, low: true, close: true, volume: true }
      : { openTime: true, open: true, high: true, low: true, close: true },
  });
  return (rows.reverse() as unknown) as CandleRow[];
}

export async function loadStructure(symbol: string, timeframe: string) {
  return prisma.structureState.findUnique({
    where: { symbol_timeframe: { symbol, timeframe } },
    select: { bias: true, lastSwingHigh: true, lastSwingLow: true, lastEventType: true, lastEventAt: true },
  });
}

// Volume MA helper — used for the VOL factor. Returns the average
// volume across the last `lookback` closed candles, excluding the
// most recent candle (so the test bar's volume is compared against
// its own history). Returns null if there isn't enough data or if
// volumes are missing (some instruments don't get reliable volume
// from the data provider).
export function volumeMA(candles: CandleRow[], lookback: number): number | null {
  if (candles.length < lookback + 1) return null;
  const slice = candles.slice(-lookback - 1, -1);
  let sum = 0; let n = 0;
  for (const c of slice) {
    if (c.volume == null || !Number.isFinite(c.volume)) continue;
    sum += c.volume; n++;
  }
  if (n === 0) return null;
  return sum / n;
}

// Pip arithmetic — JPY pairs use 0.01, indices/metals use 0.1, others 0.0001.
// Crude but matches the rest of the brain's pip handling.
export function pipUnit(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.endsWith("JPY")) return 0.01;
  if (s === "XAUUSD" || s === "XAGUSD") return 0.1;
  if (/NAS|US30|SPX|GER|UK|JPN/.test(s)) return 1;
  return 0.0001;
}
export function pricePips(priceDelta: number, symbol: string): number {
  return priceDelta / pipUnit(symbol);
}
export function pipsToPrice(pips: number, symbol: string): number {
  return pips * pipUnit(symbol);
}

// One gate's evaluated result — used in the metadata payload so the
// Strategy Bible UI can render a per-strategy checklist of what passed
// and what evidence supported each.
export interface GateOutcome {
  id: string;
  label: string;
  passed: boolean;
  evidence: string;
  weight?: number;
}
