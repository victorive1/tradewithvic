"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { TradeSetup } from "@/lib/setup-engine";

function formatPrice(value: number, category: string): string {
  const decimals = category === "forex" ? 5 : 2;
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function EditorsPickPage() {
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/market/setups")
      .then((res) => res.json())
      .then((data) => {
        if (data.setups) {
          const aPlus = data.setups.filter((s: TradeSetup) => s.qualityGrade === "A+");
          setSetups(aPlus);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Editor&apos;s Pick</h1>
        <p className="text-sm text-muted mt-1">
          Curated by the engine -- only the strongest setups
        </p>
        <p className="text-xs text-accent-light mt-1">
          Only A+ graded setups appear here. Every signal has passed the highest quality threshold.
        </p>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="h-1 bg-surface-3 rounded-t" />
              <div className="h-4 bg-surface-3 rounded w-24 mb-3 mt-4" />
              <div className="h-6 bg-surface-3 rounded w-32 mb-2" />
              <div className="h-20 bg-surface-3 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* A+ Setups */}
      {!loading && setups.length > 0 && (
        <>
          <div className="glass-card p-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-bull animate-pulse" />
              <span className="text-sm font-semibold text-bull-light">{setups.length} A+ setup{setups.length > 1 ? "s" : ""} detected</span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {setups.map((setup) => {
              const isBuy = setup.direction === "buy";
              return (
                <div key={setup.id} className="glass-card overflow-hidden">
                  <div className={cn("h-1.5", isBuy ? "bg-bull" : "bg-bear")} />
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-bold text-foreground">{setup.displayName}</h3>
                        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full uppercase", isBuy ? "badge-bull" : "badge-bear")}>
                          {setup.direction}
                        </span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-bull/10 text-bull-light">A+</span>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs bg-surface-2 px-2 py-1 rounded">{setup.timeframe}</span>
                      <span className="text-xs bg-surface-2 px-2 py-1 rounded">{setup.setupType}</span>
                      <span className="text-xs bg-surface-2 px-2 py-1 rounded capitalize">{setup.category}</span>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-xs text-muted">Confidence</div>
                        <div className="text-lg font-bold font-mono text-accent-light">{setup.confidenceScore}%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted">R:R</div>
                        <div className="text-lg font-bold font-mono text-foreground">{setup.riskReward.toFixed(1)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-surface-2 rounded-lg p-2 text-center">
                        <div className="text-[10px] text-accent-light uppercase mb-1">Entry</div>
                        <div className="text-xs font-bold font-mono">{formatPrice(setup.entry, setup.category)}</div>
                      </div>
                      <div className="bg-surface-2 rounded-lg p-2 text-center">
                        <div className="text-[10px] text-bear-light uppercase mb-1">SL</div>
                        <div className="text-xs font-bold font-mono text-bear-light">{formatPrice(setup.stopLoss, setup.category)}</div>
                      </div>
                      <div className="bg-surface-2 rounded-lg p-2 text-center">
                        <div className="text-[10px] text-bull-light uppercase mb-1">TP</div>
                        <div className="text-xs font-bold font-mono text-bull-light">{formatPrice(setup.takeProfit1, setup.category)}</div>
                      </div>
                    </div>

                    <p className="text-xs text-muted-light leading-relaxed">{setup.explanation}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading && setups.length === 0 && (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-surface-3 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className="text-muted-light font-medium mb-2">No A+ setups detected right now</p>
          <p className="text-xs text-muted max-w-md mx-auto">
            The engine continuously scans and will surface opportunities when conditions align.
            A+ grade requires exceptional confluence across all scoring dimensions.
          </p>
        </div>
      )}
    </div>
  );
}
