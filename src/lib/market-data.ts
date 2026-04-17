import { ALL_INSTRUMENTS } from "./constants";

const API_KEY = process.env.TWELVEDATA_API_KEY || "";
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

// Map our symbols to TwelveData format
function toTwelveDataSymbol(symbol: string): string {
  const map: Record<string, string> = {
    EURUSD: "EUR/USD",
    GBPUSD: "GBP/USD",
    USDJPY: "USD/JPY",
    USDCHF: "USD/CHF",
    AUDUSD: "AUD/USD",
    NZDUSD: "NZD/USD",
    USDCAD: "USD/CAD",
    EURJPY: "EUR/JPY",
    GBPJPY: "GBP/JPY",
    EURGBP: "EUR/GBP",
    AUDJPY: "AUD/JPY",
    XAUUSD: "XAU/USD",
    XAGUSD: "XAG/USD",
    BTCUSD: "BTC/USD",
    ETHUSD: "ETH/USD",
    SOLUSD: "SOL/USD",
    XRPUSD: "XRP/USD",
  };
  return map[symbol] || symbol;
}

export async function fetchQuotes(symbols: string[]): Promise<MarketQuote[]> {
  try {
    const twelveSymbols = symbols.map(toTwelveDataSymbol).join(",");
    const res = await fetch(
      `${BASE_URL}/quote?symbol=${encodeURIComponent(twelveSymbols)}&apikey=${API_KEY}`,
      { next: { revalidate: 60 } }
    );

    if (!res.ok) throw new Error(`TwelveData API error: ${res.status}`);

    const data = await res.json();

    // Handle single vs multiple symbols
    const quotes = Array.isArray(data) ? data : [data];

    return quotes
      .filter((q: any) => q && !q.code && q.symbol && q.close) // Filter out errors and incomplete data
      .map((q: any) => {
        const internalSymbol = symbols.find(
          (s) => toTwelveDataSymbol(s) === q.symbol
        ) || (q.symbol ? q.symbol.replace("/", "") : "UNKNOWN");
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
          timestamp: q.timestamp || Date.now() / 1000,
        };
      });
  } catch (error) {
    console.error("Failed to fetch quotes:", error);
    return [];
  }
}

export async function fetchAllQuotes(): Promise<MarketQuote[]> {
  // TwelveData free tier limits - batch into groups
  const forexSymbols = ALL_INSTRUMENTS
    .filter((i) => i.category === "forex" || i.category === "metals")
    .map((i) => i.symbol);

  const otherSymbols = ALL_INSTRUMENTS
    .filter((i) => i.category === "crypto")
    .map((i) => i.symbol);

  const [forexQuotes, cryptoQuotes] = await Promise.all([
    fetchQuotes(forexSymbols),
    fetchQuotes(otherSymbols),
  ]);

  return [...forexQuotes, ...cryptoQuotes];
}

export function calculateCurrencyStrength(quotes: MarketQuote[]): CurrencyStrength[] {
  const currencies = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"];
  const scores: Record<string, number[]> = {};

  currencies.forEach((c) => (scores[c] = []));

  const pairMap: Record<string, [string, string]> = {
    EURUSD: ["EUR", "USD"],
    GBPUSD: ["GBP", "USD"],
    USDJPY: ["USD", "JPY"],
    USDCHF: ["USD", "CHF"],
    AUDUSD: ["AUD", "USD"],
    NZDUSD: ["NZD", "USD"],
    USDCAD: ["USD", "CAD"],
    EURJPY: ["EUR", "JPY"],
    GBPJPY: ["GBP", "JPY"],
    EURGBP: ["EUR", "GBP"],
    AUDJPY: ["AUD", "JPY"],
  };

  for (const quote of quotes) {
    const pair = pairMap[quote.symbol];
    if (!pair) continue;

    const [base, counter] = pair;
    const pct = quote.changePercent;

    if (scores[base]) scores[base].push(pct);
    if (scores[counter]) scores[counter].push(-pct);
  }

  const strengths = currencies.map((currency) => {
    const values = scores[currency];
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    // Normalize to 0-100 scale (approx)
    const normalized = Math.max(0, Math.min(100, 50 + avg * 15));
    return { currency, score: Math.round(normalized * 10) / 10, rank: 0 };
  });

  strengths.sort((a, b) => b.score - a.score);
  strengths.forEach((s, i) => (s.rank = i + 1));

  return strengths;
}
