"use client";

import { cn } from "@/lib/utils";

const volatilityData = [
  { symbol: "GBP/JPY", spike: "+43%", atr: "1.82", regime: "Expanding", session: "London", status: "Breakout conditions" },
  { symbol: "XAU/USD", spike: "+38%", atr: "32.5", regime: "Expanding", session: "NY Open", status: "High momentum" },
  { symbol: "USD/CHF", spike: "+28%", atr: "0.0065", regime: "Expanding", session: "London", status: "Unusual move" },
  { symbol: "BTC/USD", spike: "+24%", atr: "1,850", regime: "Normal-High", session: "24/7", status: "Above average" },
  { symbol: "XAG/USD", spike: "+22%", atr: "0.48", regime: "Expanding", session: "NY", status: "Following gold" },
  { symbol: "EUR/USD", spike: "+12%", atr: "0.0058", regime: "Normal", session: "London", status: "Moderate" },
  { symbol: "NAS100", spike: "+18%", atr: "185", regime: "Normal-High", session: "Cash Open", status: "Earnings driven" },
  { symbol: "US Oil", spike: "+15%", atr: "1.25", regime: "Normal", session: "NY", status: "Supply news" },
  { symbol: "USD/JPY", spike: "+8%", atr: "0.85", regime: "Compressed", session: "Asia", status: "Pre-breakout" },
  { symbol: "AUD/USD", spike: "+5%", atr: "0.0042", regime: "Low", session: "Asia", status: "Dead zone" },
];

export default function VolatilityPage() {
  const sorted = [...volatilityData].sort((a, b) => parseInt(b.spike) - parseInt(a.spike));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Volatility Scanner</h1>
        <p className="text-sm text-muted mt-1">Detect pairs with unusual volatility expansion or compression</p>
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
