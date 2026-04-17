"use client";

import { useState } from "react";
import { MarketCard } from "./MarketCard";
import { CurrencyStrengthPanel } from "./CurrencyStrengthPanel";
import type { MarketQuote, CurrencyStrength } from "@/lib/market-data";
import { MARKET_CATEGORIES } from "@/lib/constants";

interface Props {
  initialQuotes: MarketQuote[];
  initialStrength: CurrencyStrength[];
}

export function MarketRadarClient({ initialQuotes, initialStrength }: Props) {
  const [activeCategory, setActiveCategory] = useState("all");
  const quotes = initialQuotes;
  const strength = initialStrength;

  const filteredQuotes =
    activeCategory === "all"
      ? quotes
      : quotes.filter((q) => q.category === activeCategory);

  const topMovers = [...quotes]
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Market Radar</h1>
        <p className="text-sm text-muted mt-1">
          Real-time market overview across all supported instruments
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Total Markets</div>
          <div className="text-xl font-bold text-foreground">{quotes.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Bullish</div>
          <div className="text-xl font-bold text-bull-light">
            {quotes.filter((q) => q.changePercent > 0).length}
          </div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Bearish</div>
          <div className="text-xl font-bold text-bear-light">
            {quotes.filter((q) => q.changePercent < 0).length}
          </div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Strongest</div>
          <div className="text-xl font-bold text-accent-light">
            {strength[0]?.currency || "—"}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column - Market cards */}
        <div className="lg:col-span-2 space-y-4">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {MARKET_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-smooth ${
                  activeCategory === cat.id
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Market grid */}
          {filteredQuotes.length > 0 ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredQuotes.map((quote) => (
                <MarketCard key={quote.symbol} quote={quote} />
              ))}
            </div>
          ) : (
            <div className="glass-card p-12 text-center">
              <p className="text-muted">
                Market data loading... The system scans markets continuously and
                will display live data when available.
              </p>
            </div>
          )}
        </div>

        {/* Right column - Panels */}
        <div className="space-y-4">
          <CurrencyStrengthPanel data={strength} />

          {/* Top movers */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Top Movers
            </h3>
            <div className="space-y-3">
              {topMovers.map((q) => (
                <div key={q.symbol} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {q.displayName}
                    </span>
                    <span className="text-xs text-muted ml-2 capitalize">
                      {q.category}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-mono font-medium ${
                      q.changePercent >= 0 ? "text-bull-light" : "text-bear-light"
                    }`}
                  >
                    {q.changePercent >= 0 ? "+" : ""}
                    {q.changePercent.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick market pulse */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Market Pulse
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Strongest Currency</span>
                <span className="text-bull-light font-medium">
                  {strength[0]?.currency || "—"} ({strength[0]?.score.toFixed(1)})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Weakest Currency</span>
                <span className="text-bear-light font-medium">
                  {strength[strength.length - 1]?.currency || "—"} ({strength[strength.length - 1]?.score.toFixed(1)})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Most Volatile</span>
                <span className="text-warn font-medium">
                  {topMovers[0]?.displayName || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
