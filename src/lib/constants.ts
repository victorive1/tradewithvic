export const INSTRUMENTS = {
  forex: [
    { symbol: "EURUSD", displayName: "EUR/USD", category: "forex", decimals: 5 },
    { symbol: "GBPUSD", displayName: "GBP/USD", category: "forex", decimals: 5 },
    { symbol: "USDJPY", displayName: "USD/JPY", category: "forex", decimals: 3 },
    { symbol: "USDCHF", displayName: "USD/CHF", category: "forex", decimals: 5 },
    { symbol: "AUDUSD", displayName: "AUD/USD", category: "forex", decimals: 5 },
    { symbol: "NZDUSD", displayName: "NZD/USD", category: "forex", decimals: 5 },
    { symbol: "USDCAD", displayName: "USD/CAD", category: "forex", decimals: 5 },
    { symbol: "EURJPY", displayName: "EUR/JPY", category: "forex", decimals: 3 },
    { symbol: "GBPJPY", displayName: "GBP/JPY", category: "forex", decimals: 3 },
    { symbol: "EURGBP", displayName: "EUR/GBP", category: "forex", decimals: 5 },
    { symbol: "AUDJPY", displayName: "AUD/JPY", category: "forex", decimals: 3 },
  ],
  metals: [
    { symbol: "XAUUSD", displayName: "XAU/USD", category: "metals", decimals: 2 },
    { symbol: "XAGUSD", displayName: "XAG/USD", category: "metals", decimals: 3 },
  ],
  energy: [
    { symbol: "USOIL", displayName: "US Oil (WTI)", category: "energy", decimals: 2 },
  ],
  // Indices are temporarily offline — Twelve Data does not carry US cash indices.
  // Kept here so they can be re-enabled (alongside ALL_INSTRUMENTS / MARKET_CATEGORIES) once a data source is wired up.
  indices: [
    { symbol: "NAS100", displayName: "NAS100", category: "indices", decimals: 1 },
    { symbol: "US30", displayName: "US30 (Dow)", category: "indices", decimals: 1 },
    { symbol: "SPX500", displayName: "S&P 500", category: "indices", decimals: 1 },
    { symbol: "GER40", displayName: "GER40 (DAX)", category: "indices", decimals: 1 },
  ],
  crypto: [
    { symbol: "BTCUSD", displayName: "BTC/USD", category: "crypto", decimals: 2 },
    { symbol: "ETHUSD", displayName: "ETH/USD", category: "crypto", decimals: 2 },
    { symbol: "SOLUSD", displayName: "SOL/USD", category: "crypto", decimals: 2 },
    { symbol: "XRPUSD", displayName: "XRP/USD", category: "crypto", decimals: 4 },
  ],
} as const;

export const ALL_INSTRUMENTS = [
  ...INSTRUMENTS.forex,
  ...INSTRUMENTS.metals,
  ...INSTRUMENTS.energy,
  ...INSTRUMENTS.crypto,
];

export const MARKET_CATEGORIES = [
  { id: "all", label: "All Markets" },
  { id: "forex", label: "Forex" },
  { id: "metals", label: "Metals" },
  { id: "energy", label: "Energy" },
  { id: "crypto", label: "Crypto" },
] as const;

export const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"] as const;

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"] as const;
