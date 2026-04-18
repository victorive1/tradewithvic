import { prisma } from "@/lib/prisma";

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type LevelType =
  | "equal_high"
  | "equal_low"
  | "prev_day_high"
  | "prev_day_low"
  | "prev_week_high"
  | "prev_week_low";

export type SweepDirection = "bullish_sweep" | "bearish_sweep";

interface TrackedLevel {
  levelType: LevelType;
  price: number;
  strength: number;
  metadata: Record<string, any>;
}

const EQUAL_LEVEL_TOLERANCE = 0.0015; // 0.15% — tight enough to matter, loose enough to catch real clusters

function detectFractalPivots(candles: CandleRow[]): { highs: CandleRow[]; lows: CandleRow[] } {
  const highs: CandleRow[] = [];
  const lows: CandleRow[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (c.high >= candles[i - 1].high && c.high >= candles[i - 2].high && c.high >= candles[i + 1].high && c.high >= candles[i + 2].high) {
      highs.push(c);
    }
    if (c.low <= candles[i - 1].low && c.low <= candles[i - 2].low && c.low <= candles[i + 1].low && c.low <= candles[i + 2].low) {
      lows.push(c);
    }
  }
  return { highs, lows };
}

function clusterLevels(
  points: CandleRow[],
  kind: "high" | "low",
  tolerance = EQUAL_LEVEL_TOLERANCE
): Array<{ price: number; count: number; times: Date[] }> {
  const used = new Set<number>();
  const clusters: Array<{ price: number; count: number; times: Date[] }> = [];
  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    const ref = kind === "high" ? points[i].high : points[i].low;
    const cluster = [{ price: ref, time: points[i].openTime }];
    used.add(i);
    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      const price = kind === "high" ? points[j].high : points[j].low;
      if (Math.abs(price - ref) / ref <= tolerance) {
        cluster.push({ price, time: points[j].openTime });
        used.add(j);
      }
    }
    if (cluster.length >= 2) {
      const avg = cluster.reduce((a, b) => a + b.price, 0) / cluster.length;
      clusters.push({ price: avg, count: cluster.length, times: cluster.map((c) => c.time) });
    }
  }
  return clusters;
}

function prevDayBounds(candles: CandleRow[]): { high: number; low: number } | null {
  if (candles.length === 0) return null;
  const latest = candles[candles.length - 1].openTime;
  const latestUtc = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), latest.getUTCDate()));
  const prevDayStart = new Date(latestUtc.getTime() - 86400_000);
  const prevDayEnd = latestUtc;
  const bucket = candles.filter(
    (c) => c.openTime >= prevDayStart && c.openTime < prevDayEnd
  );
  if (bucket.length === 0) return null;
  return {
    high: Math.max(...bucket.map((c) => c.high)),
    low: Math.min(...bucket.map((c) => c.low)),
  };
}

function prevWeekBounds(candles: CandleRow[]): { high: number; low: number } | null {
  if (candles.length === 0) return null;
  const latest = candles[candles.length - 1].openTime;
  const latestUtcDay = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), latest.getUTCDate()));
  const dayOfWeek = latestUtcDay.getUTCDay(); // 0 = Sunday, 1 = Monday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const currentWeekStart = new Date(latestUtcDay.getTime() - daysSinceMonday * 86400_000);
  const prevWeekStart = new Date(currentWeekStart.getTime() - 7 * 86400_000);
  const prevWeekEnd = currentWeekStart;
  const bucket = candles.filter((c) => c.openTime >= prevWeekStart && c.openTime < prevWeekEnd);
  if (bucket.length === 0) return null;
  return {
    high: Math.max(...bucket.map((c) => c.high)),
    low: Math.min(...bucket.map((c) => c.low)),
  };
}

export interface LiquidityResult {
  symbol: string;
  timeframe: string;
  levelsTracked: number;
  sweepsDetected: number;
}

