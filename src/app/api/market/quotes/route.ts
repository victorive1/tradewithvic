import { NextResponse } from "next/server";
import { fetchAllQuotes, calculateCurrencyStrength } from "@/lib/market-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const hasKey = !!process.env.TWELVEDATA_API_KEY;

    if (!hasKey) {
      return NextResponse.json({
        quotes: [],
        currencyStrength: [],
        timestamp: Date.now(),
        error: "TWELVEDATA_API_KEY not configured",
        debug: "Add TWELVEDATA_API_KEY in Vercel Environment Variables",
      });
    }

    const quotes = await fetchAllQuotes();
    const strength = calculateCurrencyStrength(quotes);

    return NextResponse.json({
      quotes,
      currencyStrength: strength,
      timestamp: Date.now(),
      count: quotes.length,
    });
  } catch (error: any) {
    console.error("Market quotes API error:", error);
    return NextResponse.json({
      quotes: [],
      currencyStrength: [],
      timestamp: Date.now(),
      error: error.message || "Failed to fetch market data",
    });
  }
}
