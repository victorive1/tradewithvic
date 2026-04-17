import { NextResponse } from "next/server";
import { fetchAllQuotes, calculateCurrencyStrength } from "@/lib/market-data";

export async function GET() {
  try {
    const quotes = await fetchAllQuotes();
    const strength = calculateCurrencyStrength(quotes);

    return NextResponse.json({
      quotes,
      currencyStrength: strength,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Market quotes API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}
