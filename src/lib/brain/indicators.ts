import { prisma } from "@/lib/prisma";

interface CandleRow {
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Exponential moving average. Seed with SMA(period), then recursive EMA.
 * Returns array aligned with input (first period-1 entries are null).
 */
function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  out[period - 1] = seed;

  for (let i = period; i < values.length; i++) {
    const prev = out[i - 1] as number;
    out[i] = values[i] * k + prev * (1 - k);
  }
  return out;
}

/**
 * RSI with Wilder's smoothing, standard 14-period default.
 */
function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;

  out[period] = computeRsi(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = computeRsi(avgGain, avgLoss);
  }
  return out;
}

function computeRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * ATR (Average True Range) with Wilder's smoothing, standard 14-period default.
 */
function atr(candles: CandleRow[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    trs.push(tr);
  }

  let seed = 0;
  for (let i = 0; i < period; i++) seed += trs[i];
  seed /= period;
  out[period] = seed;

  for (let i = period + 1; i < candles.length; i++) {
    const trIdx = i - 1;
    const prev = out[i - 1] as number;
    out[i] = (prev * (period - 1) + trs[trIdx]) / period;
  }
  return out;
}

/**
 * MACD: fast EMA - slow EMA, signal = EMA of MACD line.
 */
function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });
  const macdNumeric: number[] = [];
  const firstIdx = macdLine.findIndex((v) => v !== null);
  if (firstIdx >= 0) {
    for (let i = firstIdx; i < macdLine.length; i++) {
      macdNumeric.push(macdLine[i] as number);
    }
  }
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  if (macdNumeric.length >= signal) {
    const signalEma = ema(macdNumeric, signal);
    for (let i = 0; i < signalEma.length; i++) {
      signalLine[firstIdx + i] = signalEma[i];
    }
  }
  const hist: (number | null)[] = closes.map((_, i) => {
    const m = macdLine[i];
    const s = signalLine[i];
    return m !== null && s !== null ? m - s : null;
  });
  return { macdLine, signalLine, hist };
}

/**
 * Bollinger Bands. SMA(period) ± mult * stdev(period).
 */
function bollinger(closes: number[], period = 20, mult = 2) {
  const mid: (number | null)[] = new Array(closes.length).fill(null);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mean) ** 2;
    const stdev = Math.sqrt(variance / period);
    mid[i] = mean;
    upper[i] = mean + mult * stdev;
    lower[i] = mean - mult * stdev;
  }
  return { mid, upper, lower };
}

export interface IndicatorResult {
  symbol: string;
  timeframe: string;
  candleCount: number;
  computed: boolean;
  trendBias?: string;
  error?: string;
}

export async function analyzeIndicators(
  symbol: string,
  timeframe: string
): Promise<IndicatorResult> {
  const candles = (await prisma.candle.findMany({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "asc" },
    take: 250,
    select: { openTime: true, open: true, high: true, low: true, close: true, volume: true },
  })) as CandleRow[];

  if (candles.length < 30) {
    return { symbol, timeframe, candleCount: candles.length, computed: false, error: "not_enough_candles" };
  }

  const closes = candles.map((c) => c.close);
  const last = candles.length - 1;
  const latest = candles[last];

  const ema20 = ema(closes, 20)[last];
  const ema50 = ema(closes, 50)[last];
  const ema200 = closes.length >= 200 ? ema(closes, 200)[last] : null;

  const rsi14 = rsi(closes, 14)[last];
  const atr14 = atr(candles, 14)[last];
  const atrPercent = atr14 !== null && latest.close ? (atr14 / latest.close) * 100 : null;

  const { macdLine, signalLine, hist } = macd(closes);
  const bb = bollinger(closes, 20, 2);

  const bbUpper = bb.upper[last];
  const bbMiddle = bb.mid[last];
  const bbLower = bb.lower[last];
  const bbWidth = bbUpper !== null && bbLower !== null && bbMiddle ? (bbUpper - bbLower) / bbMiddle : null;
  const bbPercentB = bbUpper !== null && bbLower !== null ? (latest.close - bbLower) / (bbUpper - bbLower) : null;

  const rsiState: string = rsi14 === null ? "neutral"
    : rsi14 >= 70 ? "overbought"
      : rsi14 <= 30 ? "oversold"
        : "neutral";

  let trendBias: "bullish" | "bearish" | "neutral" = "neutral";
  if (ema20 !== null && ema50 !== null) {
    const aboveEma200 = ema200 === null ? true : latest.close > ema200;
    const belowEma200 = ema200 === null ? true : latest.close < ema200;
    if (latest.close > ema20 && ema20 > ema50 && aboveEma200) trendBias = "bullish";
    else if (latest.close < ema20 && ema20 < ema50 && belowEma200) trendBias = "bearish";
  }

  let momentum: "up" | "down" | "flat" = "flat";
  const mLast = macdLine[last];
  const mPrev = macdLine[last - 1];
  if (mLast !== null && mPrev !== null) {
    if (mLast > mPrev && mLast > 0) momentum = "up";
    else if (mLast < mPrev && mLast < 0) momentum = "down";
  }

  await prisma.indicatorSnapshot.upsert({
    where: { symbol_timeframe: { symbol, timeframe } },
    create: {
      symbol,
      timeframe,
      candleTime: latest.openTime,
      close: latest.close,
      candleCount: candles.length,
      ema20, ema50, ema200,
      rsi14, rsiState,
      atr14, atrPercent,
      macdLine: macdLine[last] ?? null,
      macdSignal: signalLine[last] ?? null,
      macdHist: hist[last] ?? null,
      bbUpper, bbMiddle, bbLower, bbWidth, bbPercentB,
      trendBias,
      momentum,
    },
    update: {
      candleTime: latest.openTime,
      close: latest.close,
      candleCount: candles.length,
      ema20, ema50, ema200,
      rsi14, rsiState,
      atr14, atrPercent,
      macdLine: macdLine[last] ?? null,
      macdSignal: signalLine[last] ?? null,
      macdHist: hist[last] ?? null,
      bbUpper, bbMiddle, bbLower, bbWidth, bbPercentB,
      trendBias,
      momentum,
      computedAt: new Date(),
    },
  });

  return { symbol, timeframe, candleCount: candles.length, computed: true, trendBias };
}

export async function analyzeAllIndicators(
  symbols: readonly string[],
  timeframes: readonly string[]
): Promise<{ results: IndicatorResult[]; computed: number }> {
  const pairs: Array<[string, string]> = [];
  for (const s of symbols) for (const tf of timeframes) pairs.push([s, tf]);
  const results = await Promise.all(pairs.map(([s, tf]) => analyzeIndicators(s, tf)));
  const computed = results.filter((r) => r.computed).length;
  return { results, computed };
}
