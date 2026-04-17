"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type AlgoTab = "dashboard" | "strategies" | "settings" | "trades" | "analytics";

const strategies = [
  { id: "epa", name: "Elite Price Action", category: "Multi-TF", symbols: 11, frequency: "3-8/day", risk: "Low", winRate: "68%", enabled: true, grade: "A+" },
  { id: "bfvg", name: "Breakout FVG", category: "Breakout", symbols: 8, frequency: "5-12/day", risk: "Medium", winRate: "62%", enabled: true, grade: "A" },
  { id: "lsweep", name: "Liquidity Sweep", category: "Reversal", symbols: 11, frequency: "2-5/day", risk: "Medium", winRate: "65%", enabled: false, grade: "A" },
  { id: "engulf", name: "Engulfing Strategy", category: "Pattern", symbols: 8, frequency: "4-8/day", risk: "Low", winRate: "71%", enabled: false, grade: "A+" },
  { id: "pullback", name: "Elite Pullback", category: "Continuation", symbols: 11, frequency: "3-6/day", risk: "Low", winRate: "66%", enabled: true, grade: "B+" },
];

function DashboardTab() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Status</div><div className="flex items-center justify-center gap-2"><span className="text-sm font-bold text-muted">Idle</span></div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Today P&L</div><div className="text-lg font-bold text-muted">$0.00</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Trades Today</div><div className="text-lg font-bold">0</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Win Rate</div><div className="text-lg font-bold text-muted">0%</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Active Strategies</div><div className="text-lg font-bold">0</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent trades */}
        <div className="glass-card p-8 text-center space-y-3">
          <h3 className="text-sm font-semibold mb-1">Recent Trades</h3>
          <p className="text-sm text-muted">
            No trades executed yet. Enable a strategy and start paper trading to see activity here.
          </p>
        </div>

        {/* Event log */}
        <div className="glass-card p-8 text-center space-y-3">
          <h3 className="text-sm font-semibold mb-1">Event Log</h3>
          <p className="text-sm text-muted">
            No events yet. The system will log all trading activity, skipped signals, and bot decisions here.
          </p>
        </div>
      </div>
    </div>
  );
}

function StrategiesTab() {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Strategy Library</h3>
      {strategies.map((s) => (
        <div key={s.id} className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-bold">{s.name}</h4>
              <span className="text-xs bg-surface-2 px-2 py-0.5 rounded">{s.category}</span>
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded", s.grade.startsWith("A") ? "bg-bull/10 text-bull-light" : "bg-warn/10 text-warn")}>{s.grade}</span>
            </div>
            <div className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", s.enabled ? "bg-accent" : "bg-surface-3")}>
              <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", s.enabled ? "left-5" : "left-0.5")} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div><span className="text-muted">Symbols</span><div className="text-foreground">{s.symbols}</div></div>
            <div><span className="text-muted">Frequency</span><div className="text-foreground">{s.frequency}</div></div>
            <div><span className="text-muted">Risk</span><div className="text-foreground">{s.risk}</div></div>
            <div><span className="text-muted">Win Rate</span><div className="text-bull-light font-medium">{s.winRate}</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsTab() {
  return (
    <div className="max-w-2xl space-y-5">
      <h3 className="text-lg font-semibold">Global Automation Settings</h3>
      <div className="glass-card p-6 space-y-4">
        <h4 className="text-sm font-semibold">Risk Controls</h4>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="text-xs text-muted-light mb-1.5 block">Max Daily Trades</label><input type="number" defaultValue="10" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
          <div><label className="text-xs text-muted-light mb-1.5 block">Max Daily Loss ($)</label><input type="number" defaultValue="200" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
          <div><label className="text-xs text-muted-light mb-1.5 block">Max Open Positions</label><input type="number" defaultValue="3" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
          <div><label className="text-xs text-muted-light mb-1.5 block">Max Spread (pips)</label><input type="number" defaultValue="2.0" step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
          <div><label className="text-xs text-muted-light mb-1.5 block">Pause After Losses</label><input type="number" defaultValue="3" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
          <div><label className="text-xs text-muted-light mb-1.5 block">Default Lot Size</label><input type="number" defaultValue="0.10" step="0.01" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
        </div>
      </div>
      <div className="glass-card p-6 space-y-3">
        <h4 className="text-sm font-semibold">Operating Mode</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {["Full Auto", "Semi Auto", "Paper Trade", "Demo Only"].map((mode, i) => (
            <button key={mode} className={cn("py-3 rounded-xl text-xs font-medium transition-smooth",
              i === 0 ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{mode}</button>
          ))}
        </div>
      </div>
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div><h4 className="text-sm font-semibold text-bear-light">Emergency Kill Switch</h4><p className="text-xs text-muted mt-1">Stop all trading immediately</p></div>
          <button className="px-6 py-3 rounded-xl bg-bear text-white text-sm font-bold transition-smooth hover:bg-bear-light">KILL SWITCH</button>
        </div>
      </div>
    </div>
  );
}

export default function AlgoHubPage() {
  const [tab, setTab] = useState<AlgoTab>("dashboard");
  const tabs: { id: AlgoTab; label: string }[] = [
    { id: "dashboard", label: "Bot Dashboard" },
    { id: "strategies", label: "Strategies" },
    { id: "settings", label: "Risk & Settings" },
    { id: "trades", label: "Trade History" },
    { id: "analytics", label: "Analytics" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">Algo Trading Hub</h1>
        <span className="flex items-center gap-1.5 text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">
          Paper Trade Mode
        </span>
      </div>
      <p className="text-xs text-muted">Enable live trading to see real data</p>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
              tab === t.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>{t.label}</button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "strategies" && <StrategiesTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "trades" && <div className="glass-card p-6 text-center text-muted">Full trade history with filters coming soon</div>}
      {tab === "analytics" && <div className="glass-card p-6 text-center text-muted">Performance analytics by strategy, symbol, and session coming soon</div>}
    </div>
  );
}
