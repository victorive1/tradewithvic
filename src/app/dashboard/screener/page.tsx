"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ScreenerRow {
  symbol: string;
  category: string;
  price: string;
  trend: string;
  volatility: string;
  setup: string;
  confidence: number;
  keyLevel: string;
  change: string;
}

function buildScreenerRows(quotes: any[]): ScreenerRow[] {
  return quotes.map((q: any) => {
    const pct = q.changePercent ?? 0;
    const absPct = Math.abs(pct);
    const trend = pct > 0.3 ? "Bullish" : pct < -0.3 ? "Bearish" : "Range";
    const volatility = absPct >= 1.5 ? "High" : absPct >= 0.5 ? "Medium" : "Low";
    const confidence = Math.min(95, Math.round(40 + absPct * 20 + (trend !== "Range" ? 10 : 0)));
    const setup = absPct >= 1.5 ? "Breakout" : trend === "Range" ? "Compression" : pct > 0 ? "Continuation" : "Pullback";
    const keyLevel = q.high ? q.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
    return {
      symbol: q.displayName || q.symbol,
      category: q.category || "Forex",
      price: q.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "--",
      trend,
      volatility,
      setup,
      confidence,
      keyLevel,
      change: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
    };
  });
}

type SortKey = "confidence" | "volatility" | "change";

export default function ScreenerPage() {
  const [sortBy, setSortBy] = useState<SortKey>("confidence");
  const [filterCat, setFilterCat] = useState("all");
  const [filterTrend, setFilterTrend] = useState("all");
  const [screenerData, setScreenerData] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    fetch("/api/market/quotes")
      .then((res) => res.json())
      .then((data) => {
        if (data.quotes) {
          setScreenerData(buildScreenerRows(data.quotes));
          setLastUpdated(new Date(data.timestamp).toLocaleTimeString());
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        {lastUpdated && <p className="text-xs text-muted mt-1">Live data — last updated {lastUpdated}</p>}
        {loading && <p className="text-xs text-accent-light mt-1">Loading live market data...</p>}
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
