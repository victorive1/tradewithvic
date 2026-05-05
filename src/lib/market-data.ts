import { ALL_INSTRUMENTS } from "./constants";

// Lazy getter — never read process.env at module-import scope. Next.js 16
// build-time module collection imports route modules without executing
// handlers; reading non-NEXT_PUBLIC env vars at module top risks build
// crashes if vars aren't visible to that phase. See the build-trap memory.
function getApiKey(): string { return process.env.TWELVEDATA_API_KEY ?? ""; }
const BASE_URL = "https://api.twelvedata.com";

export interface MarketQuote {
  symbol: string;
  displayName: string;
  category: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
}

export interface CurrencyStrength {
  currency: string;
  score: number;
  rank: number;
}

function toTwelveDataSymbol(symbol: string): string {
  const map: Record<string, string> = {
    EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", USDCHF: "USD/CHF",
    AUDUSD: "AUD/USD", NZDUSD: "NZD/USD", USDCAD: "USD/CAD", EURJPY: "EUR/JPY",
    GBPJPY: "GBP/JPY", EURGBP: "EUR/GBP", AUDJPY: "AUD/JPY",
    EURAUD: "EUR/AUD", EURNZD: "EUR/NZD", EURCAD: "EUR/CAD", EURCHF: "EUR/CHF",
    GBPAUD: "GBP/AUD", GBPNZD: "GBP/NZD", GBPCAD: "GBP/CAD", GBPCHF: "GBP/CHF",
    AUDNZD: "AUD/NZD", AUDCAD: "AUD/CAD", AUDCHF: "AUD/CHF",
    NZDCAD: "NZD/CAD", NZDCHF: "NZD/CHF", NZDJPY: "NZD/JPY",
    CADJPY: "CAD/JPY", CADCHF: "CAD/CHF",
    XAUUSD: "XAU/USD", XAGUSD: "XAG/USD",
    USOIL: "WTI/USD",
    BTCUSD: "BTC/USD", ETHUSD: "ETH/USD", SOLUSD: "SOL/USD", XRPUSD: "XRP/USD",
  };
  return map[symbol] || symbol;
}

