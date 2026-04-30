// Retail Sentiment Engine — blueprint § 7.3.
//
// Phase 1: this module returns a "data unavailable" stub. The retail
// panel in the UI will render an explicit "wire Myfxbook" placeholder
// so the trader knows the bull-trap / bear-trap detector is running
// without the retail-overcrowding overlay.
//
// Phase 2 (Layer 9-10) will replace the body with a Myfxbook scraper
// + an OANDA/IG API path. The signature stays stable so callers
// don't change.
//
// IMPORTANT: this is the ONE module that genuinely cannot be built
// from brain data alone. Retail sentiment requires an external feed
// of broker open positions. We're explicit about that gap rather than
// faking it.

import type { FlowContext, RetailFlowResult } from "@/lib/flow/types";

export async function fetchRetailSentiment(_ctx: FlowContext): Promise<RetailFlowResult> {
  // Phase 1 stub — flagged as unavailable everywhere downstream.
  return {
    longPct: null,
    shortPct: null,
    crowding: "unavailable",
    source: "unavailable",
    buyScore: 0,
    sellScore: 0,
  };
}
