"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface VolRow {
  symbol: string;
  spike: string;
  atr: string;
  regime: string;
  session: string;
  status: string;
}

function getSession(): string {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7) return "Asia";
  if (h >= 7 && h < 12) return "London";
  if (h >= 12 && h < 17) return "NY";
  if (h >= 17 && h < 21) return "NY Close";
  return "Asia";
}

function buildVolatilityRows(quotes: any[]): VolRow[] {
  return quotes.map((q: any) => {
    const absPct = Math.abs(q.changePercent ?? 0);
    const range = q.high && q.low ? Math.abs(q.high - q.low) : 0;
    const regime = absPct >= 1.5 ? "Expanding" : absPct >= 0.8 ? "Normal-High" : absPct >= 0.3 ? "Normal" : absPct >= 0.1 ? "Compressed" : "Low";
    const status = absPct >= 1.5 ? "Breakout conditions" : absPct >= 1.0 ? "High momentum" : absPct >= 0.5 ? "Above average" : absPct >= 0.2 ? "Moderate" : "Dead zone";
    return {
      symbol: q.displayName || q.symbol,
      spike: `+${Math.round(absPct * 20)}%`,
      atr: range.toFixed(range < 1 ? 4 : 2),
      regime,
      session: getSession(),
      status,
    };
  });
}

export default function VolatilityPage() {
  const [volatilityData, setVolatilityData] = useState<VolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    fetch("/api/market/quotes")
      .then((res) => res.json())
      .then((data) => {
        if (data.quotes) {
          setVolatilityData(buildVolatilityRows(data.quotes));
          setLastUpdated(new Date(data.timestamp).toLocaleTimeString());
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...volatilityData].sort((a, b) => parseInt(b.spike) - parseInt(a.spike));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Volatility Scanner</h1>
        <p className="text-sm text-muted mt-1">Detect pairs with unusual volatility expansion or compression</p>
        {lastUpdated && <p className="text-xs text-muted mt-1">Live data — last updated {lastUpdated}</p>}
        {loading && <p className="text-xs text-accent-light mt-1">Loading live market data...</p>}
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Highest Spike</div>
          <div className="text-2xl font-black text-warn">{sorted[0]?.symbol}</div>
          <div className="text-sm text-warn">{sorted[0]?.spike}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Expanding</div>
          <div className="text-2xl font-bold text-foreground">{sorted.filter((d) => d.regime.includes("Expand")).length}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Compressed</div>
          <div className="text-2xl font-bold text-accent-light">{sorted.filter((d) => d.regime.includes("Compress") || d.regime === "Low").length}</div>
          <div className="text-xs text-muted">Pre-breakout watch</div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border/50">
              <th className="text-left text-xs text-muted font-medium px-4 py-3">Pair</th>
              <th className="text-left text-xs text-muted font-medium px-3 py-3">Volatility Spike</th>
              <th className="text-left text-xs text-muted font-medium px-3 py-3">ATR</th>
              <th className="text-left text-xs text-muted font-medium px-3 py-3">Regime</th>
              <th className="text-left text-xs text-muted font-medium px-3 py-3">Session</th>
              <th className="text-left text-xs text-muted font-medium px-3 py-3">Status</th>
            </tr></thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.symbol} className="border-b border-border/20 hover:bg-surface-2/50 transition-smooth">
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">{row.symbol}</td>
                  <td className="px-3 py-3"><span className={cn("text-sm font-bold", parseInt(row.spike) >= 25 ? "text-warn" : parseInt(row.spike) >= 15 ? "text-accent-light" : "text-muted-light")}>{row.spike}</span></td>
                  <td className="px-3 py-3 text-xs font-mono text-muted-light">{row.atr}</td>
                  <td className="px-3 py-3"><span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
                    row.regime.includes("Expand") ? "badge-bear" : row.regime.includes("Compress") || row.regime === "Low" ? "bg-accent/10 text-accent-light border border-accent/20 rounded-full text-xs px-2 py-0.5" : "badge-neutral")}>{row.regime}</span></td>
                  <td className="px-3 py-3 text-xs text-muted">{row.session}</td>
                  <td className="px-3 py-3 text-xs text-muted-light">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
