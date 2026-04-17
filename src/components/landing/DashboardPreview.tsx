"use client";

import { useState, useEffect } from "react";

interface QuoteData { symbol: string; displayName: string; price: number; changePercent: number; category: string; }
interface StrengthData { currency: string; score: number; }

export function DashboardPreview() {
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [strength, setStrength] = useState<StrengthData[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/market/quotes");
        if (!res.ok) return;
        const data = await res.json();
        if (data.quotes) setQuotes(data.quotes.slice(0, 4));
        if (data.currencyStrength) setStrength(data.currencyStrength.slice(0, 4));
      } catch { /* silent */ }
    }
    load();
  }, []);

  const topSetups = quotes.map((q) => ({
    pair: q.displayName,
    dir: q.changePercent > 0 ? "Bullish" : "Bearish",
    score: Math.min(95, Math.max(55, Math.round(50 + Math.abs(q.changePercent) * 15))),
    grade: Math.abs(q.changePercent) > 0.5 ? "A+" : Math.abs(q.changePercent) > 0.2 ? "A" : "B+",
    price: q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: q.category === "forex" ? 5 : 2 }),
  }));

  return (
    <section className="relative py-24 overflow-hidden">
      <div className="orb w-[600px] h-[600px] bg-accent/10 top-0 left-1/2 -translate-x-1/2" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Your Market <span className="gradient-text-accent">Command Center</span></h2>
          <p className="text-muted-light text-lg max-w-2xl mx-auto">Powerful, organized, and easy to use. Everything you need to make better trading decisions.</p>
        </div>

        <div className="glass-card p-6 sm:p-8 glow-accent max-w-5xl mx-auto">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-bull pulse-live" />
                <span className="text-sm font-medium text-foreground">Market Radar</span>
                <span className="text-xs text-muted">Live</span>
              </div>
              <div className="flex gap-2">
                {["All", "Forex", "Metals", "Indices", "Crypto"].map((tab) => (
                  <span key={tab} className={`text-xs px-3 py-1 rounded-lg ${tab === "All" ? "bg-accent/20 text-accent-light" : "text-muted hover:text-muted-light"}`}>{tab}</span>
                ))}
              </div>
            </div>

            {topSetups.length > 0 ? topSetups.map((setup) => (
              <div key={setup.pair} className="col-span-6 lg:col-span-3 bg-surface-2 rounded-xl p-4 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{setup.pair}</span>
                  <span className={`text-xs font-medium ${setup.dir === "Bullish" ? "text-bull-light" : "text-bear-light"}`}>{setup.dir}</span>
                </div>
                <div className="text-xl font-bold mb-2">{setup.price}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Score: {setup.score}</span>
                  <span className={`text-xs font-bold ${setup.grade.startsWith("A") ? "text-bull-light" : "text-warn"}`}>{setup.grade}</span>
                </div>
              </div>
            )) : (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="col-span-6 lg:col-span-3 bg-surface-2 rounded-xl p-4 border border-border/50 animate-pulse">
                  <div className="h-4 bg-surface-3 rounded mb-2 w-20" />
                  <div className="h-6 bg-surface-3 rounded mb-2 w-24" />
                  <div className="h-3 bg-surface-3 rounded w-16" />
                </div>
              ))
            )}

            <div className="col-span-12 lg:col-span-8 bg-surface-2 rounded-xl p-4 border border-border/50 mt-2">
              <div className="text-sm font-medium mb-3">Currency Strength</div>
              <div className="space-y-2">
                {strength.length > 0 ? strength.map((c) => (
                  <div key={c.currency} className="flex items-center gap-3">
                    <span className="text-xs text-muted w-8">{c.currency}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light" style={{ width: `${c.score}%` }} />
                    </div>
                    <span className="text-xs text-muted-light w-8">{c.score.toFixed(0)}</span>
                  </div>
                )) : (
                  [1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-3 bg-surface-3 rounded w-8" />
                      <div className="flex-1 h-2 rounded-full bg-surface-3" />
                      <div className="h-3 bg-surface-3 rounded w-8" />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="col-span-12 lg:col-span-4 bg-surface-2 rounded-xl p-4 border border-border/50 mt-2">
              <div className="text-sm font-medium mb-3">Top Movers</div>
              <div className="space-y-3">
                {quotes.length > 0 ? [...quotes].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 3).map((q) => (
                  <div key={q.symbol} className="flex items-center justify-between">
                    <span className="text-xs text-muted-light">{q.displayName}</span>
                    <span className={`text-xs font-medium ${q.changePercent >= 0 ? "text-bull-light" : "text-bear-light"}`}>
                      {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                    </span>
                  </div>
                )) : (
                  [1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="h-3 bg-surface-3 rounded w-16" />
                      <div className="h-3 bg-surface-3 rounded w-12" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
