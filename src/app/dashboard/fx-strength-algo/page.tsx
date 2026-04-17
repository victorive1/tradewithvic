"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const timeframes = ["M5", "M15", "H1", "H4"];
const recentSignals: { time: string; pair: string; direction: string; strength: number; status: string }[] = [];

export default function FXStrengthAlgoPage() {
  const [enabled, setEnabled] = useState(false);
  const [lotSize, setLotSize] = useState("0.10");
  const [timeframe, setTimeframe] = useState("M15");
  const [maxTrades, setMaxTrades] = useState("5");
  const [maxLoss, setMaxLoss] = useState("150");
  const [maxSpread, setMaxSpread] = useState("2.0");
  const [pauseAfterLosses, setPauseAfterLosses] = useState("3");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">FX Strength Algo</h1>
            <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">
              Paper Mode
            </span>
          </div>
          <p className="text-sm text-muted">
            Trades only top-ranked FX Strength setups using multi-timeframe directional alignment
          </p>
        </div>
        <div
          onClick={() => setEnabled(!enabled)}
          className={cn(
            "w-12 h-6 rounded-full relative cursor-pointer transition-smooth",
            enabled ? "bg-accent" : "bg-surface-3"
          )}
        >
          <div
            className={cn(
              "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-smooth",
              enabled ? "left-6" : "left-0.5"
            )}
          />
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Status</div>
          <div className="flex items-center justify-center gap-2">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                enabled ? "bg-bull pulse-live" : "bg-muted"
              )}
            />
            <span
              className={cn(
                "text-sm font-bold",
                enabled ? "text-bull-light" : "text-muted"
              )}
            >
              {enabled ? "Running" : "Idle"}
            </span>
          </div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Today P&L</div>
          <div className="text-lg font-bold text-muted">Paper: $0.00</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Trades Today</div>
          <div className="text-lg font-bold">0</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Win Rate</div>
          <div className="text-lg font-bold text-accent-light">--</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Signals Today</div>
          <div className="text-lg font-bold">0</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Trade Controls</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Lot Size</label>
                <input
                  type="number"
                  value={lotSize}
                  onChange={(e) => setLotSize(e.target.value)}
                  step="0.01"
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Timeframe</label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                >
                  {timeframes.map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">
                  Max Trades / Day
                </label>
                <input
                  type="number"
                  value={maxTrades}
                  onChange={(e) => setMaxTrades(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Risk Settings</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">
                  Max Daily Loss ($)
                </label>
                <input
                  type="number"
                  value={maxLoss}
                  onChange={(e) => setMaxLoss(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">
                  Max Spread (pips)
                </label>
                <input
                  type="number"
                  value={maxSpread}
                  onChange={(e) => setMaxSpread(e.target.value)}
                  step="0.1"
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">
                  Pause After Consecutive Losses
                </label>
                <input
                  type="number"
                  value={pauseAfterLosses}
                  onChange={(e) => setPauseAfterLosses(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Signals + Logic */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Recent Signals</h3>
            {recentSignals.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted text-sm">
                  {enabled
                    ? "Scanning for signals..."
                    : "Enable to see signals"}
                </div>
                <div className="text-muted text-xs mt-1">
                  Signals appear here when the algo detects qualifying setups
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSignals.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-surface-2 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-muted">
                        {s.time}
                      </span>
                      <span className="text-xs font-medium">{s.pair}</span>
                      <span
                        className={cn(
                          "text-[10px] font-bold",
                          s.direction === "Buy"
                            ? "text-bull-light"
                            : "text-bear-light"
                        )}
                      >
                        {s.direction}
                      </span>
                    </div>
                    <span className="text-xs text-muted">{s.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Algo Logic</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">
                  Multi-Timeframe Directional Alignment
                </p>
                <p>
                  The algo ranks all FX pairs by currency strength differential
                  across M5, M15, H1, and H4 timeframes. Only pairs where all
                  timeframes agree on direction are considered for entry.
                </p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">
                  Top-Ranked Selection
                </p>
                <p>
                  From the aligned pairs, the algo selects only the top-ranked
                  setups where the strength gap between the two currencies is
                  widest, filtering out low-conviction trades.
                </p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">
                  Entry & Exit
                </p>
                <p>
                  Entries are triggered on pullback confirmation within the
                  dominant trend. Exits use a combination of fixed R:R targets
                  and trailing stops based on ATR.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
