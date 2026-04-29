// Shared shape for strategy detectors. Pulled out of strategies.ts so
// per-strategy modules in strategies/* can import the type without
// creating an import cycle.
export interface DetectedSetup {
  setupType: string;
  direction: "bullish" | "bearish";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  riskReward: number;
  confidenceScore: number;
  qualityGrade: string;
  explanation: string;
  invalidation: string;
  validHours: number;
  // Trade Thesis Monitor (Blueprint § 13). Optional — detectors that
  // don't supply them get sensible defaults at persist time so the
  // existing engines keep working without touching every file.
  originalThesis?: string;
  requiredConditions?: string[];
  invalidationConditions?: string[];
  // Free-form per-detection payload. Persisted as TradeSetup.metadataJson.
  // Triple Lock uses it for the 12-gate breakdown so the UI can render
  // the read-only checklist exactly as it stood at detection time.
  metadata?: unknown;
}
