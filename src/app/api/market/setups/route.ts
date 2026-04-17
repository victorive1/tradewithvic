import { NextResponse } from "next/server";
import { fetchAllQuotes } from "@/lib/market-data";
import { generateSetups } from "@/lib/setup-engine";

export async function GET() {
  try {
    const quotes = await fetchAllQuotes();
    const setups = generateSetups(quotes);
    return NextResponse.json({ setups, timestamp: Date.now() });
  } catch (error) {
    console.error("Setups API error:", error);
    return NextResponse.json({ error: "Failed to generate setups" }, { status: 500 });
  }
}
