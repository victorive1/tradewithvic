// Binance aggregated trades → real CVD.
//
// Why this beats synthetic CVD: the synthetic version uses
// sign(close-open) × volume per candle, which approximates flow
// direction but misses intra-bar aggressor activity. Real CVD reads
// the `m` flag from each aggregated trade:
//
//   m == false  →  buyer was the taker (AGGRESSIVE BUY)   → +qty
//   m == true   →  buyer was the maker (AGGRESSIVE SELL)  → −qty
//
// Sum across the window = real institutional / retail aggressor
// imbalance. Free, no auth required, ~6 requests per cycle for the
// two crypto MVP symbols.
//
// Endpoint:
//   GET https://api.binance.com/api/v3/aggTrades?symbol=...&startTime=...&endTime=...&limit=1000
// Pagination after the first page uses ?fromId=<lastId+1> since
// Binance caps startTime/endTime windows at 1 hour.

const BINANCE_SYMBOL_MAP: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
};

export interface RealCvdResult {
  cvd: number;
  totalVolume: number;
  tradeCount: number;
  windowMs: number;
  source: "real_aggressor";
  fetchedAt: number;
}

const CACHE = new Map<string, RealCvdResult>();
const CACHE_TTL_MS = 4 * 60 * 1000;  // 4 min — keeps in step with the 2-min cron without hammering Binance
const MAX_PAGES = 6;                  // ≤6000 trades per call — plenty for 30 min on BTC

export async function fetchBinanceRealCvd(symbol: string, windowMin = 30): Promise<RealCvdResult | null> {
  const binSymbol = BINANCE_SYMBOL_MAP[symbol];
  if (!binSymbol) return null;

  const cacheKey = `${symbol}:${windowMin}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  const endTime = Date.now();
  const startTime = endTime - windowMin * 60 * 1000;
  // Binance constraint: startTime/endTime range must be < 1h.
  const firstWindowEnd = Math.min(startTime + 55 * 60 * 1000, endTime);

  let cvd = 0;
  let totalVolume = 0;
  let tradeCount = 0;
  let lastId = 0;
  let exhausted = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = page === 0
      ? `https://api.binance.com/api/v3/aggTrades?symbol=${binSymbol}&startTime=${startTime}&endTime=${firstWindowEnd}&limit=1000`
      : `https://api.binance.com/api/v3/aggTrades?symbol=${binSymbol}&fromId=${lastId + 1}&limit=1000`;

    let trades: Array<{ a: number; p: string; q: string; T: number; m: boolean }> = [];
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!res.ok) break;
      trades = await res.json();
    } catch {
      // Network/timeout — return what we have so far if any, else null.
      break;
    }
    if (!Array.isArray(trades) || trades.length === 0) break;

    for (const t of trades) {
      if (t.T > endTime) { exhausted = true; break; }
      if (t.T < startTime) continue;
      const qty = parseFloat(t.q);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      cvd += t.m === true ? -qty : qty;
      totalVolume += qty;
      tradeCount++;
      lastId = t.a;
    }

    if (exhausted) break;
    if (trades.length < 1000) break;  // page wasn't full → window exhausted naturally
    if (trades[trades.length - 1].T >= endTime) break;
  }

  if (tradeCount === 0) return null;

  const result: RealCvdResult = {
    cvd,
    totalVolume,
    tradeCount,
    windowMs: endTime - startTime,
    source: "real_aggressor",
    fetchedAt: Date.now(),
  };
  CACHE.set(cacheKey, result);
  return result;
}

export function isCryptoSymbolForRealCvd(symbol: string): boolean {
  return symbol in BINANCE_SYMBOL_MAP;
}
