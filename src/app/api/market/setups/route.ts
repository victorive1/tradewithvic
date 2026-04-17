import { NextResponse } from "next/server";
import { fetchAllQuotes } from "@/lib/market-data";
import { generateSetups } from "@/lib/setup-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quotes = await fetchAllQuotes();

    if (quotes.length === 0) {
      return NextResponse.json({
        setups: [],
        timestamp: Date.now(),
        error: "No market data available — check API key configuration",
      });
    }

    const setups = generateSetups(quotes);
    return NextResponse.json({ setups, timestamp: Date.now(), count: setups.length });
  } catch (error: any) {
    console.error("Setups API error:", error);
    return NextResponse.json({ setups: [], timestamp: Date.now(), error: error.message });
  }
}
