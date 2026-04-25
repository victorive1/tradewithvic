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
}
