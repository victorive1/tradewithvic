"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

const levels = [
  { price: "3,298.00", type: "Resistance", strength: 92, reactions: 5, timeframe: "Daily", label: "Major resistance - tested 5 times" },
  { price: "3,285.50", type: "Resistance", strength: 78, reactions: 3, timeframe: "4H", label: "Session high cluster" },
  { price: "3,275.00", type: "Flip Zone", strength: 85, reactions: 4, timeframe: "1H", label: "Former resistance now support" },
  { price: "3,268.20", type: "Support", strength: 88, reactions: 4, timeframe: "4H", label: "Strong demand zone" },
  { price: "3,255.00", type: "Support", strength: 95, reactions: 6, timeframe: "Daily", label: "Major support - key institutional level" },
  { price: "3,242.80", type: "Support", strength: 72, reactions: 2, timeframe: "1H", label: "Previous week low" },
];

export default function LevelsPage() {
  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Support & Resistance Engine</h1>
        <p className="text-sm text-muted mt-1">Auto-detected key levels ranked by strength, recency, and reaction count</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ALL_INSTRUMENTS.slice(0, 12).map((inst) => (
          <button key={inst.symbol} onClick={() => setSelectedSymbol(inst.symbol)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth",
              selectedSymbol === inst.symbol ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
            {inst.displayName}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">{selectedSymbol} - Key Levels</h3>
            <button className="text-xs px-3 py-1.5 bg-accent/20 text-accent-light rounded-lg">Expand Chart</button>
          </div>
          <div className="h-[450px] rounded-xl bg-surface-2 border border-border/30 relative overflow-hidden">
            {levels.map((level, i) => (
              <div key={i} className="absolute left-0 right-0 flex items-center" style={{ top: `${10 + i * 14}%` }}>
                <div className={cn("h-px flex-1", level.type === "Support" ? "bg-bull/40" : level.type === "Resistance" ? "bg-bear/40" : "bg-accent/40")} style={{ borderStyle: "dashed" }} />
                <span className={cn("text-[10px] font-mono ml-2 px-1.5 py-0.5 rounded",
                  level.type === "Support" ? "bg-bull/10 text-bull-light" : level.type === "Resistance" ? "bg-bear/10 text-bear-light" : "bg-accent/10 text-accent-light")}>
                  {level.price} ({level.type})
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Levels table */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Detected Levels</h3>
          <div className="space-y-3">
            {levels.map((level, i) => (
              <div key={i} className="bg-surface-2 rounded-xl p-3 border border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold font-mono text-foreground">{level.price}</span>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
                    level.type === "Support" ? "badge-bull" : level.type === "Resistance" ? "badge-bear" : "bg-accent/10 text-accent-light border border-accent/20 text-xs rounded-full px-2 py-0.5")}>
                    {level.type}
                  </span>
                </div>
                <p className="text-xs text-muted mb-2">{level.label}</p>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Strength: <strong className="text-foreground">{level.strength}%</strong></span>
                  <span>{level.reactions} reactions</span>
                  <span>{level.timeframe}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div className={cn("h-full rounded-full", level.strength >= 85 ? "bg-bull" : level.strength >= 70 ? "bg-accent" : "bg-warn")}
                    style={{ width: `${level.strength}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
