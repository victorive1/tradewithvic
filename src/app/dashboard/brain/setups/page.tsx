import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import Link from "next/link";
import { RefreshButton } from "../RefreshButton";
import { BrainTabs } from "../BrainTabs";
import { ManualTickets } from "../ManualTickets";
import { ActiveSetupsFilter } from "../ActiveSetupsFilter";
import { LiveRefresh } from "@/components/dashboard/LiveRefresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function timeAgo(date: Date): string {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function BrainSetupsPage() {
  const renderedAt = Date.now();

  const [openPositions, activeSetups, activeSetupsCount] = await Promise.all([
    prisma.executionPosition.findMany({
      where: { status: "open" },
      orderBy: { openedAt: "desc" },
      take: 20,
    }),
    prisma.tradeSetup.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.tradeSetup.count({ where: { status: "active" } }),
  ]);

  const totalUnrealizedPnl = openPositions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0);
  const totalRiskAtOpen = openPositions.reduce((sum, p) => sum + (p.riskAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market Core Brain</h1>
          <p className="text-sm text-muted mt-1">
            Trade setups, open positions, and manual tickets — pulled live from the Brain's own tables.
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <LiveRefresh serverTimestamp={renderedAt} />
          <Link
            href="/dashboard/brain/performance"
            className="text-sm text-muted hover:text-foreground underline underline-offset-4"
          >
            Performance →
          </Link>
          <Suspense fallback={null}>
            <RefreshButton />
          </Suspense>
        </div>
      </div>

      <BrainTabs setupsCount={activeSetupsCount} />

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Open Positions
            <span className="ml-2 text-xs font-normal text-muted normal-case">
              · algo
              {openPositions.length > 0 && ` · ${openPositions.length} live`}
            </span>
          </h2>
          {openPositions.length > 0 && (
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-muted uppercase tracking-wide">Unrealized</span>
                <span className={`ml-2 font-mono font-semibold ${totalUnrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {totalUnrealizedPnl >= 0 ? "+" : ""}${totalUnrealizedPnl.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-muted uppercase tracking-wide">Risk @ open</span>
                <span className="ml-2 font-mono text-foreground">${totalRiskAtOpen.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
        {openPositions.length === 0 ? (
          <p className="text-sm text-muted">
            No positions open. When the brain fills a setup, it will appear here with live PnL, MFE/MAE, and thesis state.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {openPositions.map((p) => {
              const isLong = p.direction === "long" || p.direction === "bullish" || p.direction === "buy";
              const pnl = p.unrealizedPnl ?? 0;
              const pnlClass = pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : "text-muted";
              const thesisClass =
                p.thesisState === "strong" ? "bg-green-500/10 text-green-400 border-green-500/30"
                  : p.thesisState === "weakening" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                    : p.thesisState === "damaged" ? "bg-orange-500/10 text-orange-400 border-orange-500/30"
                      : "bg-red-500/10 text-red-400 border-red-500/30";
              const gradeClass = p.grade === "A+" ? "bg-purple-500/15 text-purple-300 border-purple-500/40"
                : p.grade === "A" ? "bg-green-500/15 text-green-400 border-green-500/40"
                  : p.grade === "B" ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                    : "bg-muted/10 text-muted border-border";
              const priceDigits = p.entry > 100 ? 2 : 5;
              return (
                <div key={p.id} className="rounded-lg border border-border bg-background/30 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${isLong ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                        {isLong ? "▲ LONG" : "▼ SHORT"}
                      </span>
                      <span className="font-mono text-sm font-semibold truncate">{p.symbol}</span>
                      <span className="text-[10px] text-muted">{p.timeframe}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${gradeClass}`}>{p.grade}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono">
                    <div className="flex justify-between"><span className="text-muted">Entry</span><span>{p.entry.toFixed(priceDigits)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">SL</span><span className={p.movedToBreakeven ? "text-blue-400" : "text-red-400"}>{p.stopLoss.toFixed(priceDigits)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">TP1</span><span className={p.tp1Hit ? "text-green-400/50 line-through" : "text-green-400"}>{p.takeProfit1.toFixed(priceDigits)}</span></div>
                    {p.takeProfit2 != null && (
                      <div className="flex justify-between"><span className="text-muted">TP2</span><span className={p.tp2Hit ? "text-green-400/50 line-through" : "text-green-400"}>{p.takeProfit2.toFixed(priceDigits)}</span></div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${thesisClass}`}>
                        {p.thesisState}
                      </span>
                      <span className="text-muted font-mono">{p.thesisScore}</span>
                    </div>
                    <div className={`font-mono font-semibold ${pnlClass}`}>
                      {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted font-mono">
                    <span>{timeAgo(p.openedAt)}</span>
                    <span>MFE ${p.mfe.toFixed(2)} · MAE ${p.mae.toFixed(2)}</span>
                  </div>
                  {p.closedPct > 0 && (
                    <div className="h-1 rounded-full bg-border/40 overflow-hidden">
                      <div className="h-full bg-green-500/60" style={{ width: `${Math.min(100, p.closedPct)}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ManualTickets />

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
          Active Trade Setups
        </h2>
        <ActiveSetupsFilter
          setups={activeSetups.map((s) => ({
            id: s.id,
            symbol: s.symbol,
            timeframe: s.timeframe,
            direction: s.direction,
            setupType: s.setupType,
            qualityGrade: s.qualityGrade,
            entry: s.entry,
            stopLoss: s.stopLoss,
            takeProfit1: s.takeProfit1,
            riskReward: s.riskReward,
            confidenceScore: s.confidenceScore,
          }))}
        />
      </section>
    </div>
  );
}
