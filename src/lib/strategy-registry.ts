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
  // Path to the strategy's dedicated dashboard tab, if one exists.
  // The "A & A+ Only" tab uses this to render an "open in tab" link
  // on each card. Strategies without a dedicated tab fall back to a
  // strategy-filtered Strategy Bible link.
  dedicatedTab?: string;
}

// Curated registry. Anything in the DB but not here renders with the
// raw setupType as fallback label — won't crash, just looks ugly.
export const STRATEGY_REGISTRY: StrategyMeta[] = [
  // ── PDF Strategy 01: FVG family ──
  { setupType: "fvg_continuation",          label: "FVG Continuation",          family: "ICT",
    blurb: "Fill of a 3-candle imbalance in the trend direction." },
  { setupType: "inverse_fvg",               label: "Inverse FVG",               family: "ICT",
    dedicatedTab: "/dashboard/inverse-fvg",
    blurb: "FVG flipped after a close-through — old support becomes resistance and vice versa." },
  { setupType: "bullish_fvg_inversion",     label: "Bullish FVG Inversion",     family: "ICT",
    dedicatedTab: "/dashboard/bullish-fvg-inversion",
    blurb: "1H FVG tap from discount + 5min bearish FVG failure → bullish inversion zone." },
  // ── PDF Strategy 02: Order Block ──
  { setupType: "order_block",               label: "Order Block",               family: "ICT",
    dedicatedTab: "/dashboard/order-blocks",
    blurb: "Last opposite-coloured candle before a confirmed BOS impulse — institutional order zone." },
  { setupType: "breaker_block",             label: "Breaker Block",             family: "ICT",
    blurb: "Order Block whose protective swing was swept then broken — flipped role." },
  // ── PDF Strategy 04: Liquidity Sweep ──
  { setupType: "sweep_reversal",            label: "Liquidity Sweep",           family: "ICT",
    blurb: "Stop hunt beyond an obvious level followed by sharp reversal." },
  // ── PDF Strategy 11: Breakout ──
  { setupType: "breakout",                  label: "Breakout",                  family: "HYBRID",
    dedicatedTab: "/dashboard/breakouts",
    blurb: "Body close through prior day high/low with displacement." },
  // ── PDF Strategy 14: Pullback / Trend Continuation ──
  { setupType: "trend_pullback",            label: "Trend Pullback",            family: "SMC",
    blurb: "Pullback to EMA20 inside an aligned trend, RSI in entry band." },
  // ── PDF Strategy 12: PO3 / Triple Lock ──
  { setupType: "triple_lock",               label: "Power of 3 (Triple Lock)",  family: "ELITE",
    dedicatedTab: "/dashboard/triple-lock",
    blurb: "PO3 + VP/OF + CCTE — 12-gate composite, EPS-scored." },
  // ── PDF Strategy 03: BOS / CHoCH ──
  { setupType: "bos_setup",                 label: "BOS Continuation",          family: "SMC",
    blurb: "First pullback to the FVG left by a confirmed BOS impulse." },
  { setupType: "choch_reversal",            label: "CHoCH Reversal",            family: "SMC",
    blurb: "First M15 FVG in the new direction after a Change of Character." },
  // ── PDF Strategy 05: SMT Divergence ──
  { setupType: "smt_divergence",            label: "SMT Divergence",            family: "ICT",
    blurb: "Correlated pair makes opposite extreme — non-confirmation reveals manipulation." },
  // ── PDF Strategy 06: CRT — Candle Range Theory ──
  { setupType: "crt",                       label: "CRT — Candle Range Theory", family: "ICT",
    blurb: "PO3 mapped onto a single H4/D1 mother candle — sweep beyond opening range, close back inside." },
  // ── PDF Strategy 07: CISD ──
  { setupType: "cisd",                      label: "CISD — State Change",       family: "ICT",
    blurb: "Delivery direction flips — first opposite-half close after sustained delivery sequence." },
  // ── PDF Strategy 08: MMBM — Market Maker Buy/Sell Model ──
  { setupType: "mmbm",                      label: "MMBM",                       family: "ICT",
    blurb: "Accumulation range + engineered sweep + sharp reversal — full institutional cycle." },
  // ── PDF Strategy 09: ICT Dealing Range / OTE ──
  { setupType: "dealing_range_ote",         label: "Dealing Range OTE",          family: "ICT",
    blurb: "Discount/premium-zone entry at the 62–79% Fibonacci retracement (OTE) of a swing-defined range." },
  // ── PDF Strategy 10: ICT Silver Bullet ──
  { setupType: "silver_bullet",             label: "ICT Silver Bullet",          family: "ICT",
    blurb: "Time-gated FVG strategy — fires only inside 08–09 / 15–16 / 19–20 UTC windows after a sweep." },
  // ── PDF Strategy 11: London Breakout (PDF version) ──
  { setupType: "london_breakout",           label: "London Breakout",            family: "HYBRID",
    blurb: "Asian range break + retest at London open — directional break from the Asian coil." },
  // ── PDF Strategy 13: Wyckoff Method ──
  { setupType: "wyckoff",                   label: "Wyckoff Spring/UTAD",        family: "CLASSIC",
    blurb: "Spring (accumulation) or UTAD (distribution) with ICT OB confluence — final shakeout before markup." },
  // ── PDF Strategy 15: Engulfing + SMC ──
  { setupType: "engulfing_smc",             label: "Engulfing + SMC",            family: "HYBRID",
    blurb: "Engulfing candle inside a valid HTF OB or FVG — SMC-filtered candlestick pattern." },
  // ── PDF Strategy 16: EPS Aggregation Engine (Elite) ──
  { setupType: "eps_aggregation",           label: "Elite Confluence (EPS)",     family: "ELITE",
    blurb: "Master detector — fires only when 2+ strategies agree at the same price zone, multi-strategy bonus stacks." },
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
