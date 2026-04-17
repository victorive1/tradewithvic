"use client";

import type { CurrencyStrength } from "@/lib/market-data";

export function CurrencyStrengthPanel({ data }: { data: CurrencyStrength[] }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Currency Strength</h3>
        <span className="text-xs text-muted">Real-time</span>
      </div>

      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.currency} className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-light w-8">
              {item.currency}
            </span>
            <div className="flex-1 h-2.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${item.score}%`,
                  background:
                    item.score > 60
                      ? "linear-gradient(90deg, #10b981, #34d399)"
                      : item.score > 40
                      ? "linear-gradient(90deg, #6366f1, #818cf8)"
                      : "linear-gradient(90deg, #f43f5e, #fb7185)",
                }}
              />
            </div>
            <span className="text-xs font-mono text-muted-light w-10 text-right">
              {item.score.toFixed(1)}
            </span>
            <span className="text-xs text-muted w-4">#{item.rank}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
