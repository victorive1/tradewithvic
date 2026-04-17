"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const instruments = [
  { symbol: "XAU/USD", name: "Gold", enabled: true },
  { symbol: "XAG/USD", name: "Silver", enabled: true },
];

const entryModels = [
  { name: "Trend Continuation", desc: "Enter pullbacks within a confirmed HTF trend", active: true },
  { name: "Pullback to Level", desc: "Enter at key horizontal support/resistance levels", active: true },
  { name: "Horizontal Level Bounce", desc: "React to price testing major historical levels", active: false },
  { name: "Confirmation-Based HTF", desc: "Wait for H4/D1 candle confirmation before entry", active: true },
];

export default function MetalsAlgoPage() {
  const [enabled, setEnabled] = useState(false);
  const [lotSize, setLotSize] = useState("0.10");
  const [maxTrades, setMaxTrades] = useState("3");
  const [maxLoss, setMaxLoss] = useState("250");
  const [maxSpread, setMaxSpread] = useState("3.0");
  const [htfTimeframe, setHtfTimeframe] = useState("H4");
  const [entryTimeframe, setEntryTimeframe] = useState("M15");
  const [activeInstruments, setActiveInstruments] = useState(instruments.map((i) => i.enabled));
  const [activeModels, setActiveModels] = useState(entryModels.map((m) => m.active));

  const toggleInstrument = (index: number) => {
    setActiveInstruments((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const toggleModel = (index: number) => {
    setActiveModels((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Silver & Gold Algo</h1>
            <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">Paper Mode</span>
            <span className="text-xs bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">Metals</span>
          </div>
          <p className="text-sm text-muted">Metals-focused engine for XAU/USD and XAG/USD using trend continuation, pullbacks, horizontal levels, and confirmation-based entries on higher timeframes</p>
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
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Active Pairs</div><div className="text-lg font-bold text-accent-light">{activeInstruments.filter(Boolean).length}</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Entry Models</div><div className="text-lg font-bold">{activeModels.filter(Boolean).length}</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Instruments + Entry Models */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Instruments</h3>
            <div className="space-y-2">
              {instruments.map((inst, i) => (
                <div key={inst.symbol} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-foreground">{inst.symbol}</span>
                    <span className="text-[10px] text-muted">{inst.name}</span>
                  </div>
                  <div onClick={() => toggleInstrument(i)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", activeInstruments[i] ? "bg-accent" : "bg-surface-3")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", activeInstruments[i] ? "left-5" : "left-0.5")} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Entry Models</h3>
            <div className="space-y-2">
              {entryModels.map((m, i) => (
                <div key={m.name} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                  <div>
                    <div className="text-xs font-medium text-foreground">{m.name}</div>
                    <div className="text-[10px] text-muted">{m.desc}</div>
                  </div>
                  <div onClick={() => toggleModel(i)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", activeModels[i] ? "bg-accent" : "bg-surface-3")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", activeModels[i] ? "left-5" : "left-0.5")} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Timeframe Configuration</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">HTF Bias</label>
                <select value={htfTimeframe} onChange={(e) => setHtfTimeframe(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="H1">H1</option>
                  <option value="H4">H4</option>
                  <option value="D1">D1</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Entry Timeframe</label>
                <select value={entryTimeframe} onChange={(e) => setEntryTimeframe(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="M5">M5</option>
                  <option value="M15">M15</option>
                  <option value="M30">M30</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Controls + Signals */}
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
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Recent Signals</h3>
            <div className="text-center py-8">
              <div className="text-muted text-sm">{enabled ? "Scanning metals markets..." : "Enable to see signals"}</div>
              <div className="text-muted text-xs mt-1">Metals signals appear when the algo detects qualifying setups on XAU/USD or XAG/USD</div>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Metals Logic</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">Gold Characteristics</p>
                <p>XAU/USD is highly sensitive to USD strength, real yields, and risk sentiment. The algo accounts for correlated moves with DXY and US10Y yields when filtering entries.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Silver Characteristics</p>
                <p>XAG/USD has wider spreads and higher volatility than gold. The algo uses wider SL buffers and requires stronger confirmation signals before entry on silver.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">HTF Confirmation</p>
                <p>Entries require confirmation on the {htfTimeframe} timeframe before drilling down to {entryTimeframe} for precise entry timing, reducing false breakouts common in metals.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
