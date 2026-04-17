// Live data service - fetches real market data and derives all analytics from it
// Every display value must come from here, never hardcoded

const API_KEY = process.env.TWELVEDATA_API_KEY || "";
const BASE_URL = "https://api.twelvedata.com";

export interface LiveQuote {
  symbol: string;
  name: string;
  exchange: string;
  datetime: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  previous_close: number;
  change: number;
  percent_change: number;
  is_market_open: boolean;
}

// Symbol mapping for TwelveData
const SYMBOL_MAP: Record<string, string> = {
  EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", USDCHF: "USD/CHF",
  AUDUSD: "AUD/USD", NZDUSD: "NZD/USD", USDCAD: "USD/CAD", EURJPY: "EUR/JPY",
  GBPJPY: "GBP/JPY", EURGBP: "EUR/GBP", AUDJPY: "AUD/JPY",
  XAUUSD: "XAU/USD", XAGUSD: "XAG/USD",
  BTCUSD: "BTC/USD", ETHUSD: "ETH/USD", SOLUSD: "SOL/USD", XRPUSD: "XRP/USD",
};

export function toApiSymbol(internal: string): string {
  return SYMBOL_MAP[internal] || internal;
}

export function fromApiSymbol(apiSymbol: string): string {
  const entry = Object.entries(SYMBOL_MAP).find(([, v]) => v === apiSymbol);
  return entry ? entry[0] : apiSymbol.replace("/", "");
}

export async function fetchLiveQuote(symbol: string): Promise<LiveQuote | null> {
  try {
    const apiSymbol = toApiSymbol(symbol);
    const res = await fetch(`${BASE_URL}/quote?symbol=${encodeURIComponent(apiSymbol)}&apikey=${API_KEY}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code) return null;

    return {
      symbol: fromApiSymbol(data.symbol),
      name: data.name || data.symbol,
      exchange: data.exchange || "",
      datetime: data.datetime || "",
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      open: parseFloat(data.open) || 0,
      high: parseFloat(data.high) || 0,
      low: parseFloat(data.low) || 0,
      close: parseFloat(data.close) || 0,
      previous_close: parseFloat(data.previous_close) || 0,
      change: parseFloat(data.change) || 0,
      percent_change: parseFloat(data.percent_change) || 0,
      is_market_open: data.is_market_open ?? true,
    };
  } catch {
    return null;
  }
}

export async function fetchMultipleQuotes(symbols: string[]): Promise<LiveQuote[]> {
  try {
    const apiSymbols = symbols.map(toApiSymbol).join(",");
    const res = await fetch(`${BASE_URL}/quote?symbol=${encodeURIComponent(apiSymbols)}&apikey=${API_KEY}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [data];

    return arr
      .filter((q: any) => q && !q.code && q.close)
      .map((q: any) => ({
        symbol: fromApiSymbol(q.symbol),
        name: q.name || q.symbol,
        exchange: q.exchange || "",
        datetime: q.datetime || "",
        timestamp: q.timestamp || Math.floor(Date.now() / 1000),
        open: parseFloat(q.open) || 0,
        high: parseFloat(q.high) || 0,
        low: parseFloat(q.low) || 0,
        close: parseFloat(q.close) || 0,
        previous_close: parseFloat(q.previous_close) || 0,
        change: parseFloat(q.change) || 0,
        percent_change: parseFloat(q.percent_change) || 0,
        is_market_open: q.is_market_open ?? true,
      }));
  } catch {
    return [];
  }
}

// Timestamp for "last updated" displays
export function getLastUpdatedLabel(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Detect stale data (older than 5 minutes)
export function isStale(timestamp: number): boolean {
  return Date.now() / 1000 - timestamp > 300;
}
