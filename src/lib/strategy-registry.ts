// Single source of truth for human-friendly names + categories per
// setupType. Used by the Strategy Bible tab to label filter chips and
// to colour-code cards by strategy family. New brain detectors should
// register their setupType here as they're added — keeps the rest of
// the UI free of scattered if/else display logic.

export type StrategyFamily = "ICT" | "SMC" | "HYBRID" | "CLASSIC" | "ELITE";

export interface StrategyMeta {
  setupType: string;
  label: string;
  family: StrategyFamily;
  // Short one-liner for the strategy-picker dropdown / tooltip.
  blurb?: string;
}

// Curated registry. Anything in the DB but not here renders with the
// raw setupType as fallback label — won't crash, just looks ugly.
export const STRATEGY_REGISTRY: StrategyMeta[] = [
  // ── PDF Strategy 01: FVG family ──
  { setupType: "fvg_continuation",          label: "FVG Continuation",          family: "ICT",
    blurb: "Fill of a 3-candle imbalance in the trend direction." },
  { setupType: "inverse_fvg",               label: "Inverse FVG",               family: "ICT",
    blurb: "FVG flipped after a close-through — old support becomes resistance and vice versa." },
  { setupType: "bullish_fvg_inversion",     label: "Bullish FVG Inversion",     family: "ICT",
    blurb: "1H FVG tap from discount + 5min bearish FVG failure → bullish inversion zone." },
  // ── PDF Strategy 02: Order Block ──
  { setupType: "order_block",               label: "Order Block",               family: "ICT",
    blurb: "Last opposite-coloured candle before a confirmed BOS impulse — institutional order zone." },
  { setupType: "breaker_block",             label: "Breaker Block",             family: "ICT",
    blurb: "Order Block whose protective swing was swept then broken — flipped role." },
  // ── PDF Strategy 04: Liquidity Sweep ──
  { setupType: "sweep_reversal",            label: "Liquidity Sweep",           family: "ICT",
    blurb: "Stop hunt beyond an obvious level followed by sharp reversal." },
  // ── PDF Strategy 11: Breakout ──
  { setupType: "breakout",                  label: "Breakout",                  family: "HYBRID",
    blurb: "Body close through prior day high/low with displacement." },
  // ── PDF Strategy 14: Pullback / Trend Continuation ──
  { setupType: "trend_pullback",            label: "Trend Pullback",            family: "SMC",
    blurb: "Pullback to EMA20 inside an aligned trend, RSI in entry band." },
  // ── PDF Strategy 12: PO3 / Triple Lock ──
  { setupType: "triple_lock",               label: "Power of 3 (Triple Lock)",  family: "ELITE",
    blurb: "PO3 + VP/OF + CCTE — 12-gate composite, EPS-scored." },
];

const BY_TYPE = new Map(STRATEGY_REGISTRY.map((s) => [s.setupType, s]));

export function strategyMeta(setupType: string): StrategyMeta {
  return BY_TYPE.get(setupType) ?? {
    setupType,
    label: setupType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    family: "ICT",
  };
}

// Tailwind class fragments per family — keeps the chip / pill styling
// visually grouped without a 60-line switch in the component.
export const FAMILY_STYLES: Record<StrategyFamily, { text: string; bg: string; border: string }> = {
  ICT:     { text: "text-accent-light",   bg: "bg-accent/10",    border: "border-accent/30" },
  SMC:     { text: "text-bull-light",     bg: "bg-bull/10",      border: "border-bull/30" },
  HYBRID:  { text: "text-warn-light",     bg: "bg-warn/10",      border: "border-warn/30" },
  CLASSIC: { text: "text-blue-300",       bg: "bg-blue-500/10",  border: "border-blue-500/30" },
  ELITE:   { text: "text-foreground",     bg: "bg-foreground/10",border: "border-foreground/30" },
};
