"use client";

import { cn } from "@/lib/utils";
import type { CurrencyStrength, MarketQuote } from "@/lib/market-data";

function StrengthBar({ item, maxScore }: { item: CurrencyStrength; maxScore: number }) {
  const pct = (item.score / Math.max(maxScore, 1)) * 100;
  const color = item.score > 60 ? "from-bull to-bull-light" : item.score > 40 ? "from-accent to-accent-light" : "from-bear to-bear-light";

  return (
    <div className="glass-card p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-surface-3 flex items-center justify-center">
        <span className="text-lg font-black text-foreground">{item.currency}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">{item.currency}</span>
          <span className="text-sm font-bold text-foreground">{item.score.toFixed(1)}</span>
        </div>
        <div className="h-3 rounded-full bg-surface-3 overflow-hidden">
          <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className={cn(
        "text-xs font-bold w-8 text-center",
        item.rank <= 2 ? "text-bull-light" : item.rank >= 7 ? "text-bear-light" : "text-muted-light"
      )}>
        #{item.rank}
      </div>
    </div>
  );
}

export function StrengthClient({ strength, quotes }: { strength: CurrencyStrength[]; quotes: MarketQuote[] }) {
  const maxScore = Math.max(...strength.map((s) => s.score), 1);
  const strongest = strength[0];
  const weakest = strength[strength.length - 1];

  // Find strongest vs weakest pair opportunity
  const bestPair = strongest && weakest
    ? `${strongest.currency}/${weakest.currency}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Currency Strength Meter</h1>
        <p className="text-sm text-muted mt-1">Relative strength across 8 major currencies based on cross-pair momentum</p>
      </div>

      {/* Top insights */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Strongest Currency</div>
          <div className="text-3xl font-black text-bull-light">{strongest?.currency || "—"}</div>
          <div className="text-sm text-muted mt-1">Score: {strongest?.score.toFixed(1)}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Weakest Currency</div>
          <div className="text-3xl font-black text-bear-light">{weakest?.currency || "—"}</div>
          <div className="text-sm text-muted mt-1">Score: {weakest?.score.toFixed(1)}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Best Opportunity</div>
          <div className="text-3xl font-black gradient-text-accent">{bestPair || "—"}</div>
          <div className="text-sm text-muted mt-1">Strong vs. Weak</div>
        </div>
      </div>

      {/* Strength bars */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-4">Strength Ranking</h2>
        <div className="space-y-3">
          {strength.map((item) => (
            <StrengthBar key={item.currency} item={item} maxScore={maxScore} />
          ))}
        </div>
      </div>

      {/* Cross-pair matrix hint */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">How to Use This</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Finding Opportunities</p>
            <p>Look for the strongest currency vs the weakest. A pair combining the #1 ranked currency against the #8 gives the highest probability directional trade.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Confirming Setups</p>
            <p>If you have a bullish setup on EUR/USD, check that EUR is strong and USD is weak. If both are strong, the move may lack conviction.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
