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

const recentTrades = [
  { time: "14:32", symbol: "XAU/USD", strategy: "Elite Price Action", side: "Buy", lot: 0.10, pnl: "+$68.00", status: "Open" },
  { time: "13:15", symbol: "GBP/JPY", strategy: "Liquidity Sweep", side: "Sell", lot: 0.10, pnl: "+$45.20", status: "Closed" },
  { time: "11:42", symbol: "NAS100", strategy: "Breakout FVG", side: "Buy", lot: 0.05, pnl: "+$22.50", status: "Open" },
  { time: "10:08", symbol: "EUR/USD", strategy: "Elite Price Action", side: "Sell", lot: 0.05, pnl: "-$18.00", status: "Closed" },
  { time: "09:30", symbol: "USD/JPY", strategy: "Elite Pullback", side: "Buy", lot: 0.10, pnl: "+$35.00", status: "Closed" },
];

const eventLog = [
  { time: "14:32", type: "trade", msg: "Elite Price Action detected BUY on XAU/USD \u2014 executed at 3,278.40" },
  { time: "14:28", type: "skip", msg: "Skipped EUR/USD setup: spread too high (2.8 pips > max 1.5)" },
  { time: "14:15", type: "info", msg: "Breakout FVG scanning... 3 candidates detected" },
  { time: "13:42", type: "management", msg: "Moved SL to break-even on GBP/JPY position" },
  { time: "13:15", type: "trade", msg: "Closed GBP/JPY SELL at +$45.20 \u2014 TP1 hit" },
  { time: "12:45", type: "warning", msg: "Daily loss limit 60% utilized \u2014 reducing position sizes" },
  { time: "11:42", type: "trade", msg: "Breakout FVG detected BUY on NAS100 \u2014 executed" },
];

function DashboardTab() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Status</div><div className="flex items-center justify-center gap-2"><span className="w-2 h-2 rounded-full bg-bull pulse-live" /><span className="text-sm font-bold text-bull-light">Running</span></div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Today P&L</div><div className="text-lg font-bold text-bull-light">+$152.70</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Trades Today</div><div className="text-lg font-bold">5</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Win Rate</div><div className="text-lg font-bold text-accent-light">80%</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Active Strategies</div><div className="text-lg font-bold">3</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent trades */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Recent Trades</h3>
          <div className="space-y-2">
            {recentTrades.map((t, i) => (
              <div key={i} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-muted">{t.time}</span>
                  <span className="text-xs font-medium">{t.symbol}</span>
                  <span className={cn("text-[10px] font-bold", t.side === "Buy" ? "text-bull-light" : "text-bear-light")}>{t.side}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("text-xs font-bold font-mono", t.pnl.startsWith("+") ? "text-bull-light" : "text-bear-light")}>{t.pnl}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded", t.status === "Open" ? "bg-bull/10 text-bull-light" : "bg-surface-3 text-muted")}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Event log */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Event Log</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {eventLog.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="font-mono text-muted w-12 flex-shrink-0">{e.time}</span>
                <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                  e.type === "trade" ? "bg-bull" : e.type === "skip" ? "bg-warn" : e.type === "warning" ? "bg-bear" : "bg-muted")} />
                <span className="text-muted-light">{e.msg}</span>
              </div>
            ))}
          </div>
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
        <span className="flex items-center gap-1.5 text-xs bg-bull/10 text-bull-light px-2.5 py-1 rounded-full border border-bull/20">
          <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Running
        </span>
      </div>

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
