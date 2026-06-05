import { NextResponse } from "next/server";
import { fetchAllQuotes } from "@/lib/market-data";
import { generateSetups } from "@/lib/setup-engine";
import { captureEngineSetups } from "@/lib/setups/backlog-capture";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const quotes = await fetchAllQuotes();

    if (quotes.length === 0) {
      return NextResponse.json(
        {
          setups: [],
          timestamp: Date.now(),
          error: "No market data available — check API key configuration",
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    const setups = generateSetups(quotes);

    // Persist each setup's immutable first-dropped time into the backlog and
    // get back the real DB-stamped origin time. Idempotent + never throws;
    // a warm in-process cache keeps this cheap on the 60s poll path.
    const stamps = await captureEngineSetups(setups);
    const withStamps = setups.map((s) => ({
      ...s,
      firstDroppedAt: stamps.get(s.id) ?? null,
    }));

    return NextResponse.json(
      { setups: withStamps, timestamp: Date.now(), count: withStamps.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error: any) {
    console.error("Setups API error:", error);
    return NextResponse.json(
      { setups: [], timestamp: Date.now(), error: error.message },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
