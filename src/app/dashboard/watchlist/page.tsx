"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

const watchlistItems = [
  { symbol: "XAUUSD", displayName: "XAU/USD", category: "metals", price: "3,284.50", change: "+1.42%", trend: "Bullish", alert: true },
  { symbol: "EURUSD", displayName: "EUR/USD", category: "forex", price: "1.0842", change: "-0.32%", trend: "Bearish", alert: false },
  { symbol: "NAS100", displayName: "NAS100", category: "indices", price: "19,432.1", change: "+0.85%", trend: "Bullish", alert: true },
  { symbol: "BTCUSD", displayName: "BTC/USD", category: "crypto", price: "84,215", change: "+0.21%", trend: "Range", alert: false },
  { symbol: "GBPJPY", displayName: "GBP/JPY", category: "forex", price: "191.42", change: "-0.68%", trend: "Bearish", alert: false },
  { symbol: "USOIL", displayName: "US Oil", category: "energy", price: "62.40", change: "+1.15%", trend: "Bullish", alert: true },
];

export default function WatchlistPage() {
  const [items, setItems] = useState(watchlistItems);
  const [showAdd, setShowAdd] = useState(false);

  function removeItem(symbol: string) {
    setItems(items.filter((i) => i.symbol !== symbol));
  }

  function addItem(symbol: string) {
    const inst = ALL_INSTRUMENTS.find((i) => i.symbol === symbol);
    if (inst && !items.find((i) => i.symbol === symbol)) {
      setItems([...items, {
        symbol: inst.symbol, displayName: inst.displayName, category: inst.category,
        price: "—", change: "0.00%", trend: "—", alert: false,
      }]);
    }
    setShowAdd(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Watchlist</h1>
          <p className="text-sm text-muted mt-1">Track your favorite instruments in one view</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-light text-white text-sm font-medium transition-smooth">
          + Add Instrument
        </button>
      </div>

      {showAdd && (
        <div className="glass-card p-4">
          <p className="text-xs text-muted mb-3">Select instrument to add:</p>
          <div className="flex flex-wrap gap-2">
            {ALL_INSTRUMENTS.filter((i) => !items.find((w) => w.symbol === i.symbol)).map((inst) => (
              <button key={inst.symbol} onClick={() => addItem(inst.symbol)}
                className="px-3 py-1.5 rounded-lg text-xs bg-surface-2 text-muted-light border border-border/50 hover:border-accent hover:text-accent-light transition-smooth">
                {inst.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.symbol} className="glass-card glass-card-hover p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-sm font-semibold text-foreground">{item.displayName}</div>
                <div className="text-xs text-muted capitalize">{item.category}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-foreground font-mono">{item.price}</div>
            </div>
            <div>
              <span className={cn("text-sm font-medium", item.change.startsWith("+") ? "text-bull-light" : item.change.startsWith("-") ? "text-bear-light" : "text-muted")}>
                {item.change}
              </span>
            </div>
            <div>
              <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full",
                item.trend === "Bullish" ? "badge-bull" : item.trend === "Bearish" ? "badge-bear" : "badge-neutral")}>
                {item.trend}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {item.alert && (
                <span className="w-2 h-2 rounded-full bg-accent pulse-live" title="Alert active" />
              )}
              <button onClick={() => removeItem(item.symbol)} className="text-muted hover:text-bear-light transition-smooth p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-muted">Your watchlist is empty. Add instruments to start tracking them.</p>
        </div>
      )}
    </div>
  );
}
