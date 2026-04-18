/**
 * Order-ticket validation (spec §9). Runs before submit to catch bad tickets
 * before they hit the broker adapter. Returns the first blocking error, plus
 * a list of non-blocking warnings the UI can show in the preview.
 */

export interface OrderTicket {
  accountId: string;
  internalSymbol: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop" | "stop_limit";
  requestedVolume: number;
  sizingMode: "fixed_lots" | "risk_percent";
  riskPercent?: number;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  timeInForce?: "gtc" | "day" | "ioc" | "fok";
  slippagePips?: number | null;
  currentPrice?: number | null;   // latest mark, for market-order sanity checks
  accountBalance?: number | null; // for risk-percent sizing sanity
}

export interface ValidationRule {
  digits?: number | null;
  minVolume?: number | null;
  maxVolume?: number | null;
  volumeStep?: number | null;
  minStopPips?: number | null;    // broker minimum stop distance
}

export interface ValidationReport {
  ok: boolean;
  error: string | null;
  warnings: string[];
}

export function validateOrderTicket(t: OrderTicket, rule: ValidationRule = {}): ValidationReport {
  const warnings: string[] = [];

  if (!t.accountId) return fail("Select a linked trading account first.");
  if (!t.internalSymbol) return fail("Symbol is required.");
  if (t.side !== "buy" && t.side !== "sell") return fail("Direction must be Buy or Sell.");
  if (!t.orderType) return fail("Order type is required.");

  // Volume checks
  if (!Number.isFinite(t.requestedVolume) || t.requestedVolume <= 0) {
    return fail("Lot size must be a positive number.");
  }
  if (rule.minVolume && t.requestedVolume < rule.minVolume) {
    return fail(`Lot size is below broker minimum (${rule.minVolume}).`);
  }
  if (rule.maxVolume && t.requestedVolume > rule.maxVolume) {
    return fail(`Lot size exceeds broker maximum (${rule.maxVolume}).`);
  }
  if (rule.volumeStep) {
    const remainder = (t.requestedVolume / rule.volumeStep) % 1;
    if (Math.abs(remainder) > 1e-6 && Math.abs(remainder - 1) > 1e-6) {
      warnings.push(`Lot size is not an exact multiple of broker step (${rule.volumeStep}); the broker may round it.`);
    }
  }

  // Risk-percent sizing sanity
  if (t.sizingMode === "risk_percent") {
    if (t.riskPercent == null || t.riskPercent <= 0) {
      return fail("Risk % must be greater than zero in risk-based sizing.");
    }
    if (t.riskPercent > 5) {
      warnings.push(`Risk per trade is ${t.riskPercent.toFixed(2)}% — well above the 1–2% bracket most professional risk managers recommend.`);
    }
    if (!t.accountBalance || t.accountBalance <= 0) {
      warnings.push("Account balance unknown — risk-percent sizing may be inaccurate until the account syncs.");
    }
    if (!t.stopLoss) {
      return fail("Stop loss is required for risk-percent sizing.");
    }
  }

  // Pending order sanity
  if (t.orderType !== "market") {
    if (t.entryPrice == null || !Number.isFinite(t.entryPrice) || t.entryPrice <= 0) {
      return fail("Entry price is required for pending orders.");
    }
    if (t.currentPrice && t.entryPrice) {
      const driftPct = Math.abs(t.entryPrice - t.currentPrice) / t.currentPrice;
      if (driftPct > 0.1) {
        warnings.push(`Entry is ${(driftPct * 100).toFixed(1)}% away from current price — confirm this is intentional.`);
      }
    }
    if (t.orderType === "limit") {
      if (t.side === "buy" && t.currentPrice && t.entryPrice && t.entryPrice > t.currentPrice) {
        warnings.push("Buy-limit entry is above market — usually placed below.");
      }
      if (t.side === "sell" && t.currentPrice && t.entryPrice && t.entryPrice < t.currentPrice) {
        warnings.push("Sell-limit entry is below market — usually placed above.");
      }
    }
    if (t.orderType === "stop") {
      if (t.side === "buy" && t.currentPrice && t.entryPrice && t.entryPrice < t.currentPrice) {
        warnings.push("Buy-stop entry is below market — usually placed above.");
      }
      if (t.side === "sell" && t.currentPrice && t.entryPrice && t.entryPrice > t.currentPrice) {
        warnings.push("Sell-stop entry is above market — usually placed below.");
      }
    }
  }

  // Stop / target geometry
  const entryRef = t.orderType === "market" ? (t.currentPrice ?? 0) : (t.entryPrice ?? 0);
  if (entryRef > 0) {
    if (t.stopLoss != null && t.stopLoss > 0) {
      if (t.side === "buy" && t.stopLoss >= entryRef) {
        return fail("Stop loss must be below entry for a buy.");
      }
      if (t.side === "sell" && t.stopLoss <= entryRef) {
        return fail("Stop loss must be above entry for a sell.");
      }
    }
    if (t.takeProfit != null && t.takeProfit > 0) {
      if (t.side === "buy" && t.takeProfit <= entryRef) {
        return fail("Take profit must be above entry for a buy.");
      }
      if (t.side === "sell" && t.takeProfit >= entryRef) {
        return fail("Take profit must be below entry for a sell.");
      }
    }
    // R:R sanity
    if (t.stopLoss != null && t.takeProfit != null && t.stopLoss > 0 && t.takeProfit > 0) {
      const risk = Math.abs(entryRef - t.stopLoss);
      const reward = Math.abs(t.takeProfit - entryRef);
      if (risk > 0) {
        const rr = reward / risk;
        if (rr < 1) warnings.push(`Risk/reward is ${rr.toFixed(2)}R — reward is smaller than risk.`);
      }
    }
  }

  // Slippage sanity for market orders
  if (t.orderType === "market" && t.slippagePips != null && t.slippagePips > 30) {
    warnings.push(`Slippage tolerance ${t.slippagePips} pips is unusually wide — you may fill well away from the current mark.`);
  }

  return { ok: true, error: null, warnings };
}

function fail(msg: string): ValidationReport {
  return { ok: false, error: msg, warnings: [] };
}

/**
 * Risk-based volume calculation. Returns lots given account balance, risk %,
 * stop distance in price, and contract size.
 */
export function calcVolumeFromRisk(params: {
  accountBalance: number;
  riskPercent: number;
  entryPrice: number;
  stopPrice: number;
  contractSize: number;
  volumeStep?: number;
}): number {
  const stopDistance = Math.abs(params.entryPrice - params.stopPrice);
  if (stopDistance <= 0) return 0;
  const riskCurrency = params.accountBalance * (params.riskPercent / 100);
  // FX simplification: for non-USD-quote pairs this is approximate until we price-convert.
  const lots = riskCurrency / (stopDistance * params.contractSize);
  if (params.volumeStep && params.volumeStep > 0) {
    return Math.max(params.volumeStep, Math.round(lots / params.volumeStep) * params.volumeStep);
  }
  return Math.max(0.01, Math.round(lots * 100) / 100);
}
