"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const breakoutTypes = [
  { name: "Structure Breakout", desc: "Break of key swing high/low with displacement", icon: "S", active: true },
  { name: "Momentum Breakout", desc: "Explosive move through consolidation with volume surge", icon: "M", active: true },
  { name: "Range Breakout", desc: "Price escapes defined range after accumulation phase", icon: "R", active: true },
  { name: "Trendline Breakout", desc: "Clean break of dynamic trendline with follow-through", icon: "T", active: false },
  { name: "Pattern Breakout", desc: "Triangle, wedge, flag, or pennant completion", icon: "P", active: false },
  { name: "FVG Breakout", desc: "Price displaces through Fair Value Gap with imbalance", icon: "F", active: true },
];

export default function BreakoutAlgoPage() {
  const [enabled, setEnabled] = useState(false);
  const [lotSize, setLotSize] = useState("0.10");
  const [maxTrades, setMaxTrades] = useState("6");
  const [maxLoss, setMaxLoss] = useState("200");
  const [maxSpread, setMaxSpread] = useState("2.5");
  const [slippage, setSlippage] = useState("1.0");
  const [retestPref, setRetestPref] = useState(true);
  const [trailingSL, setTrailingSL] = useState(true);
  const [activeTypes, setActiveTypes] = useState(breakoutTypes.map((b) => b.active));

  const toggleType = (index: number) => {
    setActiveTypes((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Breakout Algo</h1>
            <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">Paper Mode</span>
          </div>
          <p className="text-sm text-muted">Handles trigger logic, retest preference, slippage/spread controls, position sizing, and exit management</p>
        </div>
        <div onClick={() => setEnabled(!enabled)} className={cn("w-12 h-6 rounded-full relative cursor-pointer transition-smooth", enabled ? "bg-accent" : "bg-surface-3")}>
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
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Breakouts Detected</div><div className="text-lg font-bold">0</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Active Types</div><div className="text-lg font-bold text-accent-light">{activeTypes.filter(Boolean).length}/{breakoutTypes.length}</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Breakout Types */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Breakout Types</h3>
            <div className="space-y-2">
              {breakoutTypes.map((b, i) => (
                <div key={b.name} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
                      activeTypes[i] ? "bg-accent/20 text-accent-light" : "bg-surface-3 text-muted")}>{b.icon}</span>
                    <div>
                      <div className="text-xs font-medium text-foreground">{b.name}</div>
                      <div className="text-[10px] text-muted">{b.desc}</div>
                    </div>
                  </div>
                  <div onClick={() => toggleType(i)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", activeTypes[i] ? "bg-accent" : "bg-surface-3")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", activeTypes[i] ? "left-5" : "left-0.5")} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Recent Signals</h3>
            <div className="text-center py-8">
              <div className="text-muted text-sm">{enabled ? "Monitoring for breakout triggers..." : "Enable to see signals"}</div>
              <div className="text-muted text-xs mt-1">Breakout signals appear when price triggers through a qualified level</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Position Sizing & Execution</h3>
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
                <label className="text-xs text-muted-light mb-1.5 block">Max Slippage (pips)</label>
                <input type="number" value={slippage} onChange={(e) => setSlippage(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Spread (pips)</label>
                <input type="number" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Daily Loss ($)</label>
                <input type="number" value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 space-y-3">
            <h3 className="text-sm font-semibold">Exit Management</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div><div className="text-xs font-medium text-foreground">Retest Preference</div><div className="text-[10px] text-muted">Wait for breakout level retest before entering</div></div>
                <div onClick={() => setRetestPref(!retestPref)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", retestPref ? "bg-accent" : "bg-surface-3")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", retestPref ? "left-5" : "left-0.5")} />
                </div>
              </div>
              <div className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div><div className="text-xs font-medium text-foreground">Trailing Stop Loss</div><div className="text-[10px] text-muted">ATR-based trailing SL after reaching 1R profit</div></div>
                <div onClick={() => setTrailingSL(!trailingSL)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", trailingSL ? "bg-accent" : "bg-surface-3")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", trailingSL ? "left-5" : "left-0.5")} />
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Algo Logic</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">Trigger Logic</p>
                <p>Detects breakout candle close above/below the level with minimum displacement. Validates with volume confirmation and candle body-to-wick ratio.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Retest Entry</p>
                <p>When enabled, the algo waits for price to return to the broken level, confirms rejection (pin bar, engulfing), then enters with tight SL behind the retest.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Exit Strategy</p>
                <p>Partial TP at 1:1 R:R, move SL to break-even. Final TP at structure target or trailing stop triggered by ATR contraction.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
