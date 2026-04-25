// Market Regime → strategy policy — Quant Engine Blueprint § 6.
//
// Same setup does not perform equally in every regime. This module
// translates a RegimeSnapshot into a list of allowed and blocked
// strategy setupTypes the algo runtime will respect when routing.
//
// Pure function — no DB, no side effects. Caller (algo runtime,
// dashboard) reads the latest RegimeSnapshot per symbol and asks
// allowedStrategies(regime) before considering each candidate setup.

export interface RegimeInputs {
  structureRegime: string;     // trending | ranging | compression | expansion | transitioning
  directionalBias: string;     // bullish | bearish | neutral
  volatilityRegime: string;    // low | normal | high | spike
  trendStrength?: string;      // none | weak | moderate | strong
}

export interface StrategyPolicy {
  regimeLabel: string;
  allowed: string[];
  blocked: string[];
  reason: string;
}

const TREND_CONTINUATION = ["breakout", "trend_pullback", "inverse_fvg", "order_block", "vwap_reclaim"];
const REVERSAL = ["sweep_reversal", "vwap_rejection", "inverse_fvg"];
const MEAN_REVERSION = ["vwap_reclaim", "vwap_rejection", "stretched_fade"];

export function strategyPolicyFor(inputs: RegimeInputs): StrategyPolicy {
  const { structureRegime, directionalBias, volatilityRegime, trendStrength } = inputs;

  // Volatility spike — no trade. Spread + slippage make every entry
  // unreliable. Algo runtime should idle until vol normalizes.
  if (volatilityRegime === "spike") {
    return {
      regimeLabel: "volatility_spike",
      allowed: [],
      blocked: ["*"],
      reason: "Volatility spike — entries unreliable, all strategies blocked.",
    };
  }

  // Strong trends — favour continuation, block countertrend.
  if (structureRegime === "trending" && (trendStrength === "strong" || trendStrength === "moderate")) {
    if (directionalBias === "bullish") {
      return {
        regimeLabel: "bullish_trend_continuation",
        allowed: TREND_CONTINUATION,
        blocked: ["sweep_reversal", "stretched_fade", "vwap_rejection"],
        reason: "Strong bullish trend — continuation strategies favoured, countertrend blocked.",
      };
    }
    if (directionalBias === "bearish") {
      return {
        regimeLabel: "bearish_trend_continuation",
        allowed: TREND_CONTINUATION,
        blocked: ["sweep_reversal", "stretched_fade", "vwap_rejection"],
        reason: "Strong bearish trend — continuation strategies favoured, countertrend blocked.",
      };
    }
  }

  // Range / compression — favour mean reversion + reversals, block
  // breakout-style strategies (false-break risk is high).
  if (structureRegime === "ranging" || structureRegime === "compression") {
    return {
      regimeLabel: "ranging_compression",
      allowed: [...new Set([...MEAN_REVERSION, ...REVERSAL])],
      blocked: ["breakout", "trend_pullback"],
      reason: "Range / compression — mean-reversion and reversals favoured, breakouts blocked.",
    };
  }

  // Expansion / transitioning — uncertain. Allow only A+ setups by
  // tagging everything as allowed but flagging the reason. (Algo
  // runtime can pair this with a higher minScore in future.)
  if (structureRegime === "expansion" || structureRegime === "transitioning") {
    return {
      regimeLabel: structureRegime,
      allowed: [...new Set([...TREND_CONTINUATION, ...REVERSAL])],
      blocked: [],
      reason: "Expansion / transitioning regime — A+ only, no clear strategy bias.",
    };
  }

  // Fallback: weak trend or unknown — be permissive but log.
  return {
    regimeLabel: structureRegime || "unknown",
    allowed: [...new Set([...TREND_CONTINUATION, ...REVERSAL, ...MEAN_REVERSION])],
    blocked: [],
    reason: "Weak / unknown regime — no policy gating applied.",
  };
}

// Convenience wrapper: returns true if `setupType` is allowed under
// the given regime. Handles the wildcard "*" blocked case.
export function isStrategyAllowed(setupType: string, policy: StrategyPolicy): boolean {
  if (policy.blocked.includes("*")) return false;
  if (policy.blocked.includes(setupType)) return false;
  return policy.allowed.length === 0 ? true : policy.allowed.includes(setupType);
}
