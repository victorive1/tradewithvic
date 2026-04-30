// Shared types for Mini detector templates. Each template is a pure
// async function: takes a fully-prepared MiniContext, returns a
// DetectedMiniSetup or null. The orchestrator (mini-scan.ts) builds
// the context once per (symbol, scan cycle) and runs every template
// against it.

import type { CandleRow } from "@/lib/brain/strategies/eps-scoring";
import type { IntradayBias } from "@/lib/mini/bias";
import type { MiniGate, MiniScoreInputs } from "@/lib/mini/scoring";

export interface MiniContext {
  symbol: string;
  instrumentId: string;
  bias: IntradayBias;
  // Multi-timeframe candles already loaded. 5m most recent = ctx.candles5m.at(-1).
  candles5m: CandleRow[];
  candles15m: CandleRow[];
  candles1h: CandleRow[];
  // ATR per TF, used by SL/TP buffers and volatility scoring.
  atr5m: number | null;
  atr15m: number | null;
  atr1h: number | null;
  // Existing brain rows the Mini engine reuses as primary inputs.
  recentSweeps: Array<{
    detectedAt: Date;
    sweepCandleTime?: Date;
    sweepDirection?: string;
    sweepHigh?: number;
    sweepLow?: number;
    sweepClose?: number;
    levelType?: string;
    levelPrice?: number;
    reversalStrength?: number;
  }>;
  activeLevels: Array<{ levelType: string; price: number; side?: string | null }>;
  structureEvents15m: { lastEventType?: string | null; lastEventAt?: Date | null } | null;
  structureEvents5m:  { lastEventType?: string | null; lastEventAt?: Date | null } | null;
}

export interface DetectedMiniSetup {
  template: string;                 // mini setup template id
  direction: "bullish" | "bearish";
  entryTimeframe: "5m" | "15m" | "1h";
  speedClass: "scalp_5m" | "intraday_15m" | "intraday_1h";

  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  riskReward: number;

  entryType: "market" | "retest" | "breakout" | "confirmation" | "no_entry";
  expectedHoldMinutes: number;
  validityMinutes: number;          // signal expires this many minutes after creation

  components: MiniScoreInputs;
  gates: MiniGate[];

  explanation: string;
  invalidation: string;
}
