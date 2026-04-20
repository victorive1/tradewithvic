import { prisma } from "@/lib/prisma";

/**
 * Real-volume sourcing for the VWAP engine.
 *
 * TwelveData returns 0 volume for spot FX because there's no centralised
 * FX exchange. To give VWAP real institutional flow to weight bars by,
 * we fetch a liquid ETF / futures proxy that tracks each FX pair and
 * store its bar volume keyed by the FX symbol + timeframe. The VWAP
 * engine then LEFT JOINs Candle → VolumeReference at runtime.
 *
 * Symbol mapping rationale:
 *   - Euro → FXE (CurrencyShares Euro Trust): deepest FX ETF, NYSE-listed
 *   - GBP / JPY / AUD / CAD / CHF / NZD → their respective CurrencyShares
 *     trusts (FXB, FXY, FXA, FXC, FXF, FXS(+NZD proxy via FXA for now))
 *   - Cross pairs (EURJPY, GBPJPY, AUDJPY, EURGBP) intentionally omitted —
 *     no single clean proxy; VWAP falls back to synthetic weighting for
 *     these until we bring futures data online
 *   - XAUUSD → GLD, XAGUSD → SLV (the commodity ETFs most traders watch)
 *   - Crypto + indices bypass this path — Candle.volume is already real
 *
 * ETF volume only exists during NYSE hours (~13:30–20:00 UTC). Bars
 * outside that window simply won't have a VolumeReference row and the
 * VWAP engine degrades to Candle.volume → synthetic as normal.
 */

const API_KEY = process.env.TWELVEDATA_API_KEY || "";
const BASE_URL = "https://api.twelvedata.com";

interface TwelveDataCandle {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

// Spot FX + metals → NYSE-listed ETF with real institutional volume.
export const VOLUME_PROXY_MAP: Record<string, { proxy: string; source: "etf" | "futures" }> = {
  EURUSD: { proxy: "FXE", source: "etf" },
  GBPUSD: { proxy: "FXB", source: "etf" },
  USDJPY: { proxy: "FXY", source: "etf" }, // FXY tracks JPY/USD inverse — proxy is directional-agnostic for volume
  AUDUSD: { proxy: "FXA", source: "etf" },
  USDCAD: { proxy: "FXC", source: "etf" },
  USDCHF: { proxy: "FXF", source: "etf" },
  XAUUSD: { proxy: "GLD", source: "etf" },
  XAGUSD: { proxy: "SLV", source: "etf" },
  // NZDUSD, USOIL, cross-pairs: no clean proxy today — fall back to synthetic.
};

// Timeframes the VWAP engine actually consumes. Anchoring costs API
// credits so only fetch proxies for the base TFs VWAP touches.
export const VWAP_VOLUME_TIMEFRAMES = ["15min", "1h"] as const;
export type VwapVolumeTimeframe = (typeof VWAP_VOLUME_TIMEFRAMES)[number];

function timeframeToMillis(tf: string): number {
  switch (tf) {
    case "5min": return 5 * 60 * 1000;
    case "15min": return 15 * 60 * 1000;
    case "1h": return 60 * 60 * 1000;
    case "4h": return 4 * 60 * 60 * 1000;
    case "1day": return 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}

async function fetchProxyCandles(proxySymbol: string, timeframe: string, outputsize: number): Promise<TwelveDataCandle[]> {
  const url = `${BASE_URL}/time_series?symbol=${encodeURIComponent(proxySymbol)}&interval=${timeframe}&outputsize=${outputsize}&apikey=${API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`TwelveData ${res.status} for proxy ${proxySymbol} ${timeframe}`);
  const data = await res.json();
  if (data.code || data.status === "error") {
    throw new Error(data.message || `TwelveData error for proxy ${proxySymbol} ${timeframe}`);
  }
  return Array.isArray(data.values) ? data.values : [];
}

export interface VolumeReferenceResult {
  symbol: string;
  timeframe: string;
  proxy: string;
  written: number;
  error?: string;
}

async function persistProxyVolume(
  symbol: string,
  timeframe: string,
  outputsize = 50,
): Promise<VolumeReferenceResult> {
  const entry = VOLUME_PROXY_MAP[symbol];
  if (!entry) return { symbol, timeframe, proxy: "", written: 0 };
  if (!API_KEY) return { symbol, timeframe, proxy: entry.proxy, written: 0, error: "TWELVEDATA_API_KEY not set" };

  try {
    const raw = await fetchProxyCandles(entry.proxy, timeframe, outputsize);
    const tfMs = timeframeToMillis(timeframe);
    const nowMs = Date.now();

    const rows = raw
      .map((c) => {
        const openTime = new Date(c.datetime.replace(" ", "T") + "Z");
        const openMs = openTime.getTime();
        const closeMs = openMs + tfMs;
        const volume = c.volume ? parseFloat(c.volume) : 0;
        return {
          symbol,
          proxySymbol: entry.proxy,
          timeframe,
          openTime,
          closeTime: new Date(closeMs),
          volume,
          source: entry.source,
          isClosed: closeMs <= nowMs,
        };
      })
      .filter((r) => Number.isFinite(r.volume) && r.volume > 0 && r.isClosed);

    if (rows.length === 0) {
      return { symbol, timeframe, proxy: entry.proxy, written: 0 };
    }

    // Upsert one by one — the unique (symbol, timeframe, openTime) makes
    // createMany skipDuplicates safe, which is much cheaper than per-row
    // upsert for the ETF dump we just pulled.
    const result = await prisma.volumeReference.createMany({
      data: rows.map((r) => ({
        symbol: r.symbol,
        proxySymbol: r.proxySymbol,
        timeframe: r.timeframe,
        openTime: r.openTime,
        closeTime: r.closeTime,
        volume: r.volume,
        source: r.source,
      })),
      skipDuplicates: true,
    });

    return { symbol, timeframe, proxy: entry.proxy, written: result.count };
  } catch (err: any) {
    return { symbol, timeframe, proxy: entry.proxy, written: 0, error: err?.message ?? String(err) };
  }
}

/**
 * Fetch proxy volume for the given symbol set × VWAP base timeframes.
 * Parallelised via Promise.all like the rest of the brain's fetch loops.
 * Crypto + indices + cross-pairs without a proxy mapping are silently
 * skipped — VWAP handles them via Candle.volume or synthetic weighting.
 */
export async function persistVolumeReferences(
  symbols: readonly string[],
): Promise<{
  results: VolumeReferenceResult[];
  totalWritten: number;
  requestCount: number;
}> {
  const tasks: Array<Promise<VolumeReferenceResult>> = [];
  for (const s of symbols) {
    if (!VOLUME_PROXY_MAP[s]) continue;
    for (const tf of VWAP_VOLUME_TIMEFRAMES) {
      tasks.push(persistProxyVolume(s, tf));
    }
  }
  const results = await Promise.all(tasks);
  const totalWritten = results.reduce((a, b) => a + b.written, 0);
  return { results, totalWritten, requestCount: tasks.length };
}
