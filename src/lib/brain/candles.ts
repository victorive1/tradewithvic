import { prisma } from "@/lib/prisma";
import { ALL_INSTRUMENTS } from "@/lib/constants";

const API_KEY = process.env.TWELVEDATA_API_KEY || "";
const BASE_URL = "https://api.twelvedata.com";

export const CANDLE_TIMEFRAMES = ["4h", "1h", "15min", "5min", "1day"] as const;
export type CandleTimeframe = (typeof CANDLE_TIMEFRAMES)[number];

// Candle pipeline universe: forex + metals + BTC + ETH. Indices (NAS100,
// US30, SPX500, GER40) and energy (USOIL) are excluded — their candle
// endpoints return empty / malformed data on our TwelveData tier. Alt-
// crypto (SOL, XRP) trimmed to keep the priority list focused on the
// majors the oversight canary actually cares about. Quotes, Market Radar,
// Setups, and Market Direction still render the full 22 instruments.
export const CANDLE_SYMBOLS = ALL_INSTRUMENTS
  .filter((i) =>
    i.category === "forex"
    || i.category === "metals"
    || i.symbol === "BTCUSD"
    || i.symbol === "ETHUSD",
  )
  .map((i) => i.symbol) as readonly string[];

// BTC + ETH refreshed every main cycle + every minute via the dedicated
// /api/brain/crypto-refresh cron. 24/7 markets → the oversight engine
// treats BTC freshness as its canary; we never want this going stale.
export const CRYPTO_PRIORITY_SYMBOLS = ["BTCUSD", "ETHUSD"] as const;

// Total symbols analyzed per main scan cycle = priority crypto (2) +
// rotated forex/metals (4) = 6 per cycle, full non-crypto rotation in
// ~4 cycles (~8 min).
const PER_CYCLE_SYMBOL_BUDGET = 6;

const SYMBOL_MAP: Record<string, string> = {
  EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", USDCHF: "USD/CHF",
  AUDUSD: "AUD/USD", NZDUSD: "NZD/USD", USDCAD: "USD/CAD", EURJPY: "EUR/JPY",
  GBPJPY: "GBP/JPY", EURGBP: "EUR/GBP", AUDJPY: "AUD/JPY",
  XAUUSD: "XAU/USD", XAGUSD: "XAG/USD",
  USOIL: "WTI/USD",
  NAS100: "NDX", US30: "DJI", SPX500: "SPX", GER40: "DAX",
  BTCUSD: "BTC/USD", ETHUSD: "ETH/USD", SOLUSD: "SOL/USD", XRPUSD: "XRP/USD",
};

/**
 * Rough market-hours check. Crypto is 24/7; FX + metals close Fri 22:00 UTC
 * to Sun 22:00 UTC; indices/energy are loosely weekday-only for this
 * scheduler's purposes.
 */
function isMarketOpen(symbol: string, at: Date = new Date()): boolean {
  const s = symbol.toUpperCase();
  if (/^(BTC|ETH|SOL|XRP|ADA|DOGE|BNB|LTC)/.test(s)) return true;
  const day = at.getUTCDay();
  const hour = at.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && hour >= 22) return false;
  if (day === 0 && hour < 22) return false;
  return true;
}

/**
 * Pick the symbols to work on this cycle.
 *
 *   1. Always include every crypto symbol — they trade 24/7 and the
 *      oversight engine's BTC canary check expects <5 minute freshness.
 *      Skipping them in the rotation would guarantee stale alerts.
 *   2. Fill the rest of the budget with the stalest open-market
 *      forex / metals symbols, so the non-crypto universe rotates
 *      evenly (full rotation every ~3 cycles with budget 6).
 *   3. If markets are fully closed (weekend) we fall back to crypto
 *      only, which is already covered by step 1.
 */
export async function pickCycleSymbols(budget = PER_CYCLE_SYMBOL_BUDGET): Promise<string[]> {
  const grouped = await prisma.candle.groupBy({
    by: ["symbol"],
    _max: { fetchedAt: true },
  });
  const lastFetchBySymbol = new Map<string, number>();
  for (const r of grouped) {
    lastFetchBySymbol.set(r.symbol, r._max.fetchedAt?.getTime() ?? 0);
  }

  const priority: string[] = [...CRYPTO_PRIORITY_SYMBOLS];
  const remaining: Array<{ symbol: string; age: number; open: boolean }> = [];
  for (const sym of CANDLE_SYMBOLS) {
    if (priority.includes(sym)) continue;
    remaining.push({
      symbol: sym,
      age: lastFetchBySymbol.get(sym) ?? 0,
      open: isMarketOpen(sym),
    });
  }
  const openRest = remaining.filter((r) => r.open).sort((a, b) => a.age - b.age);
  const rotated = openRest.slice(0, Math.max(0, budget - priority.length));
  return [...priority, ...rotated.map((r) => r.symbol)];
}

