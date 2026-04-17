"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "connect" | "account" | "execute" | "positions" | "orders" | "history";

const mockPositions = [
  { ticket: "10284561", symbol: "XAU/USD", side: "Buy", lot: 0.10, entry: 3278.40, current: 3285.20, sl: 3268.00, tp: 3298.00, pnl: 68.00, pnlPct: 0.68, duration: "45m" },
  { ticket: "10284580", symbol: "NAS100", side: "Buy", lot: 0.05, entry: 19380, current: 19425, sl: 19280, tp: 19520, pnl: 22.50, pnlPct: 0.23, duration: "22m" },
];

const mockHistory = [
  { ticket: "10284520", symbol: "GBP/JPY", side: "Sell", lot: 0.10, entry: 191.85, exit: 191.20, pnl: 65.00, result: "Win", closed: "2h ago" },
  { ticket: "10284510", symbol: "EUR/USD", side: "Sell", lot: 0.05, entry: 1.0855, exit: 1.0830, pnl: 12.50, result: "Win", closed: "4h ago" },
  { ticket: "10284490", symbol: "USD/JPY", side: "Buy", lot: 0.10, entry: 143.20, exit: 142.85, pnl: -35.00, result: "Loss", closed: "6h ago" },
];

function ConnectTab() {
  const [platform, setPlatform] = useState<"MT4" | "MT5">("MT5");
  return (
    <div className="max-w-lg mx-auto space-y-5">
      <h3 className="text-lg font-semibold text-foreground">Connect MetaTrader Account</h3>
      <div className="flex gap-2">
        {(["MT4", "MT5"] as const).map((p) => (
          <button key={p} onClick={() => setPlatform(p)}
            className={cn("flex-1 py-3 rounded-xl text-sm font-medium transition-smooth",
              platform === p ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{p}</button>
        ))}
      </div>
      <div><label className="text-xs text-muted-light mb-1.5 block">Account Login</label>
        <input type="text" placeholder="e.g. 5042885676" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
      <div><label className="text-xs text-muted-light mb-1.5 block">Password</label>
        <input type="password" placeholder="Account password" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
      <div><label className="text-xs text-muted-light mb-1.5 block">Broker Server</label>
        <input type="text" placeholder="e.g. ICMarkets-Demo" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" defaultChecked className="w-4 h-4 accent-accent" /><span className="text-xs text-muted-light">Save to my profile</span></label>
      <div className="flex gap-3">
        <button className="flex-1 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm font-medium transition-smooth hover:border-accent">Test Connection</button>
        <button className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent">Connect</button>
      </div>
    </div>
  );
}

function AccountTab() {
  return (
    <div className="space-y-4">
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-bull pulse-live" />
            <span className="text-sm font-semibold text-foreground">Connected</span>
            <span className="text-xs bg-surface-2 px-2 py-0.5 rounded text-muted">MT5</span>
            <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded border border-bull/20">Demo</span>
          </div>
          <button className="text-xs text-bear-light hover:text-bear">Disconnect</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface-2 rounded-xl p-4 text-center"><div className="text-xs text-muted mb-1">Balance</div><div className="text-lg font-bold font-mono">$10,245.80</div></div>
          <div className="bg-surface-2 rounded-xl p-4 text-center"><div className="text-xs text-muted mb-1">Equity</div><div className="text-lg font-bold font-mono text-bull-light">$10,336.30</div></div>
          <div className="bg-surface-2 rounded-xl p-4 text-center"><div className="text-xs text-muted mb-1">Free Margin</div><div className="text-lg font-bold font-mono">$9,812.50</div></div>
          <div className="bg-surface-2 rounded-xl p-4 text-center"><div className="text-xs text-muted mb-1">Leverage</div><div className="text-lg font-bold font-mono">1:500</div></div>
        </div>
      </div>
      <div className="glass-card p-5 text-xs text-muted space-y-1">
        <div className="flex justify-between"><span>Broker</span><span className="text-foreground">ICMarkets</span></div>
        <div className="flex justify-between"><span>Server</span><span className="text-foreground">ICMarkets-Demo</span></div>
        <div className="flex justify-between"><span>Account</span><span className="text-foreground font-mono">5042885676</span></div>
        <div className="flex justify-between"><span>Last Sync</span><span className="text-foreground">2 seconds ago</span></div>
      </div>
    </div>
  );
}

function PositionsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Open Positions ({mockPositions.length})</h3>
        <span className="text-xs text-muted">Live P&L</span>
      </div>
      {mockPositions.map((pos) => (
        <div key={pos.ticket} className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">{pos.symbol}</span>
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", pos.side === "Buy" ? "badge-bull" : "badge-bear")}>{pos.side}</span>
              <span className="text-xs text-muted">{pos.lot} lots</span>
            </div>
            <span className={cn("text-lg font-bold font-mono", pos.pnl >= 0 ? "text-bull-light" : "text-bear-light")}>
              {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-3 text-xs">
            <div><span className="text-muted">Entry</span><div className="font-mono text-foreground">{pos.entry}</div></div>
            <div><span className="text-muted">Current</span><div className="font-mono text-foreground">{pos.current}</div></div>
            <div><span className="text-bear-light">SL</span><div className="font-mono text-bear-light">{pos.sl}</div></div>
            <div><span className="text-bull-light">TP</span><div className="font-mono text-bull-light">{pos.tp}</div></div>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg text-xs bg-bear/10 text-bear-light border border-bear/20 hover:bg-bear/20 transition-smooth">Close</button>
            <button className="px-3 py-1.5 rounded-lg text-xs bg-surface-2 text-muted-light border border-border/50 hover:border-border-light transition-smooth">Move SL</button>
            <button className="px-3 py-1.5 rounded-lg text-xs bg-surface-2 text-muted-light border border-border/50 hover:border-border-light transition-smooth">Move TP</button>
            <button className="px-3 py-1.5 rounded-lg text-xs bg-surface-2 text-muted-light border border-border/50 hover:border-border-light transition-smooth">Break-Even</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryTab() {
  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full">
        <thead><tr className="border-b border-border/50">
          <th className="text-left text-xs text-muted font-medium px-4 py-3">Ticket</th>
          <th className="text-left text-xs text-muted font-medium px-3 py-3">Symbol</th>
          <th className="text-left text-xs text-muted font-medium px-3 py-3">Side</th>
          <th className="text-left text-xs text-muted font-medium px-3 py-3">Entry</th>
          <th className="text-left text-xs text-muted font-medium px-3 py-3">Exit</th>
          <th className="text-left text-xs text-muted font-medium px-3 py-3">P&L</th>
          <th className="text-left text-xs text-muted font-medium px-3 py-3">Result</th>
        </tr></thead>
        <tbody>
          {mockHistory.map((h) => (
            <tr key={h.ticket} className="border-b border-border/20">
              <td className="px-4 py-3 text-xs font-mono text-muted">{h.ticket}</td>
              <td className="px-3 py-3 text-sm font-medium">{h.symbol}</td>
              <td className="px-3 py-3"><span className={cn("text-xs font-medium", h.side === "Buy" ? "text-bull-light" : "text-bear-light")}>{h.side}</span></td>
              <td className="px-3 py-3 text-xs font-mono">{h.entry}</td>
              <td className="px-3 py-3 text-xs font-mono">{h.exit}</td>
              <td className="px-3 py-3 text-sm font-mono font-medium"><span className={h.pnl >= 0 ? "text-bull-light" : "text-bear-light"}>{h.pnl >= 0 ? "+" : ""}${h.pnl.toFixed(2)}</span></td>
              <td className="px-3 py-3"><span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", h.result === "Win" ? "badge-bull" : "badge-bear")}>{h.result}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TradingHubPage() {
  const [tab, setTab] = useState<Tab>("account");
  const tabs: { id: Tab; label: string }[] = [
    { id: "connect", label: "Connect" },
    { id: "account", label: "Account" },
    { id: "execute", label: "Manual Trade" },
    { id: "positions", label: "Positions" },
    { id: "orders", label: "Orders" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Trading Hub</h1>
        <p className="text-sm text-muted mt-1">Connect your MetaTrader account and execute trades directly from TradeWithVic</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
              tab === t.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "connect" && <ConnectTab />}
      {tab === "account" && <AccountTab />}
      {tab === "execute" && (
        <div className="max-w-lg mx-auto glass-card p-6 space-y-4">
          <h3 className="text-lg font-semibold">Place Manual Trade</h3>
          <div><label className="text-xs text-muted-light mb-1.5 block">Symbol</label>
            <select className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border text-sm text-foreground">
              <option>XAU/USD</option><option>EUR/USD</option><option>GBP/USD</option><option>NAS100</option><option>BTC/USD</option>
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <button className="py-3 rounded-xl bg-bull/20 text-bull-light border border-bull/30 text-sm font-bold hover:bg-bull/30 transition-smooth">BUY</button>
            <button className="py-3 rounded-xl bg-bear/20 text-bear-light border border-bear/30 text-sm font-bold hover:bg-bear/30 transition-smooth">SELL</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-light mb-1.5 block">Lot Size</label>
              <input type="number" step="0.01" defaultValue="0.10" className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
            <div><label className="text-xs text-bear-light mb-1.5 block">Stop Loss</label>
              <input type="number" step="0.01" className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-bear/20 focus:border-bear focus:outline-none text-sm text-foreground font-mono" /></div>
            <div><label className="text-xs text-bull-light mb-1.5 block">Take Profit</label>
              <input type="number" step="0.01" className="w-full px-3 py-3 rounded-xl bg-surface-2 border border-bull/20 focus:border-bull focus:outline-none text-sm text-foreground font-mono" /></div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted">Est. Risk</span><span className="text-bear-light">$100.00</span></div>
            <div className="flex justify-between"><span className="text-muted">Margin Required</span><span className="text-foreground">$523.80</span></div>
          </div>
          <button className="w-full py-3.5 rounded-xl bg-accent text-white font-semibold text-sm transition-smooth glow-accent">Place Trade</button>
        </div>
      )}
      {tab === "positions" && <PositionsTab />}
      {tab === "orders" && <div className="glass-card p-12 text-center"><p className="text-muted">No pending orders</p></div>}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}
