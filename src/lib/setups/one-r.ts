// Computes the 1:1 risk-to-reward target ("1R Target") for a setup.
// This is purely a display layer — it never replaces the setup's own
// TP1/TP2/TP3, never touches scoring, never touches algo routing. It
// gives users a quick "I'd be back to flat on my risk" reference price.
//
// 1R = entry + (entry - stopLoss) for a long
// 1R = entry - (stopLoss - entry) for a short

// Accept any string — call sites use a mix of "buy"/"sell",
// "long"/"short", and "bullish"/"bearish" depending on which subsystem
// the data came from. Anything not recognised as long defaults to short.
export type DirectionInput = string;

export function computeOneR(
  entry: number,
  stopLoss: number,
  direction: DirectionInput,
): number {
  const risk = Math.abs(entry - stopLoss);
  const d = direction.toLowerCase();
  const isLong = d === "buy" || d === "long" || d === "bullish";
  return isLong ? entry + risk : entry - risk;
}

// Format helper that mirrors the precision a price string already uses,
// so the 1R Target sits visually next to the existing TPs without
// looking out of place on instruments with different digit counts.
export function formatOneR(
  entry: number,
  stopLoss: number,
  direction: DirectionInput,
  digits = 5,
): string {
  return computeOneR(entry, stopLoss, direction).toFixed(digits);
}
