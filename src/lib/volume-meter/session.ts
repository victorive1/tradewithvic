import type { SessionName } from "./types";

// Per-pair session affinity scoring (0-100). Trader convention:
//   - JPY pairs are most alive during Asia
//   - EUR / GBP / CHF pairs come alive during London
//   - USD-quoted majors peak during NY
//   - The London/NY overlap (12:00-16:00 UTC) is the cleanest hour for most
//     liquid pairs
//   - Anything outside its primary session gets a sizable haircut
//
// This is intentionally simple — V1 uses a 24-bucket lookup per family.
// V2 can replace this with empirical baselines per (pair, dayOfWeek, hour).

type CurrencyFamily = "USD" | "EUR" | "GBP" | "JPY" | "CHF" | "AUD" | "NZD" | "CAD";

function familiesOf(symbol: string): [CurrencyFamily, CurrencyFamily] {
  const base = symbol.slice(0, 3) as CurrencyFamily;
  const counter = symbol.slice(3, 6) as CurrencyFamily;
  return [base, counter];
}

export function currentSession(at: Date = new Date()): SessionName {
  const h = at.getUTCHours();
  // Asia: 22:00 → 08:00 UTC
  // London: 07:00 → 16:00 UTC
  // NY: 12:00 → 21:00 UTC
  // Overlap (London/NY): 12:00 → 16:00 UTC
  if (h >= 12 && h < 16) return "London/NY";
  if (h >= 7 && h < 12) return "London";
  if (h >= 16 && h < 21) return "NY";
  if (h >= 22 || h < 8) return "Asia";
  return "Off-session";
}

// Returns 0-100 — how much "natural" liquidity this pair gets at this UTC hour.
// JPY pair at NY open is fine, but JPY pair at 04:00 UTC is dead.
export function sessionScoreFor(symbol: string, at: Date = new Date()): number {
  const [base, counter] = familiesOf(symbol);
  const h = at.getUTCHours();

  // Affinity per family by 4 broad windows. Values are rough liquidity
  // weights, calibrated so a "primary session" pair scores ~85-95 and an
  // off-session pair scores 25-40.
  const asia = h >= 22 || h < 8;
  const london = h >= 7 && h < 16;
  const ny = h >= 12 && h < 21;
  const overlap = h >= 12 && h < 16;

  function familyScore(fam: CurrencyFamily): number {
    if (fam === "JPY") return asia ? 90 : ny ? 65 : 35;
    if (fam === "EUR" || fam === "GBP" || fam === "CHF") return overlap ? 95 : london ? 85 : ny ? 70 : 35;
    if (fam === "USD") return overlap ? 95 : ny ? 88 : london ? 70 : 30;
    if (fam === "AUD" || fam === "NZD") return asia ? 80 : overlap ? 75 : 40;
    if (fam === "CAD") return overlap ? 90 : ny ? 80 : 40;
    return 50;
  }

  // Pair score = average of the two legs' family scores. If both legs are
  // primary in the current window the pair scores high; if one is dead the
  // average pulls it down.
  return Math.round((familyScore(base) + familyScore(counter)) / 2);
}
