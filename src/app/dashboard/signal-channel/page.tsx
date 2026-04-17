"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MARKET_CATEGORIES } from "@/lib/constants";
import type { TradeSetup } from "@/lib/setup-engine";

function formatPrice(value: number, category: string): string {
  const decimals = category === "forex" ? 5 : category === "crypto" ? 2 : 2;
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function SignalChannelPage() {
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDirection, setFilterDirection] = useState<"all" | "buy" | "sell">("all");

  useEffect(() => {
    fetch("/api/market/setups")
      .then((res) => res.json())
      .then((data) => {
        if (data.setups) setSetups(data.setups);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  let filtered = [...setups].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (filterCategory !== "all") filtered = filtered.filter((s) => s.category === filterCategory);
  if (filterDirection !== "all") filtered = filtered.filter((s) => s.direction === filterDirection);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Signal Channel</h1>
        <p className="text-sm text-muted mt-1">
          Distribution feed for ranked trade ideas -- newest signals first
        </p>
        {loading && <p className="text-xs text-accent-light mt-1">Loading signals...</p>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {MARKET_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setFilterCategory(cat.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth",
              filterCategory === cat.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
            )}
          >
            {cat.label}
          </button>
        ))}
        <div className="w-px bg-border mx-1" />
        <button onClick={() => setFilterDirection("all")}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", filterDirection === "all" ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
          All
        </button>
        <button onClick={() => setFilterDirection("buy")}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", filterDirection === "buy" ? "bg-bull text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
          Bullish
        </button>
        <button onClick={() => setFilterDirection("sell")}
          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", filterDirection === "sell" ? "bg-bear text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
          Bearish
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="h-1 bg-surface-3 rounded-t" />
              <div className="h-4 bg-surface-3 rounded w-24 mb-3 mt-4" />
              <div className="h-6 bg-surface-3 rounded w-32 mb-2" />
              <div className="h-20 bg-surface-3 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Signal Feed */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((setup) => {
            const isBuy = setup.direction === "buy";
            return (
              <div key={setup.id} className="glass-card overflow-hidden">
                <div className={cn("h-1.5", isBuy ? "bg-bull" : "bg-bear")} />
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-foreground">{setup.displayName}</h3>
                      <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full uppercase", isBuy ? "badge-bull" : "badge-bear")}>
                        {setup.direction}
                      </span>
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded",
                        setup.qualityGrade.startsWith("A") ? "bg-bull/10 text-bull-light" : "bg-warn/10 text-warn"
                      )}>
                        {setup.qualityGrade}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "text-xs px-2.5 py-1 rounded-full font-medium",
                        setup.status === "active" ? "bg-bull/10 text-bull-light" :
                        setup.status === "near_entry" ? "bg-accent/10 text-accent-light" :
                        setup.status === "triggered" ? "bg-bull/20 text-bull-light" :
                        "bg-surface-2 text-muted"
                      )}>
                        {setup.status === "active" ? "Open" : setup.status === "near_entry" ? "Near Entry" : setup.status === "triggered" ? "Active" : "Expired"}
                      </span>
                      <div className="text-right">
                        <div className="text-xs text-muted">Confidence</div>
                        <div className="text-sm font-bold font-mono text-accent-light">{setup.confidenceScore}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs bg-surface-2 px-2 py-1 rounded">{setup.timeframe}</span>
                    <span className="text-xs bg-surface-2 px-2 py-1 rounded">{setup.setupType}</span>
                    <span className="text-xs bg-surface-2 px-2 py-1 rounded capitalize">{setup.category}</span>
                    <span className="text-xs bg-surface-2 px-2 py-1 rounded">R:R {setup.riskReward.toFixed(1)}</span>
                  </div>

                  {/* Levels */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-accent-light uppercase mb-1">Entry</div>
                      <div className="text-sm font-bold font-mono">{formatPrice(setup.entry, setup.category)}</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-bear-light uppercase mb-1">Stop Loss</div>
                      <div className="text-sm font-bold font-mono text-bear-light">{formatPrice(setup.stopLoss, setup.category)}</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-bull-light uppercase mb-1">TP1</div>
                      <div className="text-sm font-bold font-mono text-bull-light">{formatPrice(setup.takeProfit1, setup.category)}</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-bull-light uppercase mb-1">TP2</div>
                      <div className="text-sm font-bold font-mono text-bull-light">
                        {setup.takeProfit2 ? formatPrice(setup.takeProfit2, setup.category) : "--"}
                      </div>
                    </div>
                  </div>

                  {/* Explanation */}
                  <p className="text-xs text-muted-light leading-relaxed">{setup.explanation}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-muted">No signals match your current filters. The engine scans continuously and will distribute signals as opportunities arise.</p>
        </div>
      )}
    </div>
  );
}
