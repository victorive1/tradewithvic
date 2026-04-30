// CFTC Commitments of Traders (COT) parser.
//
// CFTC publishes the weekly Disaggregated COT report as a downloadable
// CSV every Friday ~21:30 UTC, covering data as of the prior Tuesday.
// We pull the most recent file once per week, parse the rows for the
// FX + gold + index futures contracts we care about, and cache the
// net commercial position per symbol.
//
// Source URL (official):
//   https://www.cftc.gov/dea/newcot/c_year.txt
// where year = current year. The file is plain text with fixed-width
// rows. The blueprint's flow_scores doesn't need positional accuracy
// to the dollar — net direction + delta over the prior 4 weeks is
// enough to drive cotNet on FlowSnapshot.
//
// Phase 3 v1: this returns null for everything (we ship the
// infrastructure but not the actual scrape, since the CFTC text-file
// parser is fragile and deserves a dedicated test pass before going
// live). Future commits replace `null` with the parsed value.

interface CotSnapshot {
  symbol: string;
  // Net commercial position (longs - shorts) — bullish interpretation
  // is when commercials are SHORT (they're hedging an inventory they
  // believe will fall in price, so they're net bearish; speculators
  // long against them = bullish). Reverse for bearish.
  commercialNet: number | null;
  reportDate: string;
  fetchedAt: number;
}

const CACHE = new Map<string, CotSnapshot>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // 24h — report only updates weekly anyway

const COT_SYMBOL_MAP: Record<string, string> = {
  // Currency futures — CME contract names
  EURUSD: "EURO FX",
  GBPUSD: "BRITISH POUND",
  USDJPY: "JAPANESE YEN",
  AUDUSD: "AUSTRALIAN DOLLAR",
  USDCHF: "SWISS FRANC",
  USDCAD: "CANADIAN DOLLAR",
  NZDUSD: "NEW ZEALAND DOLLAR",
  XAUUSD: "GOLD",
  XAGUSD: "SILVER",
};

export async function fetchCotForSymbol(symbol: string): Promise<CotSnapshot | null> {
  const cached = CACHE.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  const cotName = COT_SYMBOL_MAP[symbol];
  if (!cotName) return null;

  // Phase 3 v1 returns null. Wiring the actual fetch + parser is
  // commit-by-commit work after we verify the CFTC text format
  // hasn't drifted.
  const placeholder: CotSnapshot = {
    symbol,
    commercialNet: null,
    reportDate: "stub",
    fetchedAt: Date.now(),
  };
  CACHE.set(symbol, placeholder);
  return placeholder;
}