interface TwelveDataCandle {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

export interface CandleFetchResult {
  symbol: string;
  timeframe: CandleTimeframe;
  written: number;
  fetched: number;
  error?: string;
}

async function fetchCandlesFromTwelveData(
  symbol: string,
  timeframe: CandleTimeframe,
  outputsize = 50
): Promise<TwelveDataCandle[]> {
  const tdSymbol = SYMBOL_MAP[symbol] || symbol;
  const url = `${BASE_URL}/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${timeframe}&outputsize=${outputsize}&apikey=${API_KEY}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`TwelveData ${res.status} for ${symbol} ${timeframe}`);

  const data = await res.json();
  if (data.code || data.status === "error") {
    throw new Error(data.message || `TwelveData error for ${symbol} ${timeframe}`);
  }

  return Array.isArray(data.values) ? data.values : [];
}

function timeframeToMillis(tf: CandleTimeframe): number {
  switch (tf) {
    case "5min": return 5 * 60 * 1000;
    case "15min": return 15 * 60 * 1000;
    case "1h": return 60 * 60 * 1000;
    case "4h": return 4 * 60 * 60 * 1000;
    case "1day": return 24 * 60 * 60 * 1000;
  }
}

export async function fetchAndPersistCandles(
  symbol: string,
  timeframe: CandleTimeframe,
  instrumentId: string | null,
  outputsize = 50
): Promise<CandleFetchResult> {
  if (!API_KEY) return { symbol, timeframe, written: 0, fetched: 0, error: "TWELVEDATA_API_KEY not set" };

  try {
    const raw = await fetchCandlesFromTwelveData(symbol, timeframe, outputsize);
    const tfMs = timeframeToMillis(timeframe);
    const nowMs = Date.now();

    const rows = raw
      .map((c) => {
        const openTime = new Date(c.datetime.replace(" ", "T") + "Z");
        const openMs = openTime.getTime();
        const closeMs = openMs + tfMs;
        return {
          instrumentId,
          symbol,
          timeframe,
          openTime,
          closeTime: new Date(closeMs),
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: c.volume ? parseFloat(c.volume) : 0,
          isClosed: closeMs <= nowMs,
        };
      })
      .filter((r) => Number.isFinite(r.open) && r.isClosed);

    if (rows.length === 0) {
      // Provider returned nothing useful (market closed, thin data, etc.).
      // Still record the check so the Agent freshness probe sees we tried.
      await bumpFetchedAt(symbol, timeframe);
      return { symbol, timeframe, written: 0, fetched: raw.length };
    }
    const result = await prisma.candle.createMany({
      data: rows,
      skipDuplicates: true,
    });
    // Record the successful check. Even when all returned candles are
    // duplicates (no new rows written), the probe should see we refreshed
    // — otherwise it flags the pair as stale forever.
    await bumpFetchedAt(symbol, timeframe);
    return { symbol, timeframe, written: result.count, fetched: raw.length };
  } catch (err: any) {
    // Critical: bump fetchedAt even on failure so the rotation keeps
    // moving. Previously a chronically-failing symbol would stay at
    // fetchedAt=ancient and monopolise pickCycleSymbols forever,
    // starving healthy symbols of refresh time. Losing the "last
    // failed at" nuance is fine — the error is already logged via the
    // return value and accumulates in ScanCycle.errorLogJson.
    await bumpFetchedAt(symbol, timeframe);
    return { symbol, timeframe, written: 0, fetched: 0, error: err?.message || String(err) };
  }
}

/**
 * Mark a (symbol, timeframe) pair as "checked just now" by touching the
 * fetchedAt on its newest candle. One read + one update per pair — the
 * probe's freshness check groups by (symbol, timeframe) and looks at
 * max(fetchedAt), so updating a single row is enough.
 */
async function bumpFetchedAt(symbol: string, timeframe: CandleTimeframe): Promise<void> {
  try {
    const newest = await prisma.candle.findFirst({
      where: { symbol, timeframe },
      orderBy: { openTime: "desc" },
      select: { id: true },
    });
    if (newest) {
      await prisma.candle.update({ where: { id: newest.id }, data: { fetchedAt: new Date() } });
    }
  } catch {
    // Non-fatal — freshness tracking is nice-to-have; never let it block a scan.
  }
}

export async function fetchCandleSet(
  symbolToInstrumentId: Map<string, string>,
  opts: { outputsize?: number; symbols?: readonly string[] } = {}
): Promise<{ results: CandleFetchResult[]; totalWritten: number; requestCount: number }> {
  const outputsize = opts.outputsize ?? 50;
  const symbols = opts.symbols ?? CANDLE_SYMBOLS;

  // Parallelize every (symbol, timeframe) fetch. TwelveData's 4,181
  // credits/min allowance + their per-IP concurrency limit easily cover
  // a handful of simultaneous requests, and Prisma's connection pool
  // queues writes safely behind the scenes.
  const tasks: Array<Promise<CandleFetchResult>> = [];
  for (const symbol of symbols) {
    for (const tf of CANDLE_TIMEFRAMES) {
      tasks.push(fetchAndPersistCandles(symbol, tf, symbolToInstrumentId.get(symbol) ?? null, outputsize));
    }
  }
  const results = await Promise.all(tasks);
  const totalWritten = results.reduce((a, b) => a + b.written, 0);
  return { results, totalWritten, requestCount: tasks.length };
}
