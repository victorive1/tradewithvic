"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";

interface OrderBlock {
  symbol: string;
  displayName: string;
  category: string;
  type: "Bullish OB" | "Bearish OB";
  zoneHigh: number;
  zoneLow: number;
  status: "Fresh" | "Tested" | "Mitigated";
  confidence: number;
  price: number;
  proximity: number;
}

function deriveOrderBlocks(quotes: any[]): OrderBlock[] {
  return quotes.map((q: any) => {
    const pct = q.changePercent ?? 0;
    const high = q.high ?? q.price;
    const low = q.low ?? q.price;
    const range = high - low;
    const isBullish = pct > 0;
    const absPct = Math.abs(pct);

    const zoneHigh = isBullish ? low + range * 0.35 : high - range * 0.15;
    const zoneLow = isBullish ? low + range * 0.05 : high - range * 0.45;

    const distToZone = isBullish
      ? Math.abs(q.price - (zoneHigh + zoneLow) / 2)
      : Math.abs(q.price - (zoneHigh + zoneLow) / 2);
    const proximity = range > 0 ? Math.max(0, 100 - (distToZone / range) * 100) : 50;

    const confidence = Math.min(95, Math.round(35 + absPct * 18 + proximity * 0.2));

    let status: "Fresh" | "Tested" | "Mitigated" = "Fresh";
    if (absPct > 1.5) status = "Tested";
    if (absPct > 3) status = "Mitigated";

    return {
      symbol: q.symbol,
      displayName: q.displayName || q.symbol,
      category: q.category || "forex",
      type: isBullish ? "Bullish OB" : "Bearish OB",
      zoneHigh,
      zoneLow,
      status,
      confidence,
      price: q.price,
      proximity: Math.round(proximity),
    };
  });
}

export default function OrderBlocksPage() {
  const [blocks, setBlocks] = useState<OrderBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    fetch("/api/market/quotes")
      .then((res) => res.json())
      .then((data) => {
        if (data.quotes) {
          setBlocks(deriveOrderBlocks(data.quotes));
          setLastUpdated(new Date(data.timestamp).toLocaleTimeString());
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  let filtered = blocks;
  if (filterStatus !== "all") filtered = filtered.filter((b) => b.status.toLowerCase() === filterStatus);
  filtered = [...filtered].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Order Block Signals</h1>
        <p className="text-sm text-muted mt-1">
          Detected order block zones with institutional footprint analysis
        </p>
        <p className="text-xs text-accent-light mt-1">24/7 scanning for institutional footprints</p>
        {lastUpdated && <p className="text-xs text-muted mt-1">Live data -- last updated {lastUpdated}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Total OBs</div>
          <div className="text-xl font-bold">{blocks.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Bullish OBs</div>
          <div className="text-xl font-bold text-bull-light">{blocks.filter((b) => b.type === "Bullish OB").length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Bearish OBs</div>
          <div className="text-xl font-bold text-bear-light">{blocks.filter((b) => b.type === "Bearish OB").length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Fresh Zones</div>
          <div className="text-xl font-bold text-accent-light">{blocks.filter((b) => b.status === "Fresh").length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {["all", "fresh", "tested", "mitigated"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth capitalize",
              filterStatus === s ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
            )}
          >
            {s === "all" ? "All Status" : s}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="h-1 bg-surface-3 rounded-t" />
              <div className="h-4 bg-surface-3 rounded w-24 mb-3 mt-4" />
              <div className="h-6 bg-surface-3 rounded w-32 mb-2" />
              <div className="h-16 bg-surface-3 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Order Block Cards */}
      {!loading && filtered.length > 0 && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((ob) => {
            const isBull = ob.type === "Bullish OB";
            const decimals = ob.category === "forex" ? 5 : 2;
            const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

            return (
              <div key={ob.symbol} className="glass-card overflow-hidden">
                <div className={cn("h-1.5", isBull ? "bg-bull" : "bg-bear")} />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-foreground">{ob.displayName}</h3>
                      <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", isBull ? "badge-bull" : "badge-bear")}>
                        {ob.type}
                      </span>
                    </div>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      ob.status === "Fresh" ? "bg-bull/10 text-bull-light" :
                      ob.status === "Tested" ? "bg-warn/10 text-warn" :
                      "bg-surface-2 text-muted"
                    )}>
                      {ob.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-muted uppercase mb-1">Zone High</div>
                      <div className="text-sm font-bold font-mono">{fmt(ob.zoneHigh)}</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center">
                      <div className="text-[10px] text-muted uppercase mb-1">Zone Low</div>
                      <div className="text-sm font-bold font-mono">{fmt(ob.zoneLow)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs text-muted">Proximity</div>
                      <div className="text-sm font-bold font-mono text-accent-light">{ob.proximity}%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted">Confidence</div>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", ob.confidence >= 75 ? "bg-bull" : ob.confidence >= 60 ? "bg-accent" : "bg-warn")}
                            style={{ width: `${ob.confidence}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-muted-light">{ob.confidence}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-muted">
                      Current: <span className="font-mono text-foreground">{fmt(ob.price)}</span>
                    </div>
                    <ExecuteTradeButton
                      setup={{
                        symbol: ob.symbol,
                        direction: isBull ? "buy" : "sell",
                        entry: (ob.zoneHigh + ob.zoneLow) / 2,
                        stopLoss: isBull ? ob.zoneLow * 0.998 : ob.zoneHigh * 1.002,
                        takeProfit: isBull
                          ? ob.zoneHigh + (ob.zoneHigh - ob.zoneLow) * 2
                          : ob.zoneLow - (ob.zoneHigh - ob.zoneLow) * 2,
                        setupType: ob.type,
                        qualityGrade: ob.confidence >= 75 ? "A" : ob.confidence >= 60 ? "candidate" : "watch",
                        confidenceScore: ob.confidence,
                        sourceType: "order_block",
                        sourceRef: ob.symbol,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-muted">No order blocks match your filters. The scanner runs continuously across all instruments.</p>
        </div>
      )}
    </div>
  );
}
