import { NextResponse } from "next/server";
import { checkAllFeeds } from "@/lib/brain/data-validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "NZDUSD", "USDCAD",
  "EURJPY", "GBPJPY", "EURGBP", "AUDJPY",
  "XAUUSD", "XAGUSD",
  "US30", "NAS100", "SPX500",
  "BTCUSD", "ETHUSD",
];
const TIMEFRAMES = ["5min", "15min", "1h", "4h"];

export async function GET() {
  const health = await checkAllFeeds({ symbols: SYMBOLS, timeframes: TIMEFRAMES });
  const blocked = health.filter((h) => h.tradePermission === "blocked").length;
  const reduced = health.filter((h) => h.tradePermission === "reduced_risk_only").length;
  return NextResponse.json({
    health,
    counts: { total: health.length, blocked, reduced, allowed: health.length - blocked - reduced },
    generatedAt: new Date().toISOString(),
  });
}
