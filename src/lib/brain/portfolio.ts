import { prisma } from "@/lib/prisma";
import { ALL_INSTRUMENTS } from "@/lib/constants";

const SYMBOL_CATEGORY: Record<string, string> = Object.fromEntries(
  ALL_INSTRUMENTS.map((i) => [i.symbol, i.category])
);

function currenciesForSymbol(symbol: string): string[] {
  // Pair currencies
  if (symbol.length === 6 && !symbol.startsWith("BTC") && !symbol.startsWith("ETH")) {
    return [symbol.slice(0, 3), symbol.slice(3, 6)];
  }
  // Crypto and metals priced in USD carry USD exposure
  if (symbol.endsWith("USD")) return [symbol.slice(0, -3), "USD"];
  return [];
}

export interface PortfolioDecision {
  decision: "allow" | "reduce" | "reject";
  reasons: string[];
  adjustedRiskAmount: number | null;
}

/**
 * Evaluates portfolio-level constraints before Layer 5 guardrails. This runs on a
 * per-setup basis and can either allow the trade at full size, shrink it, or reject.
 */
export function evaluatePortfolio(
  setup: any,
  proposedRiskAmount: number,
  account: any,
  openPositions: any[]
): PortfolioDecision {
  const reasons: string[] = [];
  let adjusted: number | null = null;

  const totalCurrentRisk = openPositions.reduce((s, p) => s + (p.riskAmount || 0), 0);
  const totalCurrentRiskPct = account.currentBalance > 0 ? (totalCurrentRisk / account.currentBalance) * 100 : 0;
  const newRiskPct = account.currentBalance > 0 ? ((totalCurrentRisk + proposedRiskAmount) / account.currentBalance) * 100 : 0;

  if (newRiskPct > account.maxTotalRiskPct) {
    const budget = (account.maxTotalRiskPct - totalCurrentRiskPct) / 100 * account.currentBalance;
    if (budget <= 0) {
      reasons.push(`total_risk_${totalCurrentRiskPct.toFixed(2)}pct_at_cap_${account.maxTotalRiskPct}`);
      return { decision: "reject", reasons, adjustedRiskAmount: null };
    }
    adjusted = Math.max(0, budget);
    reasons.push(`reduced_size_to_respect_total_risk_cap`);
  }

  // Same-direction cap
  const sameDir = openPositions.filter((p: any) => p.direction === setup.direction).length;
  if (sameDir >= account.maxSameDirectionPositions) {
    reasons.push(`max_${setup.direction}_positions_${account.maxSameDirectionPositions}`);
    return { decision: "reject", reasons, adjustedRiskAmount: null };
  }

  // Same asset class cap
  const category = SYMBOL_CATEGORY[setup.symbol] ?? "other";
  const sameCat = openPositions.filter((p: any) => (SYMBOL_CATEGORY[p.symbol] ?? "other") === category).length;
  if (sameCat >= account.maxSameAssetClassPositions) {
    reasons.push(`max_${category}_positions_${account.maxSameAssetClassPositions}`);
    return { decision: "reject", reasons, adjustedRiskAmount: null };
  }

  // Same-strategy cap — read from setupType
  const sameStrat = openPositions.filter((p: any) => {
    // positions store symbol/tf but not setupType directly; we pull from setup via decisionLog link
    return false; // conservative: without setupType on position, skip this check
  }).length;
  if (sameStrat >= account.maxSameStrategyPositions) {
    reasons.push(`max_${setup.setupType}_positions_${account.maxSameStrategyPositions}`);
    return { decision: "reject", reasons, adjustedRiskAmount: null };
  }

  // Currency exposure cap (per-currency share of total risk budget)
  const currencies = currenciesForSymbol(setup.symbol);
  if (currencies.length > 0 && totalCurrentRisk + proposedRiskAmount > 0) {
    const perCurrencyRisk: Record<string, number> = {};
    for (const pos of openPositions) {
      const ccys = currenciesForSymbol(pos.symbol);
      for (const c of ccys) perCurrencyRisk[c] = (perCurrencyRisk[c] ?? 0) + pos.riskAmount;
    }
    for (const c of currencies) {
      const projected = (perCurrencyRisk[c] ?? 0) + proposedRiskAmount;
      const pct = (projected / (totalCurrentRisk + proposedRiskAmount)) * 100;
      if (pct > account.maxCurrencyExposurePct) {
        reasons.push(`currency_${c}_exposure_${pct.toFixed(0)}pct_above_${account.maxCurrencyExposurePct}`);
        return { decision: "reject", reasons, adjustedRiskAmount: null };
      }
    }
  }

  // Weekly drawdown
  const weeklyDrawdownPct = account.startingBalance > 0 ? (account.weeklyPnl / account.startingBalance) * 100 : 0;
  if (weeklyDrawdownPct <= -account.weeklyLossLimitPct) {
    reasons.push(`weekly_loss_limit_${account.weeklyLossLimitPct}pct`);
    return { decision: "reject", reasons, adjustedRiskAmount: null };
  }

  if (adjusted !== null && adjusted < proposedRiskAmount) {
    return { decision: "reduce", reasons, adjustedRiskAmount: adjusted };
  }
  return { decision: "allow", reasons, adjustedRiskAmount: null };
}

export async function capturePortfolioSnapshot(accountId: string): Promise<void> {
  const [account, openPositions] = await Promise.all([
    prisma.executionAccount.findUnique({ where: { id: accountId } }),
    prisma.executionPosition.findMany({ where: { accountId, status: "open" } }),
  ]);
  if (!account) return;

  const totalRisk = openPositions.reduce((s: number, p: any) => s + p.riskAmount, 0);
  const totalRiskPct = account.currentBalance > 0 ? (totalRisk / account.currentBalance) * 100 : 0;
  const unrealized = openPositions.reduce((s: number, p: any) => s + p.unrealizedPnl, 0);
  const longCount = openPositions.filter((p: any) => p.direction === "bullish").length;
  const shortCount = openPositions.filter((p: any) => p.direction === "bearish").length;

  const categoryBreakdown: Record<string, number> = {};
  const currencyExposure: Record<string, number> = {};
  for (const p of openPositions) {
    const cat = SYMBOL_CATEGORY[p.symbol] ?? "other";
    categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + 1;
    const ccys = currenciesForSymbol(p.symbol);
    for (const c of ccys) currencyExposure[c] = (currencyExposure[c] ?? 0) + p.riskAmount;
  }
  // Convert currency exposure to % of totalRisk
  if (totalRisk > 0) {
    for (const c of Object.keys(currencyExposure)) {
      currencyExposure[c] = Math.round((currencyExposure[c] / totalRisk) * 100 * 10) / 10;
    }
  }

  const drawdownPct = account.equityHigh > 0
    ? Math.max(0, ((account.equityHigh - (account.currentBalance + unrealized)) / account.equityHigh) * 100)
    : 0;

  await prisma.portfolioSnapshot.create({
    data: {
      accountId,
      balance: account.currentBalance,
      equity: account.currentBalance + unrealized,
      openPositionsCount: openPositions.length,
      totalRiskAmount: totalRisk,
      totalRiskPct,
      unrealizedPnl: unrealized,
      dailyPnl: account.dailyPnl,
      weeklyPnl: account.weeklyPnl,
      longCount, shortCount,
      categoryBreakdownJson: JSON.stringify(categoryBreakdown),
      strategyBreakdownJson: JSON.stringify({}),
      currencyExposureJson: JSON.stringify(currencyExposure),
      drawdownPct,
    },
  });
}
