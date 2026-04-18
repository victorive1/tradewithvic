import { prisma } from "@/lib/prisma";

const API_KEY = process.env.TWELVEDATA_API_KEY || "";
const BASE_URL = "https://api.twelvedata.com";

export const CANDLE_TIMEFRAMES = ["4h", "1h", "15min", "5min"] as const;
export type CandleTimeframe = (typeof CANDLE_TIMEFRAMES)[number];

export const CANDLE_SYMBOLS = ["EURUSD", "XAUUSD", "BTCUSD"] as const;

const SYMBOL_MAP: Record<string, string> = {
  EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", USDCHF: "USD/CHF",
  AUDUSD: "AUD/USD", NZDUSD: "NZD/USD", USDCAD: "USD/CAD", EURJPY: "EUR/JPY",
  GBPJPY: "GBP/JPY", EURGBP: "EUR/GBP", AUDJPY: "AUD/JPY",
  XAUUSD: "XAU/USD", XAGUSD: "XAG/USD",
  BTCUSD: "BTC/USD", ETHUSD: "ETH/USD", SOLUSD: "SOL/USD", XRPUSD: "XRP/USD",
};

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

    let written = 0;
    for (const row of rows) {
      const res = await prisma.candle.upsert({
        where: {
          symbol_timeframe_openTime: {
            symbol: row.symbol,
            timeframe: row.timeframe,
            openTime: row.openTime,
          },
        },
        update: {
          close: row.close,
          high: row.high,
          low: row.low,
          open: row.open,
          volume: row.volume,
          fetchedAt: new Date(),
        },
        create: row,
      });
      if (res) written++;
    }

    return { symbol, timeframe, written, fetched: raw.length };
  } catch (err: any) {
    return { symbol, timeframe, written: 0, fetched: 0, error: err?.message || String(err) };
  }
}

export async function fetchCandleSet(
  symbolToInstrumentId: Map<string, string>,
  opts: { delayMs?: number; outputsize?: number } = {}
): Promise<{ results: CandleFetchResult[]; totalWritten: number; requestCount: number }> {
  const delayMs = opts.delayMs ?? 600;
  const outputsize = opts.outputsize ?? 50;
  const results: CandleFetchResult[] = [];
  let requestCount = 0;

  for (const symbol of CANDLE_SYMBOLS) {
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
