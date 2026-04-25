"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { TimeframeFilter, type TimeframeValue, matchesTimeframe, buildTimeframeCounts } from "@/components/dashboard/TimeframeFilter";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { computeOneR } from "@/lib/setups/one-r";

type OBStatus = "fresh" | "tested" | "mitigated";

interface OrderBlockSignal {
  symbol: string;
  timeframe: string;
  direction: "bullish" | "bearish";
  zoneHigh: number;
  zoneLow: number;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  breakClose: number;
  breakLevel: number;
  obFormedAt: string;
  bosConfirmedAt: string;
  status: OBStatus;
  currentPrice: number;
  confidence: number;
  barsSinceBos: number;
}

function fmt(n: number, decimals: number): string {
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
}

function timeAgo(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function instrumentDisplay(symbol: string): { name: string; decimals: number; category: string } {
  const inst = ALL_INSTRUMENTS.find((i) => i.symbol === symbol);
  return {
    name: inst?.displayName ?? symbol,
    decimals: inst?.decimals ?? 2,
    category: inst?.category ?? "forex",
  };
}

export default function OrderBlocksPage() {
  const [blocks, setBlocks] = useState<OrderBlockSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | OBStatus>("all");
  const [timeframe, setTimeframe] = useState<TimeframeValue>("all");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/market/order-blocks", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.blocks)) setBlocks(data.blocks);
        if (data.error) setError(data.error);
        setLastUpdated(Date.now());
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch_failed");
      }
      if (!cancelled) setLoading(false);
    }
    load();
    // OBs form on candle closes — fresh candle data lands every 2 min via the
    // Brain cron. Poll at that cadence so we pick up new structure events.
    const id = setInterval(load, 120_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const byStatus = filterStatus === "all"
    ? blocks
    : blocks.filter((b) => b.status === filterStatus);
  const timeframeCounts = buildTimeframeCounts(byStatus, (b) => b.timeframe);
  const filtered = byStatus.filter((b) => matchesTimeframe(b.timeframe, timeframe));

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">Order Block Signals</h1>
        <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20 pulse-live">Live</span>
        {ageSec != null && (
          <span className="text-xs text-muted">
            Last updated {ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`}
          </span>
        )}
      </div>
      <p className="text-sm text-muted">
        Proper SMC order block detection — fractal swings, break-of-structure, last opposing candle. Built from the Brain's stored candle history, not a single live quote.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Active OBs</div>
          <div className="text-xl font-bold">{blocks.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Bullish</div>
          <div className="text-xl font-bold text-bull-light">{blocks.filter((b) => b.direction === "bullish").length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Bearish</div>
          <div className="text-xl font-bold text-bear-light">{blocks.filter((b) => b.direction === "bearish").length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Fresh</div>
          <div className="text-xl font-bold text-accent-light">{blocks.filter((b) => b.status === "fresh").length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", "fresh", "tested", "mitigated"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth capitalize",
              filterStatus === s ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light",
            )}
          >
            {s === "all" ? "All Status" : s}
          </button>
        ))}
      </div>

      <TimeframeFilter value={timeframe} onChange={setTimeframe} counts={timeframeCounts} />

      {/* Loading */}
      {loading && (
        <div className="glass-card p-12 text-center text-sm text-muted">Running structure scan across the instrument universe…</div>
      )}

      {/* Error */}
      {error && !loading && blocks.length === 0 && (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⚠</div>
          <p className="text-sm text-bear-light">Order block scan failed: <span className="font-mono">{error}</span></p>
          <p className="text-[11px] text-muted-light">Most often this means candles haven&apos;t been ingested yet for the tracked symbols. Check Agent → Market Core Brain.</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⏸</div>
          <p className="text-sm text-muted">
            No {filterStatus === "all" ? "" : `${filterStatus} `}order blocks
            {timeframe !== "all" ? ` on ${timeframe}` : ""}.
          </p>
          <p className="text-[11px] text-muted-light">
            An OB only appears when a decisive BOS has occurred recently and the originating candle is identifiable. Rescans every 2 minutes on fresh candle data.
          </p>
        </div>
      )}

      {/* Cards */}
      {!loading && filtered.length > 0 && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((ob) => {
            const isBull = ob.direction === "bullish";
            const { name, decimals } = instrumentDisplay(ob.symbol);
            return (
              <div key={`${ob.symbol}-${ob.timeframe}-${ob.bosConfirmedAt}`} className="glass-card overflow-hidden">
                <div className={cn("h-1.5", isBull ? "bg-bull" : "bg-bear")} />
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-foreground">{name}</h3>
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", isBull ? "badge-bull" : "badge-bear")}>
                        {isBull ? "Bullish OB" : "Bearish OB"}
                      </span>
                      <span className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded text-muted-light uppercase tracking-wider">{ob.timeframe}</span>
                    </div>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider",
                      ob.status === "fresh" ? "bg-bull/10 text-bull-light border border-bull/30" :
                      ob.status === "tested" ? "bg-warn/10 text-warn border border-warn/30" :
                      "bg-bear/10 text-bear-light border border-bear/30",
                    )}>
                      {ob.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                    <div className="bg-surface-2/60 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase mb-0.5">Zone High</div>
                      <div className="text-foreground">{fmt(ob.zoneHigh, decimals)}</div>
                    </div>
                    <div className="bg-surface-2/60 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase mb-0.5">Zone Low</div>
                      <div className="text-foreground">{fmt(ob.zoneLow, decimals)}</div>
                    </div>
                    <div className="bg-surface-2/60 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase mb-0.5">Price</div>
                      <div className="text-accent-light">{fmt(ob.currentPrice, decimals)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">BOS · <span className="text-foreground">{fmt(ob.breakLevel, decimals)}</span></span>
                    <span className="text-muted">Formed · <span className="text-foreground">{timeAgo(ob.obFormedAt)}</span></span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-10 h-1 rounded-full bg-surface-3 overflow-hidden">
                        <div className={cn("h-full rounded-full", ob.confidence >= 75 ? "bg-bull" : ob.confidence >= 60 ? "bg-accent" : "bg-warn")} style={{ width: `${ob.confidence}%` }} />
                      </div>
                      <span className="text-muted font-mono text-[10px]">{ob.confidence}</span>
                    </span>
                  </div>

                  {/* Trade setup */}
                  <div className="rounded-xl border border-border/50 bg-surface-2/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Trade Setup</span>
                        <span className={cn(
                          "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border",
                          isBull ? "bg-bull/10 text-bull-light border-bull/40" : "bg-bear/10 text-bear-light border-bear/40",
                        )}>
                          {isBull ? "▲ BUY" : "▼ SELL"}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted font-mono">
                        RR {ob.riskReward.toFixed(2)}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 text-[10px] font-mono">
                      <div className="rounded-lg bg-surface-3/40 border border-border/30 p-1.5 text-center">
                        <div className="text-[9px] uppercase text-muted">Entry</div>
                        <div className="text-foreground">{fmt((ob.entryLow + ob.entryHigh) / 2, decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-bear/5 border border-bear/20 p-1.5 text-center">
                        <div className="text-[9px] uppercase text-bear-light">Stop</div>
                        <div className="text-bear-light">{fmt(ob.stopLoss, decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-accent/5 border border-accent/20 p-1.5 text-center">
                        <div className="text-[9px] uppercase text-accent-light">1R</div>
                        <div className="text-accent-light">{fmt(computeOneR((ob.entryLow + ob.entryHigh) / 2, ob.stopLoss, isBull ? "buy" : "sell"), decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-bull/5 border border-bull/20 p-1.5 text-center">
                        <div className="text-[9px] uppercase text-bull-light">TP1</div>
                        <div className="text-bull-light">{fmt(ob.takeProfit1, decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-bull/5 border border-bull/20 p-1.5 text-center">
                        <div className="text-[9px] uppercase text-bull-light">TP2</div>
                        <div className="text-bull-light">{fmt(ob.takeProfit2, decimals)}</div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-light leading-relaxed">
                      {isBull
                        ? `Bullish BOS above ${fmt(ob.breakLevel, decimals)} confirmed ${ob.barsSinceBos} bar(s) ago. Entry sits inside the originating bearish candle; stop below the OB low. Targets stepped 1.5R / 2.5R.`
                        : `Bearish BOS below ${fmt(ob.breakLevel, decimals)} confirmed ${ob.barsSinceBos} bar(s) ago. Entry sits inside the originating bullish candle; stop above the OB high. Targets stepped 1.5R / 2.5R.`}
                    </p>
                    <ExecuteTradeButton
                      setup={{
                        symbol: ob.symbol,
                        direction: isBull ? "buy" : "sell",
                        entry: (ob.entryLow + ob.entryHigh) / 2,
                        stopLoss: ob.stopLoss,
                        takeProfit: ob.takeProfit1,
                        takeProfit2: ob.takeProfit2,
                        timeframe: ob.timeframe,
                        setupType: isBull ? "bullish_order_block" : "bearish_order_block",
                        qualityGrade: ob.confidence >= 80 ? "A" : ob.confidence >= 65 ? "B" : "C",
                        confidenceScore: ob.confidence,
                        sourceType: "order_block",
                        sourceRef: `${ob.symbol}-${ob.timeframe}-${ob.bosConfirmedAt}`,
                      }}
                      className="w-full"
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
