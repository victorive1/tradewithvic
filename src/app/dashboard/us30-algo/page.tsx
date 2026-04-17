"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const strategyModes = [
  { id: "continuation", label: "Continuation", desc: "Trades with the trend after deep pullback into value zone" },
  { id: "breakout-retest", label: "Breakout Retest", desc: "Enters on structure break retest with displacement confirmation" },
  { id: "reversal", label: "Session Reversal", desc: "Fades opening spikes at session open using mean-reversion rules" },
];

export default function US30AlgoPage() {
  const [enabled, setEnabled] = useState(false);
  const [lotSize, setLotSize] = useState("0.05");
  const [maxTrades, setMaxTrades] = useState("3");
  const [maxLoss, setMaxLoss] = useState("300");
  const [maxSpread, setMaxSpread] = useState("5.0");
  const [atrMultiplier, setAtrMultiplier] = useState("1.5");
  const [activeMode, setActiveMode] = useState("continuation");
  const [sessionFilter, setSessionFilter] = useState("ny");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">US30 Algo</h1>
            <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">Paper Mode</span>
            <span className="text-xs bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">Dow Jones</span>
          </div>
          <p className="text-sm text-muted">US30-specific framework for high volatility, deep pullbacks, ATR-normalized rules, and continuation/breakout-retest logic</p>
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
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">ATR (14)</div><div className="text-lg font-bold text-muted">--</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Session</div><div className="text-lg font-bold text-accent-light capitalize">{sessionFilter}</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Strategy Modes */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Strategy Mode</h3>
            <div className="space-y-2">
              {strategyModes.map((m) => (
                <div key={m.id} onClick={() => setActiveMode(m.id)}
                  className={cn("flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-smooth border",
                    activeMode === m.id ? "bg-accent/10 border-accent/30" : "bg-surface-2 border-transparent hover:border-border-light")}>
                  <span className={cn("w-3 h-3 rounded-full border-2 flex-shrink-0",
                    activeMode === m.id ? "border-accent bg-accent" : "border-muted")} />
                  <div>
                    <div className={cn("text-xs font-medium", activeMode === m.id ? "text-accent-light" : "text-foreground")}>{m.label}</div>
                    <div className="text-[10px] text-muted">{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">US30-Specific Controls</h3>
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
                <label className="text-xs text-muted-light mb-1.5 block">ATR SL Multiplier</label>
                <input type="number" value={atrMultiplier} onChange={(e) => setAtrMultiplier(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Spread (points)</label>
                <input type="number" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} step="0.5" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Daily Loss ($)</label>
                <input type="number" value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Session Filter</label>
                <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="ny">New York</option>
                  <option value="london">London</option>
                  <option value="all">All Sessions</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Signals + Logic */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Recent Signals</h3>
            <div className="text-center py-8">
              <div className="text-muted text-sm">{enabled ? "Monitoring US30..." : "Enable to see signals"}</div>
              <div className="text-muted text-xs mt-1">US30 signals will appear based on the selected strategy mode</div>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">US30 Framework</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">High Volatility Adaptation</p>
                <p>US30 moves 300-800+ points per day. The algo uses ATR-normalized stop losses and take profits that dynamically adjust to current volatility conditions, preventing premature stops during normal price action.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Deep Pullback Logic</p>
                <p>In continuation mode, the algo waits for pullbacks into the 50-79% retracement zone of the impulse move, requiring a structural hold and candle confirmation before entering with the trend.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Breakout-Retest</p>
                <p>Monitors key structure levels. After a clean break with displacement, it waits for price to return to the broken level, confirms rejection, then enters with SL behind the retest structure.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Session Awareness</p>
                <p>Most US30 setups occur around NYSE open (09:30 ET). The algo weights signals during high-liquidity windows and filters out low-probability pre-market noise.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
