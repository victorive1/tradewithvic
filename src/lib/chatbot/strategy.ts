// Structured Strategy Blueprint shape — what the LLM returns when the
// STRATEGY_BUILDER intent is hit. We force JSON output via the Messages API's
// output_config.format so the chat client receives a typed object it can
// render as a card, save to the user's strategy library, or convert into
// algo-bot config (future).

export interface StrategyTimeframes {
  bias: string;   // HTF for directional bias (e.g. "1H", "4H", "Daily")
  entry: string;  // execution timeframe (e.g. "5M", "15M")
}

export interface StrategyBlueprint {
  name: string;
  symbols: string[];           // e.g. ["XAUUSD"], or ["EURUSD","GBPUSD"]
  marketConditions: string;    // when this strategy works
  timeframes: StrategyTimeframes;
  entryRules: string[];        // each rule a self-contained sentence
  stopLossRules: string;
  takeProfitRules: string;
  riskRules: string;
  invalidationRules: string;
  newsFilter: string;
  sessionFilter: string;
  backtestingPlan: string;
  pseudocode: string;
  alertLogic: string;
}

// JSON Schema for the Messages API's structured-output mode. Constraints:
//   - additionalProperties: false on every object (required by the API).
//   - No min/max length, no numeric bounds — all fields are unconstrained
//     types. The LLM's prompt does the shaping.
//   - All fields required so we get a complete blueprint, not partial data.
export const STRATEGY_BLUEPRINT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short, distinctive strategy name (e.g. 'XAUUSD Asian Range Sweep' or 'EURUSD 1H Trend Pullback')" },
    symbols: {
      type: "array",
      items: { type: "string" },
      description: "Canonical symbols this strategy targets (e.g. ['XAUUSD'] or ['EURUSD','GBPUSD']). Use TradeWithVic platform notation: forex 6-letter codes, XAUUSD/XAGUSD for metals, USOIL for oil, BTCUSD/ETHUSD for crypto.",
    },
    marketConditions: { type: "string", description: "When this strategy is valid: trending vs ranging, post-news vs pre-news, high vs low volatility, session-specific behavior. 1–3 sentences." },
    timeframes: {
      type: "object",
      properties: {
        bias: { type: "string", description: "HTF for directional bias, e.g. '1H', '4H', 'Daily'." },
        entry: { type: "string", description: "Execution timeframe, e.g. '5M', '15M'." },
      },
      required: ["bias", "entry"],
      additionalProperties: false,
    },
    entryRules: {
      type: "array",
      items: { type: "string" },
      description: "List of concrete conditions that must ALL be true to enter. Each item is a single self-contained sentence. Aim for 4–8 rules — enough to be specific, not so many that the strategy never fires.",
    },
    stopLossRules: { type: "string", description: "How to place SL (e.g. 'beyond the structural high that swept liquidity, with an ATR-based buffer of 0.2×ATR(14)')." },
    takeProfitRules: { type: "string", description: "TP placement and management (e.g. 'TP1 at 1R partial close 50%, move SL to BE, run remainder to 2R or HTF supply')." },
    riskRules: { type: "string", description: "Risk per trade as % of account, max concurrent positions, daily loss cap." },
    invalidationRules: { type: "string", description: "What signals the setup is wrong before SL — for early bail-out (e.g. '15M close back below entry without continuation within 3 candles')." },
    newsFilter: { type: "string", description: "How to handle news risk (e.g. 'no entries within 30 min of high-impact USD events')." },
    sessionFilter: { type: "string", description: "Which sessions this strategy runs in (London, NY, Asia, overlap) and any specific time windows." },
    backtestingPlan: { type: "string", description: "How to backtest: timeframe, sample size, expected hit rate / R-multiple, what to track. 2–4 sentences." },
    pseudocode: { type: "string", description: "Plain-language pseudocode the trader could hand to a developer or convert to a TradingView Pine script. Use newlines for readability." },
    alertLogic: { type: "string", description: "TradingView-style alert condition or platform-Smart-Alerts equivalent description. One concise spec." },
  },
  required: [
    "name", "symbols", "marketConditions", "timeframes", "entryRules",
    "stopLossRules", "takeProfitRules", "riskRules", "invalidationRules",
    "newsFilter", "sessionFilter", "backtestingPlan", "pseudocode", "alertLogic",
  ],
  additionalProperties: false,
} as const;

// Type guard — does `x` look like a valid blueprint? Used after JSON.parse
// so we don't crash the chat on a malformed response.
export function isStrategyBlueprint(x: unknown): x is StrategyBlueprint {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.name === "string"
    && Array.isArray(o.symbols)
    && typeof o.marketConditions === "string"
    && typeof o.timeframes === "object" && o.timeframes !== null
    && typeof (o.timeframes as Record<string, unknown>).bias === "string"
    && typeof (o.timeframes as Record<string, unknown>).entry === "string"
    && Array.isArray(o.entryRules)
    && typeof o.stopLossRules === "string"
    && typeof o.takeProfitRules === "string"
    && typeof o.riskRules === "string"
    && typeof o.invalidationRules === "string"
    && typeof o.newsFilter === "string"
    && typeof o.sessionFilter === "string"
    && typeof o.backtestingPlan === "string"
    && typeof o.pseudocode === "string"
    && typeof o.alertLogic === "string"
  );
}
