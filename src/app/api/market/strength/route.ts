import { NextResponse } from "next/server";
import { fetchAllQuotes, calculateCurrencyStrength } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quotes = await fetchAllQuotes();
    const strength = calculateCurrencyStrength(quotes);
    return NextResponse.json({ strength, timestamp: Date.now() });
  } catch (error) {
    console.error("Strength API error:", error);
    return NextResponse.json({ error: "Failed to calculate strength" }, { status: 500 });
  }
}
