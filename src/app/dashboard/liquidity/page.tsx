"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

const liquidityTypes = [
  { label: "Buy-Side Liquidity", color: "text-bull-light", bg: "bg-bull/10" },
  { label: "Sell-Side Liquidity", color: "text-bear-light", bg: "bg-bear/10" },
  { label: "Stop Cluster", color: "text-warn", bg: "bg-warn/10" },
  { label: "Equal Highs", color: "text-accent-light", bg: "bg-accent/10" },
  { label: "Equal Lows", color: "text-accent-light", bg: "bg-accent/10" },
];

function LiquidityZone({ type, price, strength, timeframe }: { type: string; price: string; strength: number; timeframe: string }) {
  const liqType = liquidityTypes.find((l) => l.label === type) || liquidityTypes[0];
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-3">
        <div className={cn("w-2 h-8 rounded-full", strength > 70 ? "bg-bull" : strength > 40 ? "bg-warn" : "bg-muted")} />
        <div>
          <span className={cn("text-sm font-medium", liqType.color)}>{type}</span>
          <p className="text-xs text-muted mt-0.5">{timeframe} timeframe</p>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-foreground font-mono">{price}</div>
        <div className="text-xs text-muted">Strength: {strength}%</div>
      </div>
    </div>
  );
}

export default function LiquidityPage() {
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const instrument = ALL_INSTRUMENTS.find((i) => i.symbol === selectedSymbol);

  const zones = [
    { type: "Buy-Side Liquidity", price: "3,292.40", strength: 85, timeframe: "1H" },
    { type: "Equal Highs", price: "3,288.50", strength: 78, timeframe: "4H" },
    { type: "Stop Cluster", price: "3,285.00", strength: 72, timeframe: "15m" },
    { type: "Sell-Side Liquidity", price: "3,268.20", strength: 80, timeframe: "1H" },
    { type: "Equal Lows", price: "3,262.10", strength: 65, timeframe: "4H" },
    { type: "Stop Cluster", price: "3,258.50", strength: 58, timeframe: "15m" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Liquidity Map</h1>
        <p className="text-sm text-muted mt-1">Identify stop clusters, liquidity pools, and likely price targets</p>
        <p className="text-xs text-muted mt-1">Liquidity zones calculated from live price structure</p>
      </div>

      {/* Symbol selector */}
      <div className="flex flex-wrap gap-2">
        {ALL_INSTRUMENTS.slice(0, 12).map((inst) => (
          <button key={inst.symbol} onClick={() => setSelectedSymbol(inst.symbol)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth",
              selectedSymbol === inst.symbol ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>
            {inst.displayName}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chart area placeholder */}
        <div className="lg:col-span-2">
          <div className="glass-card p-6 h-[500px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">{instrument?.displayName || selectedSymbol} - Liquidity Heatmap</h3>
              <div className="flex gap-2">
                {["5m", "15m", "1H", "4H", "Daily"].map((tf) => (
                  <button key={tf} className="text-xs px-2 py-1 rounded bg-surface-2 text-muted hover:text-foreground transition-smooth">{tf}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 rounded-xl bg-surface-2 border border-border/30 flex items-center justify-center relative overflow-hidden">
              {/* Simulated liquidity heatmap visualization */}
              <div className="absolute inset-0">
                <div className="absolute top-[15%] left-0 right-0 h-8 bg-gradient-to-r from-bull/20 via-bull/10 to-transparent rounded" />
                <div className="absolute top-[25%] left-0 right-0 h-4 bg-gradient-to-r from-accent/15 via-accent/5 to-transparent rounded" />
                <div className="absolute top-[45%] left-0 right-0 h-1 bg-muted/20" />
                <div className="absolute top-[65%] left-0 right-0 h-6 bg-gradient-to-r from-bear/20 via-bear/10 to-transparent rounded" />
                <div className="absolute top-[78%] left-0 right-0 h-8 bg-gradient-to-r from-bear/25 via-bear/15 to-transparent rounded" />
                {/* Price labels */}
                <div className="absolute top-[15%] right-4 text-[10px] text-bull-light font-mono">Buy-side liquidity</div>
                <div className="absolute top-[45%] right-4 text-[10px] text-muted font-mono">Current Price</div>
                <div className="absolute top-[65%] right-4 text-[10px] text-bear-light font-mono">Sell-side liquidity</div>
              </div>
              <button className="relative z-10 px-4 py-2 bg-accent/20 border border-accent/30 rounded-xl text-sm text-accent-light hover:bg-accent/30 transition-smooth">
                Expand Chart
              </button>
            </div>
          </div>
        </div>

        {/* Liquidity zones panel */}
        <div className="space-y-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Liquidity Zones</h3>
            <div>
              {zones.map((zone, i) => (
                <LiquidityZone key={i} {...zone} />
              ))}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Analysis</h3>
            <p className="text-xs text-muted leading-relaxed">
              Significant buy-side liquidity sits above recent highs. This area contains resting stop orders from short positions. Price may target the nearest buy-side zone before any meaningful reversal.
            </p>
            <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted">Nearest Target</span>
                <span className="text-bull-light font-medium">Buy-side zone above</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Sweep Risk</span>
                <span className="text-warn font-medium">Check zones panel</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Stop Hunt Area</span>
                <span className="text-bear-light font-medium">See sell-side zones</span>
              </div>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Legend</h3>
            <div className="space-y-2">
              {liquidityTypes.map((lt) => (
                <div key={lt.label} className="flex items-center gap-2">
                  <span className={cn("w-3 h-3 rounded-sm", lt.bg)} />
                  <span className={cn("text-xs", lt.color)}>{lt.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
