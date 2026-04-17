"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "connect" | "account" | "execute" | "positions" | "orders" | "history";

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

function AccountTab({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="glass-card p-12 text-center space-y-4">
      <div className="text-4xl mb-2">&#128274;</div>
      <h3 className="text-lg font-semibold text-foreground">No account connected</h3>
      <p className="text-sm text-muted max-w-md mx-auto">
        Connect your MT4/MT5 account to see live balance, equity, and positions.
      </p>
      <button
        onClick={onConnect}
        className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent"
      >
        Connect Account
      </button>
    </div>
  );
}

function PositionsTab() {
  return (
    <div className="glass-card p-12 text-center space-y-3">
      <div className="text-4xl mb-2">&#128202;</div>
      <h3 className="text-base font-semibold text-foreground">No open positions</h3>
      <p className="text-sm text-muted max-w-md mx-auto">
        Connect a trading account and execute trades to see live positions here.
      </p>
    </div>
  );
}

function HistoryTab() {
  return (
    <div className="glass-card p-12 text-center space-y-3">
      <div className="text-4xl mb-2">&#128203;</div>
      <h3 className="text-base font-semibold text-foreground">No trade history yet</h3>
      <p className="text-sm text-muted max-w-md mx-auto">
        Your executed trades will appear here once you start trading.
      </p>
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
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">Trading Hub</h1>
        </div>
        <p className="text-sm text-muted mt-1">Connect your MetaTrader account and execute trades directly from TradeWithVic App</p>
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
      {tab === "account" && <AccountTab onConnect={() => setTab("connect")} />}
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
