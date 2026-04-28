// The codebase has three direction conventions in flight: the legacy setup
// engine writes "buy"/"sell", the Brain writes "bullish"/"bearish", and a
// minority of older code paths use "long"/"short". A live DB sample shows
// 11.7k bullish, 9.2k bearish, 569 long, 519 short. Comparing
// `direction === "bullish"` (or any single value) silently breaks for the
// other conventions — and inverts trade execution when it happens in the
// algo runtime. Always go through this helper.
export function isBullishDirection(d: string | null | undefined): boolean {
  return d === "bullish" || d === "long" || d === "buy";
}

export function isBearishDirection(d: string | null | undefined): boolean {
  return d === "bearish" || d === "short" || d === "sell";
}
