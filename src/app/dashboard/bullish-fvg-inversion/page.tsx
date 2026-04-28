"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";
import { useStableSetups } from "@/lib/dashboard/use-stable-setups";

// Bullish FVG Inversion — multi-timeframe signal:
//   1H bullish FVG + price in discount + 1M bearish FVG fails (closes above
//   its origin candle's open) → the failed FVG flips into a bullish
//   inversion zone, which is the entry. Detector lives at
//   src/lib/brain/strategies/bullish-fvg-inversion.ts and runs on every
//   2-min brain scan; this page polls /api/market/bullish-fvg-inversion
//   every 60s and pauses while the user is interacting with a card.

interface BullishInversionSignal {
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

export default function BullishFvgInversionPage() {
  const [signals, setSignals] = useState<BullishInversionSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [grade, setGrade] = useState<"all" | "A+" | "A" | "B">("all");
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (pausedRef.current) return;
      try {
        const res = await fetch(`/api/market/bullish-fvg-inversion?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && Array.isArray(data.signals)) {
          setSignals(data.signals);
          setLastUpdated(data.timestamp ?? Date.now());
        }
      } catch (e) {
        console.error("Failed to load Bullish FVG Inversion signals:", e);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const getId = useCallback((s: BullishInversionSignal) => s.id, []);
  const { items: stable, changedIds } = useStableSetups(signals, getId, paused);

  let filtered = stable;
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
          <h1 className="text-2xl font-bold text-foreground">Bullish FVG Inversion</h1>
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
          Multi-timeframe buy setup. The brain finds a 1H bullish FVG that price taps from discount, then watches the 1M chart for an opposing bearish FVG to fail by closing above its origin candle's open. The failed FVG flips into a bullish inversion zone — that's the entry. Stop sits below the failed FVG low; targets step toward buy-side liquidity at 1.5R+ minimum.
        </p>
      </div>

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

      <div className="flex flex-wrap gap-2">
        {(["all", "A+", "A", "B"] as const).map((g) => (
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
          Scanning the market for bullish FVG inversions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⏸</div>
          <p className="text-sm text-muted">
            No bullish FVG inversion signals matching your filters right now.
          </p>
          <p className="text-[11px] text-muted-light max-w-md mx-auto">
            The detector requires a tapped 1H bullish FVG in discount, plus a recent 1M bearish FVG that has failed by closing above its origin open. These align rarely — patience is the strategy.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const justUpdated = changedIds.has(s.id);
            const oneR = computeOneR(s.entry, s.stopLoss, "buy");
            return (
              <div
                key={s.id}
                className={cn(
                  "glass-card overflow-hidden transition-all duration-300",
                  justUpdated && "ring-2 ring-accent/40 shadow-lg shadow-accent/10",
                )}
              >
                <div className="h-1 bg-bull" />
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-base font-bold text-foreground truncate">{s.displayName}</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-bull/15 text-bull-light border border-bull/30">
                        ▲ Long
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded",
                        s.qualityGrade === "A+" ? "bg-bull/15 text-bull-light" :
                        s.qualityGrade === "A" ? "bg-bull/10 text-bull-light" :
                        s.qualityGrade === "B" ? "bg-warn/10 text-warn" :
                        "bg-muted/10 text-muted-light",
                      )}>
                        {s.qualityGrade}
                      </span>
                      <span className="text-xs font-mono text-accent-light">{s.confidenceScore}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted">
                    <span className="bg-surface-2 px-2 py-0.5 rounded">{s.timeframe}</span>
                    <span className="bg-surface-2 px-2 py-0.5 rounded">bullish_fvg_inversion</span>
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
                        direction: "buy",
                        entry: s.entry,
                        stopLoss: s.stopLoss,
                        takeProfit: s.takeProfit1,
                        takeProfit2: s.takeProfit2,
                        timeframe: s.timeframe,
                        setupType: "bullish_fvg_inversion",
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
