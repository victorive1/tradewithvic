import { prisma } from "@/lib/prisma";
import { ALL_INSTRUMENTS } from "@/lib/constants";

const API_KEY = process.env.TWELVEDATA_API_KEY || "";
const BASE_URL = "https://api.twelvedata.com";

export const CANDLE_TIMEFRAMES = ["4h", "1h", "15min", "5min", "1day"] as const;
export type CandleTimeframe = (typeof CANDLE_TIMEFRAMES)[number];

// Full tracked universe: every instrument the app surfaces. Any single 2-min
// cycle only works on the `pickCycleSymbols` subset below so we stay well
// under TwelveData's 8 req/min free-tier cap and Vercel's 60s fn limit.
// Full rotation through the universe takes ~12 minutes.
export const CANDLE_SYMBOLS = ALL_INSTRUMENTS.map((i) => i.symbol) as readonly string[];

// How many symbols get freshly fetched + analyzed per scan cycle.
const PER_CYCLE_SYMBOL_BUDGET = 4;

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
 * Pick the N stalest open-market symbols to work on this cycle. Symbols
 * with no candles yet (new to the universe) are stalest by definition.
 * If everything is closed (quiet weekend) we fall back to crypto so the
 * Brain still has something to do.
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

  const open: Array<{ symbol: string; age: number }> = [];
  const closed: Array<{ symbol: string; age: number }> = [];
  for (const sym of CANDLE_SYMBOLS) {
    const age = lastFetchBySymbol.get(sym) ?? 0;
    if (isMarketOpen(sym)) open.push({ symbol: sym, age });
    else closed.push({ symbol: sym, age });
  }
  const pool = open.length > 0 ? open : closed;
  pool.sort((a, b) => a.age - b.age);
  return pool.slice(0, budget).map((p) => p.symbol);
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
      return { symbol, timeframe, written: 0, fetched: raw.length };
    }
    const result = await prisma.candle.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return { symbol, timeframe, written: result.count, fetched: raw.length };
  } catch (err: any) {
    return { symbol, timeframe, written: 0, fetched: 0, error: err?.message || String(err) };
  }
}

export async function fetchCandleSet(
  symbolToInstrumentId: Map<string, string>,
  opts: { delayMs?: number; outputsize?: number; symbols?: readonly string[] } = {}
): Promise<{ results: CandleFetchResult[]; totalWritten: number; requestCount: number }> {
  const delayMs = opts.delayMs ?? 600;
  const outputsize = opts.outputsize ?? 50;
  const symbols = opts.symbols ?? CANDLE_SYMBOLS;
  const results: CandleFetchResult[] = [];
  let requestCount = 0;

  for (const symbol of symbols) {
    for (const tf of CANDLE_TIMEFRAMES) {
      const instrumentId = symbolToInstrumentId.get(symbol) ?? null;
      const result = await fetchAndPersistCandles(symbol, tf, instrumentId, outputsize);
      results.push(result);
      requestCount++;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const totalWritten = results.reduce((a, b) => a + b.written, 0);
  return { results, totalWritten, requestCount };
}
