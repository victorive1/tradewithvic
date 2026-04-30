// Real CVD from Coinbase Exchange public trades — replaces the
// original Binance approach (Binance geo-blocks US-hosted infra
// including Vercel AWS regions). Coinbase Exchange is US-domiciled
// and the public API works from anywhere.
//
// File name kept for compatibility with existing imports; class
// signature unchanged.
//
// Coinbase Exchange semantics for the `side` field (per their docs):
//   side describes the MAKER's side from the taker's perspective.
//     side="buy"  → maker was a buyer → taker hit the bid
//                  → AGGRESSIVE SELL → −qty
//     side="sell" → maker was a seller → taker lifted the offer
//                  → AGGRESSIVE BUY  → +qty
// (This is the inverse of Binance's `m` flag conceptually but maps
// to the same CVD math.)
//
// Endpoint:
//   GET https://api.exchange.coinbase.com/products/{PRODUCT}/trades
//     ?limit=1000
//     [&before=<trade_id>]      // older than this trade id
// Pagination: use `before` cursor to walk backwards. The cb-before
// response header gives the next cursor; we just use the lowest
// trade_id we saw.
//
// Rate limit: 10 req/sec public — well above our needs.

const SYMBOL_MAP: Record<string, string> = {
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
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
const CACHE_TTL_MS = 4 * 60 * 1000;
const MAX_PAGES = 6;

interface CoinbaseTrade {
  trade_id: number;
  side: "buy" | "sell";
  size: string;
  price: string;
  time: string;  // ISO 8601
}

export async function fetchBinanceRealCvd(symbol: string, windowMin = 30): Promise<RealCvdResult | null> {
  const product = SYMBOL_MAP[symbol];
  if (!product) return null;

  const cacheKey = `${symbol}:${windowMin}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  const endTime = Date.now();
  const startTime = endTime - windowMin * 60 * 1000;

  let cvd = 0;
  let totalVolume = 0;
  let tradeCount = 0;
  let oldestId: number | null = null;
  let exhausted = false;

  for (let page = 0; page < MAX_PAGES && !exhausted; page++) {
    const url = oldestId === null
      ? `https://api.exchange.coinbase.com/products/${product}/trades?limit=1000`
      : `https://api.exchange.coinbase.com/products/${product}/trades?limit=1000&before=${oldestId}`;

    let trades: CoinbaseTrade[] = [];
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
        headers: { "user-agent": "tradewithvic-flow/1.0" },
      });
      if (!res.ok) break;
      trades = await res.json() as CoinbaseTrade[];
    } catch {
      break;
    }
    if (!Array.isArray(trades) || trades.length === 0) break;

    for (const t of trades) {
      const ts = Date.parse(t.time);
      if (!Number.isFinite(ts)) continue;
      if (ts < startTime) { exhausted = true; break; }
      if (ts > endTime) continue;
      const qty = parseFloat(t.size);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      // Coinbase semantics: side="buy" means maker was buyer → taker
      // was aggressive seller → −qty. side="sell" → aggressive buy → +qty.
      cvd += t.side === "sell" ? qty : -qty;
      totalVolume += qty;
      tradeCount++;
      if (oldestId === null || t.trade_id < oldestId) oldestId = t.trade_id;
    }

    if (trades.length < 1000) break;
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
  return symbol in SYMBOL_MAP;
}
