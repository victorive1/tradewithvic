"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const obTypes = [
  { label: "Bullish OB", desc: "Last bearish candle before impulsive move up", color: "text-bull-light" },
  { label: "Bearish OB", desc: "Last bullish candle before impulsive move down", color: "text-bear-light" },
  { label: "Breaker Block", desc: "Failed OB that flips into support/resistance", color: "text-accent-light" },
  { label: "Mitigation Block", desc: "OB that has been partially filled", color: "text-warn" },
];

export default function OBAlgoPage() {
  const [enabled, setEnabled] = useState(false);
  const [lotSize, setLotSize] = useState("0.10");
  const [maxTrades, setMaxTrades] = useState("4");
  const [maxLoss, setMaxLoss] = useState("200");
  const [maxSpread, setMaxSpread] = useState("2.0");
  const [retestOnly, setRetestOnly] = useState(true);
  const [minQuality, setMinQuality] = useState("A");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Order Block Algo</h1>
            <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">
              Paper Mode
            </span>
          </div>
          <p className="text-sm text-muted">
            Executes validated order block signals with structured SL/TP and A+ quality gating
          </p>
        </div>
        <div
          onClick={() => setEnabled(!enabled)}
          className={cn("w-12 h-6 rounded-full relative cursor-pointer transition-smooth", enabled ? "bg-accent" : "bg-surface-3")}
        >
          <div className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white transition-smooth", enabled ? "left-6" : "left-0.5")} />
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Status</div>
          <div className="flex items-center justify-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", enabled ? "bg-bull pulse-live" : "bg-muted")} />
            <span className={cn("text-sm font-bold", enabled ? "text-bull-light" : "text-muted")}>{enabled ? "Running" : "Idle"}</span>
          </div>
        </div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Today P&L</div><div className="text-lg font-bold text-muted">Paper: $0.00</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Trades Today</div><div className="text-lg font-bold">0</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">OBs Detected</div><div className="text-lg font-bold">0</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Quality Gate</div><div className="text-lg font-bold text-accent-light">{minQuality}+</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Risk Controls</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Lot Size</label>
                <input type="number" value={lotSize} onChange={(e) => setLotSize(e.target.value)} step="0.01" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Trades / Day</label>
                <input type="number" value={maxTrades} onChange={(e) => setMaxTrades(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Daily Loss ($)</label>
                <input type="number" value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Spread (pips)</label>
                <input type="number" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Min Quality Grade</label>
                <select value={minQuality} onChange={(e) => setMinQuality(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="A+">A+ Only</option>
                  <option value="A">A and above</option>
                  <option value="B+">B+ and above</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-4">
                <div onClick={() => setRetestOnly(!retestOnly)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", retestOnly ? "bg-accent" : "bg-surface-3")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", retestOnly ? "left-5" : "left-0.5")} />
                </div>
                <label className="text-xs text-muted-light">Retest Only (preferred)</label>
              </div>
            </div>
          </div>

          {/* OB Types */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Institutional Zone Types</h3>
            <div className="space-y-3">
              {obTypes.map((ob) => (
                <div key={ob.label} className="flex items-start gap-3 bg-surface-2 rounded-lg p-3">
                  <span className={cn("text-xs font-bold whitespace-nowrap mt-0.5", ob.color)}>{ob.label}</span>
                  <span className="text-xs text-muted">{ob.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Signals + Logic */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Recent Signals</h3>
            <div className="text-center py-8">
              <div className="text-muted text-sm">{enabled ? "Scanning for order blocks..." : "Enable to see signals"}</div>
              <div className="text-muted text-xs mt-1">OB signals appear here when the algo detects qualifying institutional zones</div>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Algo Logic</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">Institutional Zone Detection</p>
                <p>Scans for valid order blocks at key institutional levels. Identifies the last opposing candle before an impulsive displacement move, marking zones where institutional orders were placed.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Quality Gating</p>
                <p>Each OB is graded from C to A+ based on displacement strength, imbalance left behind, HTF confluence, and whether price has revisited the zone. Only A+ quality setups pass the default filter.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Retest Preference</p>
                <p>The algo prefers entries on the first retest of an unmitigated order block, placing SL beyond the OB body and TP at the opposing liquidity pool or imbalance fill level.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Structured Risk</p>
                <p>SL is placed at the OB extreme (high for bearish, low for bullish). TP targets the nearest liquidity pool. Minimum 1:2 R:R is enforced before any trade is taken.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
