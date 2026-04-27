"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";
import { useStableSetups } from "@/lib/dashboard/use-stable-setups";

// Inverse FVG signals — data flows:
//   Brain scan cron (every 2min) → detectInverseFVG() in
//   src/lib/brain/strategies/inverse-fvg.ts → writes TradeSetup row →
//   /api/market/inverse-fvg reads active rows → this page polls every 60s
//   → useStableSetups merges in-place → cards stay put while user is
//   reading them, hover anywhere pauses the refresh.

interface InverseFvgSignal {
  id: string;
  symbol: string;
  displayName: string;
  category: string;
  decimalPlaces: number;
  timeframe: string;
  direction: string;
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
  validUntil: string | null;
  createdAt: string;
}

function fmt(n: number, dp: number): string {
  return dp > 0 ? n.toFixed(dp) : Math.round(n).toLocaleString();
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export default function InverseFvgPage() {
  const [signals, setSignals] = useState<InverseFvgSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [direction, setDirection] = useState<"all" | "bullish" | "bearish">("all");
  const [grade, setGrade] = useState<"all" | "A+" | "A" | "B+">("all");
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (pausedRef.current) return;
      try {
        const res = await fetch(`/api/market/inverse-fvg?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && Array.isArray(data.signals)) {
          setSignals(data.signals);
          setLastUpdated(data.timestamp ?? Date.now());
        }
      } catch (e) {
        console.error("Failed to load IFVG signals:", e);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const getId = useCallback((s: InverseFvgSignal) => s.id, []);
  const { items: stable, changedIds } = useStableSetups(signals, getId, paused);

  // Filters apply on top of the stable order — toggling a filter doesn't
  // rebuild the order, just hides cards that don't match.
  let filtered = stable;
  if (direction !== "all") filtered = filtered.filter((s) => s.direction === direction);
  if (grade !== "all") filtered = filtered.filter((s) => s.qualityGrade === grade);

  const aPlus = filtered.filter((s) => s.qualityGrade === "A+").length;
  const a = filtered.filter((s) => s.qualityGrade === "A").length;

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;

  return (
    <div
      className="space-y-6"
      onMouseEnter={() => { pausedRef.current = true; setPaused(true); }}
      onMouseLeave={() => { pausedRef.current = false; setPaused(false); }}
    >
      <AdminRiskTargetBar />

      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Inverse FVG</h1>
          <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20 pulse-live">Live</span>
          {ageSec != null && (
            <span className="text-xs text-muted">
              Last updated {ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`} · refreshes every 60s
            </span>
          )}
          {paused && (
            <span className="text-[11px] text-warn-light bg-warn/10 border border-warn/30 px-2 py-0.5 rounded-full" title="Refresh paused while you're hovering — move away to resume">
              ⏸ paused while interacting
            </span>
          )}
        </div>
        <p className="text-sm text-muted mt-1 max-w-3xl">
          Trades the failed imbalance — a Fair Value Gap that gets violated by a clean break-and-close, then flips: support becomes resistance (sell), resistance becomes support (buy). Entry on the rejection wick at the retest. The strategy targets where most traders get trapped in the original FVG.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Active Signals</div>
          <div className="text-xl font-bold">{filtered.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">A+ Grade</div>
          <div className="text-xl font-bold text-bull-light">{aPlus}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">A Grade</div>
          <div className="text-xl font-bold text-accent-light">{a}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Avg Confidence</div>
          <div className="text-xl font-bold text-warn">
            {filtered.length > 0 ? Math.round(filtered.reduce((acc, s) => acc + s.confidenceScore, 0) / filtered.length) : 0}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", "bullish", "bearish"] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDirection(d)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth capitalize",
              direction === d
                ? d === "bullish" ? "bg-bull text-white" : d === "bearish" ? "bg-bear text-white" : "bg-accent text-white"
                : "bg-surface-2 text-muted-light border border-border/50",
            )}
          >
            {d === "all" ? "All directions" : d}
          </button>
        ))}
        <div className="w-px bg-border mx-1" />
        {(["all", "A+", "A", "B+"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGrade(g)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth",
              grade === g ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50",
            )}
          >
            {g === "all" ? "All grades" : g}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-sm text-muted">
          Scanning the market for inverse-FVG inversions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⏸</div>
          <p className="text-sm text-muted">
            No inverse-FVG signals matching your filters right now.
          </p>
          <p className="text-[11px] text-muted-light max-w-md mx-auto">
            The detector requires a clean FVG, a break-and-close violation, a retest, and a rejection wick of at least 30%. Patience — these are A-grade by construction, not B-grade volume.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const isBull = s.direction === "bullish" || s.direction === "buy";
            const justUpdated = changedIds.has(s.id);
            const oneR = computeOneR(s.entry, s.stopLoss, isBull ? "buy" : "sell");
            return (
              <div
                key={s.id}
                className={cn(
                  "glass-card overflow-hidden transition-all duration-300",
                  justUpdated && "ring-2 ring-accent/40 shadow-lg shadow-accent/10",
                )}
              >
                <div className={cn("h-1", isBull ? "bg-bull" : "bg-bear")} />
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-base font-bold text-foreground truncate">{s.displayName}</h3>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                        isBull ? "bg-bull/15 text-bull-light border border-bull/30" : "bg-bear/15 text-bear-light border border-bear/30",
                      )}>
                        {isBull ? "▲ Buy" : "▼ Sell"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded",
                        s.qualityGrade === "A+" ? "bg-bull/15 text-bull-light" :
                        s.qualityGrade === "A" ? "bg-bull/10 text-bull-light" :
                        s.qualityGrade === "B+" ? "bg-warn/10 text-warn" :
                        "bg-muted/10 text-muted-light",
                      )}>
                        {s.qualityGrade}
                      </span>
                      <span className="text-xs font-mono text-accent-light">{s.confidenceScore}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted">
                    <span className="bg-surface-2 px-2 py-0.5 rounded">{s.timeframe}</span>
                    <span className="bg-surface-2 px-2 py-0.5 rounded">inverse_fvg</span>
                    <span>{timeAgo(s.createdAt)}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px] font-mono">
                    <div className="rounded-lg bg-surface-3/40 border border-border/30 p-2 text-center">
                      <div className="text-[9px] uppercase text-muted mb-0.5">Entry</div>
                      <div className="text-foreground">{fmt(s.entry, s.decimalPlaces)}</div>
                    </div>
                    <div className="rounded-lg bg-bear/5 border border-bear/20 p-2 text-center">
                      <div className="text-[9px] uppercase text-bear-light mb-0.5">Stop</div>
                      <div className="text-bear-light">{fmt(s.stopLoss, s.decimalPlaces)}</div>
                    </div>
                    <div className="rounded-lg bg-accent/5 border border-accent/20 p-2 text-center">
                      <div className="text-[9px] uppercase text-accent-light mb-0.5">1R</div>
                      <div className="text-accent-light">{fmt(oneR, s.decimalPlaces)}</div>
                    </div>
                    <div className="rounded-lg bg-bull/5 border border-bull/20 p-2 text-center">
                      <div className="text-[9px] uppercase text-bull-light mb-0.5">TP1</div>
                      <div className="text-bull-light">{fmt(s.takeProfit1, s.decimalPlaces)}</div>
                    </div>
                    {s.takeProfit2 != null && (
                      <div className="rounded-lg bg-bull/5 border border-bull/20 p-2 text-center">
                        <div className="text-[9px] uppercase text-bull-light mb-0.5">TP2</div>
                        <div className="text-bull-light">{fmt(s.takeProfit2, s.decimalPlaces)}</div>
                      </div>
                    )}
                  </div>

                  <AdminLotSizeForCard symbol={s.symbol} entry={s.entry} stopLoss={s.stopLoss} />

                  {s.explanation && (
                    <p className="text-[11px] text-muted-light leading-relaxed">{s.explanation}</p>
                  )}

                  {s.invalidation && (
                    <p className="text-[10px] text-warn-light bg-warn/5 border border-warn/20 rounded-lg p-2 leading-relaxed">
                      <span className="font-semibold">Invalidation:</span> {s.invalidation}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted font-mono">RR {s.riskReward.toFixed(2)}</span>
                    <ExecuteTradeButton
                      setup={{
                        symbol: s.symbol,
                        direction: isBull ? "buy" : "sell",
                        entry: s.entry,
                        stopLoss: s.stopLoss,
                        takeProfit: s.takeProfit1,
                        takeProfit2: s.takeProfit2,
                        timeframe: s.timeframe,
                        setupType: "inverse_fvg",
                        qualityGrade: s.qualityGrade,
                        confidenceScore: s.confidenceScore,
                        sourceType: "setup",
                        sourceRef: s.id,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
