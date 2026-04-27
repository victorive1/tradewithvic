"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ByMistake {
  mistake: string;
  count: number;
  cost: number;
}

export function JournalMistakes() {
  const [items, setItems] = useState<ByMistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/journal/stats?days=${days}`, { cache: "no-store" });
        if (res.status === 401) { setAuthError(true); return; }
        const data = await res.json();
        if (!cancelled && data.success) setItems(data.byMistake ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  if (authError) return <div className="glass-card p-8 text-center text-sm text-muted-light">Sign in to see mistake patterns.</div>;
  if (loading) return <div className="glass-card p-8 text-center text-sm text-muted">Reviewing your trades…</div>;

  const totalCost = items.reduce((a, b) => a + b.cost, 0);
  // Math.max with no args returns -Infinity, which divides into NaN%
  // CSS widths. Always seed with 1 so an empty `items` (or all-zero
  // costs) renders a flat-zero bar instead of broken layout.
  const maxCost = items.length > 0 ? Math.max(1, ...items.map((i) => i.cost)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-light mr-1">Range:</span>
        {[7, 30, 90].map((n) => (
          <button key={n} onClick={() => setDays(n)}
            className={cn(
              "px-2.5 py-1 rounded text-[11px] border",
              days === n ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50",
            )}>{n}d</button>
        ))}
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Mistake cost breakdown</h3>
          <span className="text-[11px] text-muted">
            Total cost: <span className={cn("font-mono", totalCost > 0 ? "text-bear-light" : "text-muted")}>${totalCost.toFixed(0)}</span>
          </span>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-muted">No tagged mistakes yet. As you log losing trades, tag the mistake — repeated mistakes are where the journal earns its keep.</p>
        ) : (
          <div className="space-y-2">
            {items.map((m) => (
              <div key={m.mistake} className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-light w-44 shrink-0">{m.mistake.replace(/_/g, " ")}</span>
                <span className="text-[11px] text-muted w-12 shrink-0">{m.count}×</span>
                <div className="flex-1 h-3 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full bg-bear/40 rounded-full transition-all"
                    style={{ width: `${(m.cost / maxCost) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-bear-light w-20 text-right shrink-0">${m.cost.toFixed(0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card p-4 text-[11px] text-muted-light leading-relaxed">
        <p className="text-foreground font-semibold mb-1">How to use this:</p>
        <p>Each row is a mistake tag, weighted by the dollar cost of trades where you flagged it. The longest red bar is what's costing you the most money — that's the rule to fix this week. Tag mistakes honestly when you log a trade; the journal can only mirror what you tell it.</p>
      </div>
    </div>
  );
}
