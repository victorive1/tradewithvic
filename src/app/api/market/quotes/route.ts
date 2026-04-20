import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAllQuotes, calculateCurrencyStrength, type MarketQuote } from "@/lib/market-data";
import { ALL_INSTRUMENTS } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Quote feed consumed by every algo page, Market Radar, Screener, etc.
 *
 * Previously this hit TwelveData on every call — 22 credits per request,
 * polled every 60s from every open tab. An admin leaving a few algo pages
 * open overnight burned ~30k credits a day for no functional benefit,
 * because the 2-min scan cycle already writes every quote to MarketSnapshot.
 *
 * Now we serve from MarketSnapshot and only fall back to a live TwelveData
 * fetch when the cache is empty or stale (>5 min). During normal operation
 * the endpoint costs zero API credits.
 */

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const DISPLAY_BY_SYMBOL = new Map<string, (typeof ALL_INSTRUMENTS)[number]>(
  ALL_INSTRUMENTS.map((i) => [i.symbol as string, i]),
);

function snapshotsToQuotes(rows: Array<{
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  capturedAt: Date;
  sourceTimestamp: number | null;
}>): MarketQuote[] {
  const byLatest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const existing = byLatest.get(r.symbol);
    if (!existing || r.capturedAt > existing.capturedAt) {
      byLatest.set(r.symbol, r);
    }
  }
  const out: MarketQuote[] = [];
  for (const r of byLatest.values()) {
    const inst = DISPLAY_BY_SYMBOL.get(r.symbol);
    if (!inst) continue;
    out.push({
      symbol: r.symbol,
      displayName: inst.displayName,
      category: inst.category,
      price: r.price,
      change: r.change,
      changePercent: r.changePercent,
      high: r.high,
      low: r.low,
      open: r.open,
      previousClose: r.previousClose,
      timestamp: r.sourceTimestamp ?? Math.floor(r.capturedAt.getTime() / 1000),
    });
  }
  return out;
}

export async function GET() {
  try {
    // Pull the most recent ~300 snapshot rows — covers 1-2 cycles of all
    // 22 instruments with plenty of headroom. We dedupe to latest-per-symbol
    // in snapshotsToQuotes().
    const rows = await prisma.marketSnapshot.findMany({
      orderBy: { capturedAt: "desc" },
      take: 300,
      select: {
        symbol: true,
        price: true,
        change: true,
        changePercent: true,
        high: true,
        low: true,
        open: true,
        previousClose: true,
        capturedAt: true,
        sourceTimestamp: true,
      },
    });

    const newest = rows[0]?.capturedAt ?? null;
    const ageMs = newest ? Date.now() - newest.getTime() : Infinity;
    const fresh = ageMs <= STALE_THRESHOLD_MS;

    if (rows.length > 0 && fresh) {
      const quotes = snapshotsToQuotes(rows);
      const strength = calculateCurrencyStrength(quotes);
      return NextResponse.json({
        quotes,
        currencyStrength: strength,
        timestamp: Date.now(),
        count: quotes.length,
        source: "market_snapshot",
        capturedAt: newest?.toISOString() ?? null,
        ageSeconds: Math.round(ageMs / 1000),
      });
    }

    // Cache missing or stale — fall back to live TwelveData fetch so the
    // endpoint never appears empty. This path only runs in the rare
    // window where the scan cycle is delayed or the app just booted.
    const hasKey = !!process.env.TWELVEDATA_API_KEY;
    if (!hasKey) {
      return NextResponse.json({
        quotes: [],
        currencyStrength: [],
        timestamp: Date.now(),
        source: "empty",
        error: "TWELVEDATA_API_KEY not configured and no cached snapshots",
      });
    }
    const quotes = await fetchAllQuotes();
    const strength = calculateCurrencyStrength(quotes);
    return NextResponse.json({
      quotes,
      currencyStrength: strength,
      timestamp: Date.now(),
      count: quotes.length,
      source: "live_fallback",
      ageSeconds: 0,
    });
  } catch (error: any) {
    console.error("Market quotes API error:", error);
    return NextResponse.json({
      quotes: [],
      currencyStrength: [],
      timestamp: Date.now(),
      source: "error",
      error: error.message || "Failed to fetch market data",
    });
  }
}