// Fetch a small batch of quotes (max 8 per request for free tier)
async function fetchBatch(symbols: string[]): Promise<MarketQuote[]> {
  const apiKey = getApiKey();
  if (!apiKey || symbols.length === 0) return [];

  try {
    const twelveSymbols = symbols.map(toTwelveDataSymbol).join(",");
    const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(twelveSymbols)}&apikey=${apiKey}`;

    const res = await fetch(url, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`TwelveData API error: ${res.status}`);
      return [];
    }

    const data = await res.json();

    // TwelveData returns:
    // Single symbol: { symbol: "EUR/USD", close: "1.08", ... }
    // Multiple symbols: { "EUR/USD": { symbol: ..., close: ... }, "GBP/USD": { ... } }
    let quotes: any[];
    if (Array.isArray(data)) {
      quotes = data;
    } else if (data.symbol && data.close) {
      // Single symbol response
      quotes = [data];
    } else {
      // Multiple symbol response - object with symbol keys
      quotes = Object.values(data);
    }

    return quotes
      .filter((q: any) => q && !q.code && q.symbol && q.close)
      .map((q: any) => {
        const internalSymbol = symbols.find(
          (s) => toTwelveDataSymbol(s) === q.symbol
        ) || q.symbol.replace("/", "");
        const instrument = ALL_INSTRUMENTS.find((i) => i.symbol === internalSymbol);

        return {
          symbol: internalSymbol,
          displayName: instrument?.displayName || q.symbol,
          category: instrument?.category || "forex",
          price: parseFloat(q.close) || 0,
          change: parseFloat(q.change) || 0,
          changePercent: parseFloat(q.percent_change) || 0,
          high: parseFloat(q.high) || 0,
          low: parseFloat(q.low) || 0,
          open: parseFloat(q.open) || 0,
          previousClose: parseFloat(q.previous_close) || 0,
          timestamp: q.timestamp || Math.floor(Date.now() / 1000),
        };
      });
  } catch (error) {
    console.error("Failed to fetch batch:", error);
    return [];
  }
}

// Fetch all quotes in batches of 8 (TwelveData free tier limit)
export async function fetchAllQuotes(): Promise<MarketQuote[]> {
  if (!getApiKey()) {
    console.error("TWELVEDATA_API_KEY not set");
    return [];
  }

  // Priority symbols first (most important for the platform)
  const prioritySymbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "GBPJPY", "AUDUSD", "ETHUSD"];
  const secondarySymbols = ["USDCHF", "NZDUSD", "USDCAD", "EURJPY", "EURGBP", "XAGUSD", "AUDJPY", "USOIL"];
  // Cross pairs (no USD leg). Needed so currency strength sees full picture
  // for AUD/NZD/CAD/CHF and so the strength tab can surface every pair.
  const crossesA = ["EURAUD", "EURNZD", "EURCAD", "EURCHF", "GBPAUD", "GBPNZD", "GBPCAD", "GBPCHF"];
  const crossesB = ["AUDNZD", "AUDCAD", "AUDCHF", "NZDCAD", "NZDCHF", "NZDJPY", "CADJPY", "CADCHF"];

  const batch1 = await fetchBatch(prioritySymbols);
  await new Promise((r) => setTimeout(r, 1000));
  const batch2 = await fetchBatch(secondarySymbols);
  await new Promise((r) => setTimeout(r, 1000));
  const batch3 = await fetchBatch(crossesA);
  await new Promise((r) => setTimeout(r, 1000));
  const batch4 = await fetchBatch(crossesB);

  return [...batch1, ...batch2, ...batch3, ...batch4];
}

// Convenience: fetch just the top symbols
export async function fetchTopQuotes(): Promise<MarketQuote[]> {
  const topSymbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "GBPJPY", "ETHUSD", "XAGUSD"];
  return fetchBatch(topSymbols);
}

export function calculateCurrencyStrength(quotes: MarketQuote[]): CurrencyStrength[] {
  const currencies = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"];
  const scores: Record<string, number[]> = {};
  currencies.forEach((c) => (scores[c] = []));

  const pairMap: Record<string, [string, string]> = {
    EURUSD: ["EUR", "USD"], GBPUSD: ["GBP", "USD"], USDJPY: ["USD", "JPY"],
    USDCHF: ["USD", "CHF"], AUDUSD: ["AUD", "USD"], NZDUSD: ["NZD", "USD"],
    USDCAD: ["USD", "CAD"], EURJPY: ["EUR", "JPY"], GBPJPY: ["GBP", "JPY"],
    EURGBP: ["EUR", "GBP"], AUDJPY: ["AUD", "JPY"],
    EURAUD: ["EUR", "AUD"], EURNZD: ["EUR", "NZD"], EURCAD: ["EUR", "CAD"], EURCHF: ["EUR", "CHF"],
    GBPAUD: ["GBP", "AUD"], GBPNZD: ["GBP", "NZD"], GBPCAD: ["GBP", "CAD"], GBPCHF: ["GBP", "CHF"],
    AUDNZD: ["AUD", "NZD"], AUDCAD: ["AUD", "CAD"], AUDCHF: ["AUD", "CHF"],
    NZDCAD: ["NZD", "CAD"], NZDCHF: ["NZD", "CHF"], NZDJPY: ["NZD", "JPY"],
    CADJPY: ["CAD", "JPY"], CADCHF: ["CAD", "CHF"],
  };

  for (const quote of quotes) {
    const pair = pairMap[quote.symbol];
    if (!pair) continue;
    const [base, counter] = pair;
    if (scores[base]) scores[base].push(quote.changePercent);
    if (scores[counter]) scores[counter].push(-quote.changePercent);
  }

  const strengths = currencies.map((currency) => {
    const values = scores[currency];
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const normalized = Math.max(0, Math.min(100, 50 + avg * 20));
    return { currency, score: Math.round(normalized * 10) / 10, rank: 0 };
  });

  strengths.sort((a, b) => b.score - a.score);
  strengths.forEach((s, i) => (s.rank = i + 1));
  return strengths;
}
