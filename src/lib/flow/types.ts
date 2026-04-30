// Shared types for the Retail vs Institution / FlowVision engine.
//
// FlowContext is built once per (symbol, scan cycle) and passed to each
// of the modules: retail sentiment → institutional flow → liquidity map
// → trap detector → flow prediction. Each module enriches a partial
// FlowResult; the orchestrator merges them and persists a FlowSnapshot.

import type { CandleRow } from "@/lib/brain/strategies/eps-scoring";
import type { VwapAnalysis } from "@/lib/mini/vwap";
import type { SessionState } from "@/lib/mini/session";

export interface FlowContext {
  symbol: string;
  instrumentId: string;
  candles5m: CandleRow[];
  candles15m: CandleRow[];
  candles1h: CandleRow[];
  candles4h: CandleRow[];
  atr5m: number | null;
  atr15m: number | null;
  atr1h: number | null;
  vwap: VwapAnalysis;
  session: SessionState;
  // Existing brain inputs the FlowVision engine reuses.
  recentSweeps: Array<{
    detectedAt: Date;
    sweepDirection?: string;
    sweepHigh?: number;
    sweepLow?: number;
    sweepClose?: number;
    levelType?: string;
    levelPrice?: number;
    reversalStrength?: number;
  }>;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  structure1h:  { bias?: string | null; lastEventType?: string | null } | null;
  structure15m: { bias?: string | null; lastEventType?: string | null } | null;
  structure5m:  { bias?: string | null; lastEventType?: string | null } | null;
}

export interface RetailFlowResult {
  longPct: number | null;
  shortPct: number | null;
  crowding: "long_heavy" | "short_heavy" | "balanced" | "unavailable";
  source: "myfxbook" | "stub" | "unavailable";
  buyScore: number;   // 0-100
  sellScore: number;  // 0-100
}

export interface InstitutionalFlowResult {
  buyScore: number;             // 0-100
  sellScore: number;            // 0-100
  syntheticCvd: number | null;
  vwapPosition: number | null;  // close - vwap, ATR-normalised
  vwapSlope: number | null;
  volumeZScore: number | null;
  oiChange: number | null;      // null until futures data wired
  cotNet: number | null;        // null until COT cron wired
  reasons: string[];
}

export interface DetectedZone {
  zoneType: string;
  direction: "bullish" | "bearish" | null;
  priceLow: number;
  priceHigh: number;
  strengthScore: number;
  formedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface LiquidityMapResult {
  zones: DetectedZone[];
  // Closest opposing-side liquidity above and below current price — used
  // by the prediction module to set targetLiquidity.
  nearestAbove: number | null;
  nearestBelow: number | null;
}

export interface TrapResult {
  trapScore: number;            // 0-100
  trapType: "bull_trap" | "bear_trap" | "neutral";
  reasons: string[];
}

export interface FlowPrediction {
  finalBias: "bullish" | "bearish" | "neutral";
  confidence: number;           // 0-100
  invalidation: number | null;
  targetLiquidity: number | null;
  expectedHoldMinutes: number;
  narrative: string;
  reasons: Array<{ component: string; weight: number; evidence: string }>;
}
