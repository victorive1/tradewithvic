// Retail Sentiment Engine — blueprint § 7.3.
//
// Phase 2: pulls live retail long/short percentages from Myfxbook
// (free, hourly-updated, FX pairs + gold supported). Symbols not
// covered by Myfxbook (indices, crypto) still return the
// "unavailable" stub until Phase 3 wires alternative sources
// (Coinglass for crypto, broker CFD positioning for indices).

import type { FlowContext, RetailFlowResult } from "@/lib/flow/types";
import { fetchMyfxbookSentiment } from "@/lib/flow/sources/myfxbook";

export async function fetchRetailSentiment(ctx: FlowContext): Promise<RetailFlowResult> {
  const myfx = await fetchMyfxbookSentiment(ctx.symbol);
  if (!myfx) {
    return {
      longPct: null,
      shortPct: null,
      crowding: "unavailable",
      source: "unavailable",
      buyScore: 0,
      sellScore: 0,
    };
  }

  const longPct = myfx.longPct;
  const shortPct = myfx.shortPct;
  const crowding: RetailFlowResult["crowding"] =
    longPct >= 65 ? "long_heavy"
    : shortPct >= 65 ? "short_heavy"
    : "balanced";

  // Retail buy/sell scores — these aren't direct buy/sell pressure,
  // they're "how crowded" each side is. The trap detector and prediction
  // module use these as counter-trade fuel: heavy long crowding boosts
  // bull-trap risk; heavy short crowding boosts bear-trap risk.
  // 50% = neutral = 50 points; 80% crowded = 100 points.
  const buyScore  = Math.min(100, Math.max(0, Math.round((longPct  - 50) * 3.33 + 50)));
  const sellScore = Math.min(100, Math.max(0, Math.round((shortPct - 50) * 3.33 + 50)));

  return {
    longPct,
    shortPct,
    crowding,
    source: "myfxbook",
    buyScore,
    sellScore,
  };
}
