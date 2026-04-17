"use client";

import { cn, formatPrice, formatPercent } from "@/lib/utils";
import type { MarketQuote } from "@/lib/market-data";

export function MarketCard({ quote }: { quote: MarketQuote }) {
  const isPositive = quote.changePercent >= 0;

  return (
    <div className="glass-card glass-card-hover p-4 cursor-pointer">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{quote.displayName}</h3>
          <span className="text-xs text-muted capitalize">{quote.category}</span>
        </div>
        <span
          className={cn(
            "text-xs font-medium px-2.5 py-1 rounded-full",
            isPositive ? "badge-bull" : "badge-bear"
          )}
        >
          {isPositive ? "Bullish" : "Bearish"}
        </span>
      </div>

      <div className="text-2xl font-bold text-foreground mb-1">
        {formatPrice(quote.price, quote.category === "forex" ? 5 : 2)}
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-sm font-medium",
            isPositive ? "text-bull-light" : "text-bear-light"
          )}
        >
          {formatPercent(quote.changePercent)}
        </span>
        <span className="text-xs text-muted">
          {isPositive ? "+" : ""}{quote.change.toFixed(quote.category === "forex" ? 5 : 2)}
        </span>
      </div>

      <div className="mt-3 pt-3 border-t border-border/30 flex justify-between text-xs text-muted">
        <span>H: {formatPrice(quote.high, 2)}</span>
        <span>L: {formatPrice(quote.low, 2)}</span>
      </div>
    </div>
  );
}
