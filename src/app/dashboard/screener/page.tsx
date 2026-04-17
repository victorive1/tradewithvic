"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const screenerData = [
  { symbol: "XAU/USD", category: "Metals", price: "3,284.50", trend: "Bullish", volatility: "High", setup: "Breakout", confidence: 87, keyLevel: "3,298", change: "+1.42%" },
  { symbol: "GBP/JPY", category: "Forex", price: "191.42", trend: "Bearish", volatility: "High", setup: "Pullback", confidence: 79, keyLevel: "190.80", change: "-0.68%" },
  { symbol: "NAS100", category: "Indices", price: "19,432", trend: "Bullish", volatility: "Medium", setup: "Continuation", confidence: 74, keyLevel: "19,500", change: "+0.85%" },
  { symbol: "EUR/USD", category: "Forex", price: "1.0842", trend: "Bearish", volatility: "Low", setup: "Reversal", confidence: 68, keyLevel: "1.0800", change: "-0.32%" },
  { symbol: "BTC/USD", category: "Crypto", price: "84,215", trend: "Range", volatility: "Medium", setup: "Compression", confidence: 61, keyLevel: "85,000", change: "+0.21%" },
  { symbol: "US Oil", category: "Energy", price: "62.40", trend: "Bullish", volatility: "Medium", setup: "Breakout", confidence: 72, keyLevel: "63.50", change: "+1.15%" },
  { symbol: "GBP/USD", category: "Forex", price: "1.3042", trend: "Bullish", volatility: "Low", setup: "Pullback", confidence: 65, keyLevel: "1.3080", change: "+0.18%" },
  { symbol: "USD/JPY", category: "Forex", price: "142.85", trend: "Bearish", volatility: "Medium", setup: "Continuation", confidence: 71, keyLevel: "142.00", change: "-0.45%" },
  { symbol: "ETH/USD", category: "Crypto", price: "1,625", trend: "Bearish", volatility: "High", setup: "Reversal", confidence: 58, keyLevel: "1,600", change: "-2.15%" },
  { symbol: "XAG/USD", category: "Metals", price: "32.45", trend: "Bullish", volatility: "High", setup: "Breakout", confidence: 76, keyLevel: "33.00", change: "+1.88%" },
];

type SortKey = "confidence" | "volatility" | "change";

export default function ScreenerPage() {
  const [sortBy, setSortBy] = useState<SortKey>("confidence");
  const [filterCat, setFilterCat] = useState("all");
  const [filterTrend, setFilterTrend] = useState("all");

  let filtered = screenerData;
  if (filterCat !== "all") filtered = filtered.filter((d) => d.category.toLowerCase() === filterCat);
  if (filterTrend !== "all") filtered = filtered.filter((d) => d.trend.toLowerCase() === filterTrend);

  if (sortBy === "confidence") filtered = [...filtered].sort((a, b) => b.confidence - a.confidence);
  else if (sortBy === "change") filtered = [...filtered].sort((a, b) => Math.abs(parseFloat(b.change)) - Math.abs(parseFloat(a.change)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Market Screener</h1>
        <p className="text-sm text-muted mt-1">Scan and filter all markets by trend, volatility, setup type, and confidence</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", "forex", "metals", "energy", "indices", "crypto"].map((cat) => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth capitalize",
              filterCat === cat ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
            {cat === "all" ? "All Markets" : cat}
          </button>
        ))}
        <div className="w-px bg-border mx-1" />
        {["all", "bullish", "bearish", "range"].map((t) => (
          <button key={t} onClick={() => setFilterTrend(t)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth capitalize",
              filterTrend === t ? "bg-surface-3 text-foreground border border-border-light" : "text-muted hover:text-muted-light")}>
            {t === "all" ? "All Trends" : t}
          </button>
        ))}
      </div>

      <div className="flex gap-2 text-xs">
        <span className="text-muted">Sort by:</span>
        {[
          { key: "confidence" as SortKey, label: "Confidence" },
          { key: "change" as SortKey, label: "Biggest Move" },
        ].map((s) => (
          <button key={s.key} onClick={() => setSortBy(s.key)}
            className={cn("px-2 py-1 rounded transition-smooth", sortBy === s.key ? "bg-accent/20 text-accent-light" : "text-muted hover:text-muted-light")}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-xs text-muted font-medium px-5 py-3">Instrument</th>
                <th className="text-left text-xs text-muted font-medium px-3 py-3">Price</th>
                <th className="text-left text-xs text-muted font-medium px-3 py-3">Change</th>
                <th className="text-left text-xs text-muted font-medium px-3 py-3">Trend</th>
                <th className="text-left text-xs text-muted font-medium px-3 py-3">Volatility</th>
                <th className="text-left text-xs text-muted font-medium px-3 py-3">Setup</th>
                <th className="text-left text-xs text-muted font-medium px-3 py-3">Confidence</th>
                <th className="text-left text-xs text-muted font-medium px-3 py-3">Key Level</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.symbol} className="border-b border-border/20 hover:bg-surface-2/50 transition-smooth cursor-pointer">
                  <td className="px-5 py-4">
                    <div className="text-sm font-semibold text-foreground">{row.symbol}</div>
                    <div className="text-xs text-muted">{row.category}</div>
                  </td>
                  <td className="px-3 py-4 text-sm font-mono text-foreground">{row.price}</td>
                  <td className="px-3 py-4">
                    <span className={cn("text-sm font-medium", row.change.startsWith("+") ? "text-bull-light" : "text-bear-light")}>{row.change}</span>
                  </td>
                  <td className="px-3 py-4">
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
                      row.trend === "Bullish" ? "badge-bull" : row.trend === "Bearish" ? "badge-bear" : "badge-neutral")}>{row.trend}</span>
                  </td>
                  <td className="px-3 py-4">
                    <span className={cn("text-xs", row.volatility === "High" ? "text-warn" : row.volatility === "Medium" ? "text-muted-light" : "text-muted")}>{row.volatility}</span>
                  </td>
                  <td className="px-3 py-4 text-xs text-muted-light">{row.setup}</td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <div className={cn("h-full rounded-full", row.confidence >= 75 ? "bg-bull" : row.confidence >= 60 ? "bg-accent" : "bg-warn")}
                          style={{ width: `${row.confidence}%` }} />
                      </div>
                      <span className="text-xs font-mono text-muted-light">{row.confidence}</span>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-xs font-mono text-accent-light">{row.keyLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
