import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { LiveRefresh } from "@/components/dashboard/LiveRefresh";
import { QuantSetupGrid, type SetupRow } from "./QuantSetupGrid";
import { AdminRiskTargetBar } from "@/components/admin/AdminRiskTarget";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Strategies that come from the FX Wonders Quant Engine Blueprint —
// each one ships through the existing TradeSetup pipeline with its
// own setupType. Add new entries here as more strategy engines land
// (Order Block, Breaker Block, FVG Continuation, Supply/Demand, etc.).
const QUANT_STRATEGIES: Array<{ key: string; label: string; description: string }> = [
  {
    key: "inverse_fvg",
    label: "Inverse FVG",
    description: "Bullish FVG violated, retested as resistance, rejected. Or the bearish mirror.",
  },
  {
    key: "order_block",
    label: "Order Block",
    description: "Last opposing candle before a strong displacement break, retested for institutional defence.",
  },
  {
    key: "breaker_block",
    label: "Breaker Block",
    description: "Failed order block — broken through and retested as flipped support/resistance.",
  },
  {
    key: "fvg_continuation",
    label: "FVG Continuation",
    description: "Original FVG respected on retest — continuation entry on the defended imbalance.",
  },
];

const QUANT_KEYS = QUANT_STRATEGIES.map((s) => s.key);

export default async function QuantPage() {
  const setups = (await prisma.tradeSetup.findMany({
    where: {
      status: "active",
      setupType: { in: QUANT_KEYS },
    },
    orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      symbol: true,
      direction: true,
      setupType: true,
      timeframe: true,
      entry: true,
      stopLoss: true,
      takeProfit1: true,
      takeProfit2: true,
      takeProfit3: true,
      riskReward: true,
      confidenceScore: true,
      qualityGrade: true,
      explanation: true,
      invalidation: true,
    },
  })) as SetupRow[];

  const counts = QUANT_STRATEGIES.map((s) => ({
    ...s,
    count: setups.filter((row) => row.setupType === s.key).length,
  }));

  const aGradeCount = setups.filter((s) => s.qualityGrade === "A+" || s.qualityGrade === "A").length;

  return (
    <div className="page-container space-y-5">
      <LiveRefresh serverTimestamp={Date.now()} intervalMs={120_000} />

      <AdminRiskTargetBar />

      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-fluid-3xl font-bold">Quant Signals</h1>
          <p className="text-fluid-sm text-muted-light mt-1">
            FX Wonders Quant Engine — institutional-grade setups from the strategy
            engines (Blueprint § 7). Every setup is scored 0-100 with the §
            9 weights; A+/A grades pass to the algo runtime by default.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted">Active A/A+</div>
          <div className="text-2xl font-bold text-bull-light">{aGradeCount}</div>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {counts.map((s) => (
          <div key={s.key} className="glass-card p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-foreground">{s.label}</h3>
              <span className={cn(
                "text-xs font-mono font-bold px-2 py-0.5 rounded",
                s.count > 0 ? "bg-accent/15 text-accent-light" : "bg-surface-2 text-muted",
              )}>
                {s.count}
              </span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">{s.description}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Live Quant Setups</h2>
        <QuantSetupGrid
          setups={setups}
          strategies={QUANT_STRATEGIES.map(({ key, label }) => ({ key, label }))}
        />
      </section>
    </div>
  );
}