export async function analyzeLiquidity(
  symbol: string,
  timeframe: string,
  scanCycleId: string | null
): Promise<LiquidityResult> {
  const candles = (await prisma.candle.findMany({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "asc" },
    take: 300,
    select: { openTime: true, open: true, high: true, low: true, close: true },
  })) as CandleRow[];

  if (candles.length < 10) {
    return { symbol, timeframe, levelsTracked: 0, sweepsDetected: 0 };
  }

  const levels: TrackedLevel[] = [];
  const { highs, lows } = detectFractalPivots(candles);

  for (const c of clusterLevels(highs, "high")) {
    levels.push({
      levelType: "equal_high",
      price: c.price,
      strength: c.count,
      metadata: { touches: c.times.map((t) => t.toISOString()) },
    });
  }
  for (const c of clusterLevels(lows, "low")) {
    levels.push({
      levelType: "equal_low",
      price: c.price,
      strength: c.count,
      metadata: { touches: c.times.map((t) => t.toISOString()) },
    });
  }

  const pd = prevDayBounds(candles);
  if (pd) {
    levels.push({ levelType: "prev_day_high", price: pd.high, strength: 1, metadata: {} });
    levels.push({ levelType: "prev_day_low", price: pd.low, strength: 1, metadata: {} });
  }

  const pw = prevWeekBounds(candles);
  if (pw) {
    levels.push({ levelType: "prev_week_high", price: pw.high, strength: 1, metadata: {} });
    levels.push({ levelType: "prev_week_low", price: pw.low, strength: 1, metadata: {} });
  }

  const now = new Date();
  const levelRows = levels.map((l) => ({
    symbol, timeframe,
    levelType: l.levelType,
    price: l.price,
    strength: l.strength,
    metadataJson: JSON.stringify(l.metadata),
    lastSeenAt: now,
  }));
  if (levelRows.length > 0) {
    await prisma.liquidityLevel.createMany({ data: levelRows, skipDuplicates: true });
  }

  // Detect sweeps over last 20 closed candles. Batch all candidates, let unique constraint dedupe.
  const sweepWindow = candles.slice(-20);
  const sweepCandidates: Array<{
    levelType: string; levelPrice: number; candle: CandleRow;
    direction: SweepDirection; reversalStrength: number;
  }> = [];
  const sweptLevelKeys = new Set<string>();

  for (const lvl of levels) {
    const isUpper = lvl.levelType.endsWith("high");
    const isLower = lvl.levelType.endsWith("low");
    for (const c of sweepWindow) {
      if (isUpper && c.high > lvl.price && c.close < lvl.price) {
        sweepCandidates.push({
          levelType: lvl.levelType,
          levelPrice: lvl.price,
          candle: c,
          direction: "bearish_sweep",
          reversalStrength: (c.high - c.close) / Math.max(c.high - c.low, 1e-9),
        });
        sweptLevelKeys.add(`${lvl.levelType}:${lvl.price}`);
      } else if (isLower && c.low < lvl.price && c.close > lvl.price) {
        sweepCandidates.push({
          levelType: lvl.levelType,
          levelPrice: lvl.price,
          candle: c,
          direction: "bullish_sweep",
          reversalStrength: (c.close - c.low) / Math.max(c.high - c.low, 1e-9),
        });
        sweptLevelKeys.add(`${lvl.levelType}:${lvl.price}`);
      }
    }
  }

  let sweepsDetected = 0;
  if (sweepCandidates.length > 0) {
    const result = await prisma.liquidityEvent.createMany({
      data: sweepCandidates.map((s) => ({
        symbol, timeframe,
        levelType: s.levelType,
        levelPrice: s.levelPrice,
        sweepCandleTime: s.candle.openTime,
        sweepHigh: s.candle.high,
        sweepLow: s.candle.low,
        sweepClose: s.candle.close,
        sweepDirection: s.direction,
        reversalStrength: s.reversalStrength,
        scanCycleId: scanCycleId ?? undefined,
      })),
      skipDuplicates: true,
    });
    sweepsDetected = result.count;
  }

  if (sweptLevelKeys.size > 0) {
    const sweptByType = new Map<string, number[]>();
    for (const key of sweptLevelKeys) {
      const [type, priceStr] = key.split(":");
      const arr = sweptByType.get(type) ?? [];
      arr.push(parseFloat(priceStr));
      sweptByType.set(type, arr);
    }
    for (const [levelType, prices] of sweptByType) {
      await prisma.liquidityLevel.updateMany({
        where: { symbol, timeframe, levelType, price: { in: prices } },
        data: { status: "swept" },
      });
    }
  }

  return { symbol, timeframe, levelsTracked: levels.length, sweepsDetected };
}

export async function analyzeAllLiquidity(
  symbols: readonly string[],
  timeframes: readonly string[],
  scanCycleId: string | null
): Promise<{ results: LiquidityResult[]; totalLevels: number; totalSweeps: number }> {
  const results: LiquidityResult[] = [];
  let totalLevels = 0;
  let totalSweeps = 0;
  for (const s of symbols) {
    for (const tf of timeframes) {
      const r = await analyzeLiquidity(s, tf, scanCycleId);
      results.push(r);
      totalLevels += r.levelsTracked;
      totalSweeps += r.sweepsDetected;
    }
  }
  return { results, totalLevels, totalSweeps };
}
