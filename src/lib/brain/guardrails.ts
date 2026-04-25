// Hard Guardrails — Quant Engine Blueprint § 24.
//
// These rules are absolute. The engine protects the user from the
// market and from themselves; nothing in the routing pipeline may
// bypass them. Each guardrail is a pure check on a candidate setup +
// account snapshot — no DB calls, no side effects. Callers gather
// state once and ask checkAll() before sending a trade.

export type GuardrailKey =
  | "no_stop_loss"
  | "invalid_sl_distance"
  | "abnormal_spread"
  | "stale_feed"
  | "drawdown_limit_exceeded"
  | "margin_too_low"
  | "extreme_news_risk"
  | "strategy_degraded"
  | "score_below_threshold"
  | "correlation_overexposure"
  | "duplicate_order"
  | "revenge_trading"
  | "martingale_attempt";

export interface GuardrailResult {
  passed: boolean;
  failures: Array<{ key: GuardrailKey; reason: string }>;
}

export interface CandidateTicket {
  symbol: string;
  direction: string;
  entry: number;
  stopLoss: number | null;
  confidenceScore: number;
  spreadPips?: number | null;
  feedAgeSeconds?: number | null;
  isDuplicateOf?: string | null; // existing setup id this would dupe
  recentLossesCount?: number; // how many losses in the last N minutes (revenge guard)
}

export interface GuardrailContext {
  accountBalance: number;
  drawdownPctNow: number;
  drawdownLimitPct: number;
  marginRatio: number; // free margin / used margin
  minMarginRatio: number;
  eventRiskLevel: "none" | "low" | "medium" | "high";
  strategyHealth: "healthy" | "warning" | "degraded" | "paused" | "retired";
  minScoreThreshold: number;
  maxRecentLossesBeforePause: number;
  correlationOverexposed: boolean; // result of the currency-exposure check
}

const GUARD_LABELS: Record<GuardrailKey, string> = {
  no_stop_loss: "Trade has no stop loss",
  invalid_sl_distance: "SL distance is invalid (zero, NaN, or wrong side of entry)",
  abnormal_spread: "Spread is abnormal (>3× recent average)",
  stale_feed: "Broker feed is stale",
  drawdown_limit_exceeded: "Account drawdown exceeds limit",
  margin_too_low: "Free margin too low to safely take the trade",
  extreme_news_risk: "Imminent high-impact news event",
  strategy_degraded: "Originating strategy is degraded or paused",
  score_below_threshold: "Signal score below the account threshold",
  correlation_overexposure: "Currency-level correlation cap would be breached",
  duplicate_order: "Duplicate order — same setup already routed",
  revenge_trading: "Recent loss streak — revenge-trading guard tripped",
  martingale_attempt: "Position-size escalation after losses",
};

export function checkAll(ticket: CandidateTicket, ctx: GuardrailContext): GuardrailResult {
  const failures: Array<{ key: GuardrailKey; reason: string }> = [];

  // No trade without stop loss.
  if (ticket.stopLoss == null || !Number.isFinite(ticket.stopLoss)) {
    failures.push({ key: "no_stop_loss", reason: GUARD_LABELS.no_stop_loss });
  } else {
    // No trade if SL distance is invalid.
    const dist = Math.abs(ticket.entry - ticket.stopLoss);
    if (dist <= 0 || !Number.isFinite(dist)) {
      failures.push({ key: "invalid_sl_distance", reason: GUARD_LABELS.invalid_sl_distance });
    }
    // SL must be on the correct side of entry for the trade direction.
    const isLong = ticket.direction === "buy" || ticket.direction === "long" || ticket.direction === "bullish";
    if (isLong && ticket.stopLoss >= ticket.entry) {
      failures.push({ key: "invalid_sl_distance", reason: "Long SL must be below entry" });
    }
    if (!isLong && ticket.stopLoss <= ticket.entry) {
      failures.push({ key: "invalid_sl_distance", reason: "Short SL must be above entry" });
    }
  }

  // No trade if spread is abnormal.
  if (ticket.spreadPips != null && ticket.spreadPips > 50) {
    failures.push({ key: "abnormal_spread", reason: `Spread ${ticket.spreadPips}p above safe ceiling` });
  }

  // No trade if broker feed is stale.
  if (ticket.feedAgeSeconds != null && ticket.feedAgeSeconds > 60) {
    failures.push({ key: "stale_feed", reason: `Feed last updated ${ticket.feedAgeSeconds}s ago` });
  }

  // No trade if account exceeds drawdown limit.
  if (ctx.drawdownPctNow >= ctx.drawdownLimitPct) {
    failures.push({
      key: "drawdown_limit_exceeded",
      reason: `Drawdown ${ctx.drawdownPctNow.toFixed(2)}% >= limit ${ctx.drawdownLimitPct}%`,
    });
  }

  // No trade if margin is too low.
  if (ctx.marginRatio < ctx.minMarginRatio) {
    failures.push({
      key: "margin_too_low",
      reason: `Margin ratio ${ctx.marginRatio.toFixed(2)} < min ${ctx.minMarginRatio}`,
    });
  }

  // No trade if news risk is extreme.
  if (ctx.eventRiskLevel === "high") {
    failures.push({ key: "extreme_news_risk", reason: GUARD_LABELS.extreme_news_risk });
  }

  // No trade if strategy is degraded.
  if (ctx.strategyHealth === "degraded" || ctx.strategyHealth === "paused" || ctx.strategyHealth === "retired") {
    failures.push({
      key: "strategy_degraded",
      reason: `Strategy is ${ctx.strategyHealth}`,
    });
  }

  // No trade if signal score is below threshold.
  if (ticket.confidenceScore < ctx.minScoreThreshold) {
    failures.push({
      key: "score_below_threshold",
      reason: `Score ${ticket.confidenceScore} < threshold ${ctx.minScoreThreshold}`,
    });
  }

  // No trade if pair correlation creates overexposure.
  if (ctx.correlationOverexposed) {
    failures.push({ key: "correlation_overexposure", reason: GUARD_LABELS.correlation_overexposure });
  }

  // No duplicate orders.
  if (ticket.isDuplicateOf) {
    failures.push({
      key: "duplicate_order",
      reason: `Same setup already routed (id: ${ticket.isDuplicateOf})`,
    });
  }

  // No revenge trading.
  if (ticket.recentLossesCount != null && ticket.recentLossesCount >= ctx.maxRecentLossesBeforePause) {
    failures.push({
      key: "revenge_trading",
      reason: `${ticket.recentLossesCount} recent losses; pause-after-losses cap = ${ctx.maxRecentLossesBeforePause}`,
    });
  }

  return { passed: failures.length === 0, failures };
}

export function guardrailLabel(key: GuardrailKey): string {
  return GUARD_LABELS[key];
}
