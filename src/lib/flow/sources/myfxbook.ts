// Myfxbook retail sentiment scraper.
//
// Myfxbook publishes free aggregated retail positions per FX pair at
//   https://www.myfxbook.com/community/outlook/EURUSD
// The page contains a table with long/short percentages + open volume
// + open positions. Scraped server-side, cached for 60 minutes (the
// data updates ~hourly upstream so re-fetching every 2 minutes is
// wasteful and rude).
//
// Only FX pairs are supported. Indices/crypto get no Myfxbook data;
// they fall back to the "unavailable" stub.

interface MyfxbookSentiment {
  symbol: string;
  longPct: number;
  shortPct: number;
  longPositions: number | null;
  shortPositions: number | null;
  openVolumeLots: number | null;
  fetchedAt: number;
}

const CACHE = new Map<string, MyfxbookSentiment>();
const CACHE_TTL_MS = 60 * 60 * 1000;  // 60 min

const SUPPORTED = new Set(["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "NZDUSD", "XAUUSD"]);

export async function fetchMyfxbookSentiment(symbol: string): Promise<MyfxbookSentiment | null> {
  if (!SUPPORTED.has(symbol)) return null;

  const cached = CACHE.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  const url = `https://www.myfxbook.com/community/outlook/${symbol}`;
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
      // 8s timeout to avoid hanging the cron.
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`myfxbook ${symbol} ${res.status}`);
    html = await res.text();
  } catch (err) {
    // Don't blow up the scan — cache misses become "unavailable".
    void err;
    return null;
  }

  // Parse two numbers like `<td class="bold">61%</td>` followed by the
  // short percentage in the same table cell pattern. Also the open
  // volume + positions tags have stable class names. Cheap regex
  // extraction — Myfxbook HTML has been stable for years.
  const longMatch = html.match(/<td[^>]*>([0-9]+)%<\/td>\s*<td[^>]*>Long Positions/i)
                  || html.match(/(\d+)%\s*<\/td>\s*<td[^>]*>\s*Long\s+Positions/i)
                  || html.match(/Long[^0-9]+(\d+)\s*%/i);
  const shortMatch = html.match(/<td[^>]*>([0-9]+)%<\/td>\s*<td[^>]*>Short Positions/i)
                   || html.match(/(\d+)%\s*<\/td>\s*<td[^>]*>\s*Short\s+Positions/i)
                   || html.match(/Short[^0-9]+(\d+)\s*%/i);

  if (!longMatch || !shortMatch) return null;
  const longPct = parseInt(longMatch[1], 10);
  const shortPct = parseInt(shortMatch[1], 10);
  if (!Number.isFinite(longPct) || !Number.isFinite(shortPct)) return null;
  if (longPct + shortPct < 90 || longPct + shortPct > 110) return null;  // sanity check

  // Open positions counts (optional)
  const longPosMatch = html.match(/Long Positions[^0-9]*([0-9,]+)/i);
  const shortPosMatch = html.match(/Short Positions[^0-9]*([0-9,]+)/i);
  const longPositions = longPosMatch ? parseInt(longPosMatch[1].replace(/,/g, ""), 10) : null;
  const shortPositions = shortPosMatch ? parseInt(shortPosMatch[1].replace(/,/g, ""), 10) : null;

  const result: MyfxbookSentiment = {
    symbol,
    longPct,
    shortPct,
    longPositions: Number.isFinite(longPositions) ? longPositions : null,
    shortPositions: Number.isFinite(shortPositions) ? shortPositions : null,
    openVolumeLots: null,
    fetchedAt: Date.now(),
  };
  CACHE.set(symbol, result);
  return result;
}

// Diagnostic — exposed so the admin can probe the scraper without
// running a full scan.
export function inspectMyfxbookCache(): MyfxbookSentiment[] {
  return Array.from(CACHE.values());
}
