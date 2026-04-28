"use client";

import { useState } from "react";
import { cn, formatPrice } from "@/lib/utils";
import type { TradeSetup } from "@/lib/setup-engine";
import { AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { computeOneR } from "@/lib/setups/one-r";
import { isBullishDirection } from "@/lib/setups/direction";

export function SetupCard({ setup, justUpdated = false }: { setup: TradeSetup; justUpdated?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = isBullishDirection(setup.direction);

  return (
    <div className={cn(
      "glass-card glass-card-hover overflow-hidden transition-all duration-300",
      // Subtle ring + glow when this card's score/grade changed in the
      // last refresh — fades out on its own after ~8s via the hook so it
      // doesn't get noisy.
      justUpdated && "ring-2 ring-accent/40 shadow-lg shadow-accent/10",
    )}>
      {/* Top color bar */}
      <div className={cn("h-1", isBuy ? "bg-bull" : "bg-bear")} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-foreground">{setup.displayName}</h3>
            <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full uppercase", isBuy ? "badge-bull" : "badge-bear")}>
              {isBuy ? "long" : "short"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded",
              setup.qualityGrade.startsWith("A") ? "bg-bull/10 text-bull-light" : "bg-warn/10 text-warn"
            )}>
              {setup.qualityGrade}
            </span>
            <span className="text-xs text-accent-light font-mono">{setup.confidenceScore}%</span>
          </div>
        </div>

        {/* Setup info */}
        <div className="flex items-center gap-3 mb-4 text-xs text-muted">
          <span className="bg-surface-2 px-2 py-1 rounded">{setup.timeframe}</span>
          <span className="bg-surface-2 px-2 py-1 rounded">{setup.setupType}</span>
          <span className="capitalize bg-surface-2 px-2 py-1 rounded">{setup.category}</span>
        </div>

        {/* Trade levels */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Entry</div>
            <div className="text-sm font-bold text-foreground">{setup.entry}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-bear-light uppercase tracking-wider mb-1">Stop</div>
            <div className="text-sm font-bold text-bear-light">{setup.stopLoss}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-bull-light uppercase tracking-wider mb-1">TP1</div>
            <div className="text-sm font-bold text-bull-light">{setup.takeProfit1}</div>
          </div>
        </div>

        {/* 1R Target — added layer, doesn't replace TP1/2/3 */}
        <div className="flex items-center justify-between text-[11px] mb-3 px-1">
          <span className="text-muted uppercase tracking-wider">1R Target</span>
          <span className="font-mono text-accent-light">
            {formatPrice(computeOneR(setup.entry, setup.stopLoss, setup.direction), 5)}
          </span>
        </div>

        <div className="mb-3 px-1">
          <AdminLotSizeForCard symbol={setup.symbol} entry={setup.entry} stopLoss={setup.stopLoss} />
        </div>

        {/* RR + Confidence bar */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted">R:R {setup.riskReward}:1</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className={cn("h-full rounded-full", setup.confidenceScore >= 75 ? "bg-bull" : setup.confidenceScore >= 60 ? "bg-accent" : "bg-warn")}
                style={{ width: `${setup.confidenceScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Explanation */}
        <p className="text-xs text-muted leading-relaxed mb-4">{setup.explanation}</p>

        {/* Actions */}
        <div className="flex items-center gap-3 mb-1">
          <ExecuteTradeButton
            setup={{
              symbol: setup.symbol,
              direction: setup.direction,
              entry: setup.entry,
              stopLoss: setup.stopLoss,
              takeProfit: setup.takeProfit1,
              takeProfit2: (setup as { takeProfit2?: number | null }).takeProfit2 ?? null,
              timeframe: setup.timeframe,
              setupType: setup.setupType,
              qualityGrade: setup.qualityGrade,
              confidenceScore: setup.confidenceScore,
              sourceType: "setup",
              sourceRef: setup.id,
            }}
            className="flex-1"
          />
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-accent-light hover:text-accent transition-smooth whitespace-nowrap px-3"
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
            {Object.entries(setup.scoringBreakdown).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-muted capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                <span className={cn("font-mono", (value as number) >= 0 ? "text-bull-light" : "text-bear-light")}>
                  {(value as number) >= 0 ? "+" : ""}{value as number}
                </span>
              </div>
            ))}
            <div className="pt-2 border-t border-border/30 text-xs text-muted">
              <strong className="text-foreground">Invalidation:</strong> {setup.invalidation}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
