"use client";

import { cn } from "@/lib/utils";

const pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "XAU/USD", "NAS100", "BTC/USD"];

// Simulated correlation matrix
const correlations: Record<string, Record<string, number>> = {
  "EUR/USD": { "EUR/USD": 1, "GBP/USD": 0.81, "USD/JPY": -0.65, "AUD/USD": 0.72, "USD/CAD": -0.78, "XAU/USD": 0.55, "NAS100": 0.35, "BTC/USD": 0.28 },
  "GBP/USD": { "EUR/USD": 0.81, "GBP/USD": 1, "USD/JPY": -0.58, "AUD/USD": 0.65, "USD/CAD": -0.71, "XAU/USD": 0.48, "NAS100": 0.32, "BTC/USD": 0.22 },
  "USD/JPY": { "EUR/USD": -0.65, "GBP/USD": -0.58, "USD/JPY": 1, "AUD/USD": -0.45, "USD/CAD": 0.62, "XAU/USD": -0.72, "NAS100": 0.48, "BTC/USD": 0.15 },
  "AUD/USD": { "EUR/USD": 0.72, "GBP/USD": 0.65, "USD/JPY": -0.45, "AUD/USD": 1, "USD/CAD": -0.68, "XAU/USD": 0.62, "NAS100": 0.42, "BTC/USD": 0.38 },
  "USD/CAD": { "EUR/USD": -0.78, "GBP/USD": -0.71, "USD/JPY": 0.62, "AUD/USD": -0.68, "USD/CAD": 1, "XAU/USD": -0.52, "NAS100": -0.28, "BTC/USD": -0.18 },
  "XAU/USD": { "EUR/USD": 0.55, "GBP/USD": 0.48, "USD/JPY": -0.72, "AUD/USD": 0.62, "USD/CAD": -0.52, "XAU/USD": 1, "NAS100": 0.25, "BTC/USD": 0.32 },
  "NAS100":  { "EUR/USD": 0.35, "GBP/USD": 0.32, "USD/JPY": 0.48, "AUD/USD": 0.42, "USD/CAD": -0.28, "XAU/USD": 0.25, "NAS100": 1, "BTC/USD": 0.55 },
  "BTC/USD": { "EUR/USD": 0.28, "GBP/USD": 0.22, "USD/JPY": 0.15, "AUD/USD": 0.38, "USD/CAD": -0.18, "XAU/USD": 0.32, "NAS100": 0.55, "BTC/USD": 1 },
};

function getCellColor(value: number) {
  if (value >= 0.8) return "bg-bull/40 text-bull-light";
  if (value >= 0.5) return "bg-bull/20 text-bull-light";
  if (value >= 0.2) return "bg-bull/10 text-bull-light";
  if (value > -0.2) return "bg-surface-3 text-muted-light";
  if (value > -0.5) return "bg-bear/10 text-bear-light";
  if (value > -0.8) return "bg-bear/20 text-bear-light";
  return "bg-bear/40 text-bear-light";
}

export default function CorrelationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Correlation Matrix</h1>
        <p className="text-sm text-muted mt-1">Cross-market correlations. Avoid doubling exposure on correlated positions.</p>
        <p className="text-xs text-muted mb-4">Correlation analysis — calculated from recent price data</p>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-xs text-muted font-medium px-3 py-3 bg-surface/50" />
                {pairs.map((p) => (
                  <th key={p} className="text-center text-[10px] text-muted font-medium px-2 py-3 bg-surface/50 min-w-[72px]">
                    {p.replace("/", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pairs.map((row) => (
                <tr key={row} className="border-t border-border/20">
                  <td className="text-xs font-medium text-foreground px-3 py-2 whitespace-nowrap">{row}</td>
                  {pairs.map((col) => {
                    const val = correlations[row]?.[col] ?? 0;
                    return (
                      <td key={col} className={cn("text-center text-xs font-mono py-2 px-1", getCellColor(val))}>
                        {val === 1 ? "—" : val.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Strongest Positive</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted">EUR/USD vs GBP/USD</span><span className="text-bull-light font-bold">+0.81</span></div>
            <div className="flex justify-between"><span className="text-muted">EUR/USD vs AUD/USD</span><span className="text-bull-light font-bold">+0.72</span></div>
            <div className="flex justify-between"><span className="text-muted">NAS100 vs BTC/USD</span><span className="text-bull-light font-bold">+0.55</span></div>
          </div>
        </div>
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Strongest Negative</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted">EUR/USD vs USD/CAD</span><span className="text-bear-light font-bold">-0.78</span></div>
            <div className="flex justify-between"><span className="text-muted">USD/JPY vs XAU/USD</span><span className="text-bear-light font-bold">-0.72</span></div>
            <div className="flex justify-between"><span className="text-muted">GBP/USD vs USD/CAD</span><span className="text-bear-light font-bold">-0.71</span></div>
          </div>
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-2">How to Use</h3>
        <p className="text-xs text-muted leading-relaxed">
          If you are long EUR/USD and long GBP/USD, you have heavily correlated exposure (0.81). A USD spike would hit both positions simultaneously. Diversify by pairing correlated longs with uncorrelated or negatively correlated positions.
        </p>
      </div>
    </div>
  );
}
