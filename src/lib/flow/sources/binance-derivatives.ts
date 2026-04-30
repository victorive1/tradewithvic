// Binance Futures Open Interest + Funding Rate.
//
// Binance publishes free, no-auth-required endpoints for perpetual
// futures stats. We pull:
//   • openInterest         /futures/data/openInterestHist
//   • fundingRate          /fapi/v1/fundingRate
//   • topLongShortRatio    /futures/data/topLongShortPositionRatio
//
// Used for BTCUSD and ETHUSD — gives us real institutional proxy data
// (OI delta = positioning shift, funding rate = leverage skew, top
// long/short ratio = whale crowding).
//
// 5-min cache so repeated FlowVision scans don't hammer Binance.

interface DerivativesSnapshot {
  symbol: string;
  openInterest: number;
  oiChange1h: number | null;     // current vs 1h ago, percent
  fundingRate: number | null;    // current 8h funding, percent
  topLongPct: number | null;     // top 20% accounts long share
  topShortPct: number | null;
  fetchedAt: number;
}

const CACHE = new Map<string, DerivativesSnapshot>();
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 min

const BINANCE_SYMBOL_MAP: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
};

const BASE_URL = "https://fapi.binance.com";
const DATA_URL = "https://www.binance.com";

export async function fetchBinanceDerivatives(symbol: string): Promise<DerivativesSnapshot | null> {
  const binSym = BINANCE_SYMBOL_MAP[symbol];
  if (!binSym) return null;

  const cached = CACHE.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  try {
    const [oiHist, fundingArr, topRatioHist] = await Promise.all([
      // OI history — last 12 5-min buckets
      fetch(`${DATA_URL}/futures/data/openInterestHist?symbol=${binSym}&period=5m&limit=12`,
        { signal: AbortSignal.timeout(8000), cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      // Latest funding
      fetch(`${BASE_URL}/fapi/v1/fundingRate?symbol=${binSym}&limit=1`,
        { signal: AbortSignal.timeout(8000), cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      // Top 20% long/short ratio
      fetch(`${DATA_URL}/futures/data/topLongShortPositionRatio?symbol=${binSym}&period=5m&limit=1`,
        { signal: AbortSignal.timeout(8000), cache: "no-store" }).then((r) => r.ok ? r.json() : null),
    ]);

    let openInterest = 0, oiChange1h: number | null = null;
    if (Array.isArray(oiHist) && oiHist.length > 0) {
      const latest = oiHist[oiHist.length - 1];
      const oiOldest = oiHist[0];
      openInterest = parseFloat(latest.sumOpenInterest);
      const oldestOi = parseFloat(oiOldest.sumOpenInterest);
      if (Number.isFinite(openInterest) && Number.isFinite(oldestOi) && oldestOi > 0) {
        oiChange1h = ((openInterest - oldestOi) / oldestOi) * 100;
      }
    }

    let fundingRate: number | null = null;
    if (Array.isArray(fundingArr) && fundingArr.length > 0) {
      fundingRate = parseFloat(fundingArr[0].fundingRate) * 100;
    }

    let topLongPct: number | null = null, topShortPct: number | null = null;
    if (Array.isArray(topRatioHist) && topRatioHist.length > 0) {
      const r = topRatioHist[topRatioHist.length - 1];
      topLongPct = parseFloat(r.longAccount) * 100;
      topShortPct = parseFloat(r.shortAccount) * 100;
    }

    if (!Number.isFinite(openInterest)) return null;

    const snapshot: DerivativesSnapshot = {
      symbol,
      openInterest,
      oiChange1h: Number.isFinite(oiChange1h) ? oiChange1h : null,
      fundingRate: Number.isFinite(fundingRate) ? fundingRate : null,
      topLongPct: Number.isFinite(topLongPct) ? topLongPct : null,
      topShortPct: Number.isFinite(topShortPct) ? topShortPct : null,
      fetchedAt: Date.now(),
    };
    CACHE.set(symbol, snapshot);
    return snapshot;
  } catch {
    return null;
  }
}
