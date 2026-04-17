"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const confluenceFactors = [
  { name: "HTF Trend", desc: "H4/D1 directional bias confirmed", weight: "30%" },
  { name: "LTF Confirmation", desc: "M5/M15 structure shift aligns with HTF", weight: "25%" },
  { name: "Key Level", desc: "Price at or near significant S/R level", weight: "20%" },
  { name: "Momentum", desc: "RSI/MACD divergence or alignment", weight: "15%" },
  { name: "Volume Profile", desc: "Volume supports directional move", weight: "10%" },
];

export default function MDAlgoPage() {
  const [enabled, setEnabled] = useState(false);
  const [lotSize, setLotSize] = useState("0.10");
  const [maxTrades, setMaxTrades] = useState("4");
  const [maxLoss, setMaxLoss] = useState("200");
  const [maxSpread, setMaxSpread] = useState("2.0");
  const [confluenceMin, setConfluenceMin] = useState("70");
  const [htfTimeframe, setHtfTimeframe] = useState("H4");
  const [ltfTimeframe, setLtfTimeframe] = useState("M15");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Market Direction Algo</h1>
            <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">Paper Mode</span>
          </div>
          <p className="text-sm text-muted">Trades only when higher-timeframe direction, lower-timeframe confirmation, and confluence thresholds align</p>
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
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">HTF Bias</div><div className="text-lg font-bold text-muted">--</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Confluence</div><div className="text-lg font-bold text-accent-light">{confluenceMin}% min</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Timeframe Configuration</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Higher Timeframe (Bias)</label>
                <select value={htfTimeframe} onChange={(e) => setHtfTimeframe(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="H1">H1</option>
                  <option value="H4">H4</option>
                  <option value="D1">D1</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Lower Timeframe (Entry)</label>
                <select value={ltfTimeframe} onChange={(e) => setLtfTimeframe(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="M5">M5</option>
                  <option value="M15">M15</option>
                  <option value="M30">M30</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Confluence Threshold (%)</label>
                <input type="number" value={confluenceMin} onChange={(e) => setConfluenceMin(e.target.value)} min="50" max="100" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
            </div>
          </div>

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
            </div>
          </div>
        </div>

        {/* Confluence + Signals */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Confluence Scoring Model</h3>
            <div className="space-y-2">
              {confluenceFactors.map((f) => (
                <div key={f.name} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                  <div>
                    <span className="text-xs font-medium text-foreground">{f.name}</span>
                    <span className="text-[10px] text-muted ml-2">{f.desc}</span>
                  </div>
                  <span className="text-xs font-bold text-accent-light">{f.weight}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted mt-3">
              Total confluence score must meet the threshold ({confluenceMin}%) before entry is considered. Each factor is scored independently and combined.
            </p>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Recent Signals</h3>
            <div className="text-center py-8">
              <div className="text-muted text-sm">{enabled ? "Analyzing multi-timeframe alignment..." : "Enable to see signals"}</div>
              <div className="text-muted text-xs mt-1">Signals appear when HTF direction and LTF confirmation converge above the confluence threshold</div>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">How It Works</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">Step 1: HTF Bias</p>
                <p>The algo establishes directional bias from the higher timeframe ({htfTimeframe}) using trend structure, moving averages, and momentum indicators.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Step 2: LTF Confirmation</p>
                <p>On the lower timeframe ({ltfTimeframe}), it waits for a structure shift or pattern that aligns with the HTF bias before considering entry.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Step 3: Confluence Check</p>
                <p>All confluence factors are scored. Only when the combined score exceeds {confluenceMin}% does the algo generate a trade signal.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
