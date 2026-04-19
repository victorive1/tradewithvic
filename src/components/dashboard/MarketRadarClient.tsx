"use client";

import { useState } from "react";
import { MarketCard } from "./MarketCard";
import { CurrencyStrengthPanel } from "./CurrencyStrengthPanel";
import { SetupCard } from "./SetupCard";
import type { MarketQuote, CurrencyStrength } from "@/lib/market-data";
import type { TradeSetup } from "@/lib/setup-engine";
import { MARKET_CATEGORIES } from "@/lib/constants";

interface Props {
  initialQuotes: MarketQuote[];
  initialStrength: CurrencyStrength[];
  initialSetups?: TradeSetup[];
}

export function MarketRadarClient({ initialQuotes, initialStrength, initialSetups = [] }: Props) {
  const [activeCategory, setActiveCategory] = useState("all");
  const quotes = initialQuotes;
  const strength = initialStrength;
  const setups = initialSetups;

  const filteredQuotes =
    activeCategory === "all"
      ? quotes
      : quotes.filter((q) => q.category === activeCategory);

  // Trade Setups panel: only A and A+ grade setups, respecting the same
  // category filter as the market cards above.
  const highGradeSetups = setups
    .filter((s) => s.qualityGrade === "A" || s.qualityGrade === "A+")
    .filter((s) => activeCategory === "all" ? true : s.category === activeCategory)
    .sort((a, b) => {
      // A+ before A, then by confidence descending
      if (a.qualityGrade !== b.qualityGrade) return a.qualityGrade === "A+" ? -1 : 1;
      return b.confidenceScore - a.confidenceScore;
    });
  const aPlusCount = highGradeSetups.filter((s) => s.qualityGrade === "A+").length;
  const aCount = highGradeSetups.length - aPlusCount;

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

          {/* High-grade trade setups, built from the same market data */}
          <div className="pt-2">
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-foreground">A / A+ Trade Setups</h2>
                <p className="text-xs text-muted mt-0.5">
                  High-conviction setups derived from the Market Radar feed
                  {activeCategory !== "all" && ` · ${activeCategory} only`}
                </p>
              </div>
              {highGradeSetups.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  {aPlusCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/40 font-bold">
                      {aPlusCount} A+
                    </span>
                  )}
                  {aCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/40 font-bold">
                      {aCount} A
                    </span>
                  )}
                </div>
              )}
            </div>
            {highGradeSetups.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <p className="text-sm text-muted">
                  No A or A+ setups {activeCategory !== "all" ? `in ${activeCategory}` : "right now"}.
                  The engine flags a setup only when trend, structure, liquidity, and momentum line up.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {highGradeSetups.map((setup) => (
                  <SetupCard key={setup.id} setup={setup} />
                ))}
              </div>
            )}
          </div>
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
