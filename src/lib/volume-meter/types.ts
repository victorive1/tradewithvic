// Public types for the FX Wonders Market Meat Engine (a.k.a. Volume Meter).
//
// Everything here is per-pair. The score is computed from candle data the
// brain pipeline already collects — no new data provider, no new tables in
// V1. See ./score.ts for the math.

export type LiquidityLabel =
  | "Dead"      // 0–20
  | "Thin"      // 21–40
  | "Normal"    // 41–60
  | "Active"    // 61–75
  | "Heavy"     // 76–90
  | "Extreme";  // 91–100

export type TradeCondition =
  | "Avoid"
  | "Caution"
  | "Tradable"
  | "Strong"
  | "Strong but volatile";

export type SessionName = "Asia" | "London" | "NY" | "London/NY" | "Off-session";

export type VolumeState = "Drying up" | "Below avg" | "Normal" | "Above avg" | "Expanding" | "Surge";

export type SpreadQuality = "Tight" | "Normal" | "Wide" | "Unknown";

export interface MeatScoreBreakdown {
  // Each component contributes its weight × its 0-100 sub-score.
  tickActivity: number;        // weight 0.30
  candleParticipation: number; // weight 0.25
  atrExpansion: number;        // weight 0.20
  sessionStrength: number;     // weight 0.15
  rangeQuality: number;        // weight 0.10
}

export interface PairLiquidityScore {
  symbol: string;
  pair: string;          // "EUR/USD"
  meatScore: number;     // 0-100, rounded
  label: LiquidityLabel;
  tradeCondition: TradeCondition;
  volumeState: VolumeState;
  spreadQuality: SpreadQuality;  // V1: always "Unknown" (no live spread feed)
  session: SessionName;
  // Underlying numbers, all 0-100 sub-scores
  components: MeatScoreBreakdown;
  // Diagnostics (raw numbers behind the scores — useful for the per-pair panel)
  diagnostics: {
    currentVolume: number | null;
    baselineVolume: number | null;
    volumeRatio: number | null;     // current / baseline
    bodyStrength: number | null;    // 0-1 (body / range)
    upperWickRatio: number | null;  // 0-1
    lowerWickRatio: number | null;  // 0-1
    candleRange: number | null;
    atr14: number | null;
    atrExpansionRatio: number | null; // range / atr
    candleCount: number;
    timeframe: string;              // "5min" | "15min"
  };
  // Reasons the score got pushed up or down — used for UI explainers
  reasons: string[];
  // Time the underlying data was sampled (ms epoch)
  postedAt: number;
  // True when we don't have enough candles yet (warming up)
  warming: boolean;
}
