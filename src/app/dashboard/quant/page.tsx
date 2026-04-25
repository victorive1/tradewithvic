import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { computeOneR } from "@/lib/setups/one-r";
import { LiveRefresh } from "@/components/dashboard/LiveRefresh";

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
];

const QUANT_KEYS = QUANT_STRATEGIES.map((s) => s.key);

interface SetupRow {
  id: string;
  symbol: string;
  direction: string;
  setupType: string;
  timeframe: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  riskReward: number;
  confidenceScore: number;
  qualityGrade: string;
  explanation: string | null;
  invalidation: string | null;
  validUntil: Date | null;
  createdAt: Date;
}

export default async function QuantPage() {
  const setups = (await prisma.tradeSetup.findMany({
    where: {
      status: "active",
      setupType: { in: QUANT_KEYS },
    },
    orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
    take: 50,
  })) as SetupRow[];

  const counts = QUANT_STRATEGIES.map((s) => ({
    ...s,
    count: setups.filter((row) => row.setupType === s.key).length,
  }));

  const aGradeCount = setups.filter((s) => s.qualityGrade === "A+" || s.qualityGrade === "A").length;

  return (
    <div className="page-container space-y-5">
      <LiveRefresh serverTimestamp={Date.now()} intervalMs={120_000} />

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
        {setups.length === 0 ? (
          <div className="glass-card p-10 text-center space-y-3">
            <div className="text-3xl opacity-40">∅</div>
            <p className="text-fluid-sm text-muted">
              No active Quant setups right now. The brain scans every 2 minutes;
              setups appear here when a Blueprint-tier strategy detects a valid
              pattern in the live candle stream.
            </p>
            <p className="text-[11px] text-muted-light max-w-lg mx-auto">
              The Inverse FVG engine is the first one wired up — Order Block,
              Breaker Block, and FVG Continuation engines are on the build queue.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {setups.map((s) => <QuantSetupCard key={s.id} setup={s} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function QuantSetupCard({ setup }: { setup: SetupRow }) {
  const isLong = setup.direction === "bullish" || setup.direction === "long" || setup.direction === "buy";
  const grade = setup.qualityGrade;
  const gradeClass =
    grade === "A+" ? "bg-bull/15 text-bull-light border-bull/40" :
    grade === "A" ? "bg-bull/10 text-bull-light border-bull/30" :
    grade === "B" ? "bg-warn/10 text-warn-light border-warn/30" :
    "bg-surface-2 text-muted border-border/40";
  const oneR = computeOneR(setup.entry, setup.stopLoss, setup.direction);
  const strategyLabel = QUANT_STRATEGIES.find((q) => q.key === setup.setupType)?.label ?? setup.setupType.replace(/_/g, " ");

  return (
    <Link
      href={`/dashboard/brain/decision/${setup.id}`}
      className="glass-card glass-card-hover overflow-hidden block"
    >
      <div className={cn("h-1", isLong ? "bg-bull" : "bg-bear")} />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-sm">{setup.symbol}</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-2 text-muted">
              {setup.timeframe}
            </span>
            <span className={cn(
              "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded",
              isLong ? "text-bull-light" : "text-bear-light",
            )}>
              {isLong ? "▲ LONG" : "▼ SHORT"}
            </span>
          </div>
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", gradeClass)}>
            {grade}
          </span>
        </div>

        <div className="text-[11px] uppercase tracking-wider text-accent-light font-semibold">
          {strategyLabel}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono">
          <div className="flex justify-between"><span className="text-muted">Entry</span><span>{setup.entry.toFixed(5)}</span></div>
          <div className="flex justify-between"><span className="text-muted">SL</span><span className="text-bear-light">{setup.stopLoss.toFixed(5)}</span></div>
          <div className="flex justify-between"><span className="text-muted">1R</span><span className="text-blue-300">{oneR.toFixed(5)}</span></div>
          <div className="flex justify-between"><span className="text-muted">TP1</span><span className="text-green-400">{setup.takeProfit1.toFixed(5)}</span></div>
          {setup.takeProfit2 != null && (
            <div className="flex justify-between"><span className="text-muted">TP2</span><span className="text-green-400/80">{setup.takeProfit2.toFixed(5)}</span></div>
          )}
          {setup.takeProfit3 != null && (
            <div className="flex justify-between"><span className="text-muted">TP3</span><span className="text-green-400/60">{setup.takeProfit3.toFixed(5)}</span></div>
          )}
          <div className="flex justify-between col-span-2 border-t border-border/30 pt-1 mt-1">
            <span className="text-muted">RR · Score</span>
            <span>{setup.riskReward.toFixed(2)}× · {setup.confidenceScore}/100</span>
          </div>
        </div>

        {setup.explanation && (
          <p className="text-[11px] text-muted-light leading-relaxed">{setup.explanation}</p>
        )}
        {setup.invalidation && (
          <p className="text-[10px] text-muted">
            <span className="uppercase tracking-wider text-[9px]">Invalidated if:</span> {setup.invalidation}
          </p>
        )}
      </div>
    </Link>
  );
}
