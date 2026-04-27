"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface DayCell {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  hitDailyLimit: boolean;
  overtraded: boolean;
  topMistake: string | null;
}

export function JournalCalendar() {
  const [days, setDays] = useState<DayCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [range, setRange] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/journal/calendar?days=${range}`, { cache: "no-store" });
        if (res.status === 401) { setAuthError(true); return; }
        const data = await res.json();
        if (!cancelled && data.success) setDays(data.days);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  if (authError) return <div className="glass-card p-8 text-center text-sm text-muted-light">Sign in to see your calendar.</div>;
  if (loading) return <div className="glass-card p-8 text-center text-sm text-muted">Building calendar…</div>;

  // Map by date for fast lookup, then walk the requested range so empty
  // days render as blanks with 0 trades (rather than dropping out of grid).
  const map = new Map<string, DayCell>(days.map((d) => [d.date, d]));
  const grid: DayCell[] = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    grid.push(map.get(d) ?? { date: d, pnl: 0, trades: 0, wins: 0, losses: 0, hitDailyLimit: false, overtraded: false, topMistake: null });
  }

  const totalPnl = grid.reduce((a, c) => a + c.pnl, 0);
  const totalTrades = grid.reduce((a, c) => a + c.trades, 0);
  const greenDays = grid.filter((c) => c.pnl > 0).length;
  const redDays = grid.filter((c) => c.pnl < 0).length;

  // Color scale: deeper green for bigger wins, deeper red for bigger losses.
  // Use the 90th percentile of |pnl| as the saturation reference so a
  // single outlier doesn't wash everything else out.
  const absPnls = grid.map((c) => Math.abs(c.pnl)).filter((x) => x > 0).sort((a, b) => a - b);
  const reference = absPnls[Math.floor(absPnls.length * 0.9)] ?? 100;

  function tileColor(c: DayCell): string {
    if (c.pnl === 0 && c.trades === 0) return "bg-surface-2/40";
    const intensity = Math.min(1, Math.abs(c.pnl) / Math.max(reference, 1));
    if (c.pnl > 0) return intensity > 0.7 ? "bg-bull/40" : intensity > 0.4 ? "bg-bull/25" : "bg-bull/15";
    if (c.pnl < 0) return intensity > 0.7 ? "bg-bear/40" : intensity > 0.4 ? "bg-bear/25" : "bg-bear/15";
    return "bg-surface-3/60"; // breakeven, has trades
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-light mr-1">Range:</span>
        {[14, 30, 60, 90].map((n) => (
          <button key={n} onClick={() => setRange(n)}
            className={cn(
              "px-2.5 py-1 rounded text-[11px] border transition-smooth",
              range === n ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50",
            )}>
            {n}d
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-3"><div className="text-[10px] uppercase tracking-wider text-muted">Period P&amp;L</div>
          <div className={cn("text-lg font-bold", totalPnl > 0 ? "text-bull-light" : totalPnl < 0 ? "text-bear-light" : "text-foreground")}>
            {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div></div>
        <div className="glass-card p-3"><div className="text-[10px] uppercase tracking-wider text-muted">Trades</div>
          <div className="text-lg font-bold">{totalTrades}</div></div>
        <div className="glass-card p-3"><div className="text-[10px] uppercase tracking-wider text-muted">Green / Red days</div>
          <div className="text-lg font-bold"><span className="text-bull-light">{greenDays}</span> / <span className="text-bear-light">{redDays}</span></div></div>
        <div className="glass-card p-3"><div className="text-[10px] uppercase tracking-wider text-muted">Win rate (days)</div>
          <div className="text-lg font-bold text-accent-light">{greenDays + redDays > 0 ? Math.round((greenDays / (greenDays + redDays)) * 100) : 0}%</div></div>
      </div>

      <div className="glass-card p-4">
        <div className="grid grid-cols-7 gap-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-[9px] uppercase text-muted text-center pb-1">{d}</div>
          ))}
          {(() => {
            // Pad to start on Monday for visual alignment.
            const firstDate = new Date(grid[0].date);
            const dow = (firstDate.getUTCDay() + 6) % 7; // Mon=0
            const cells: React.ReactNode[] = [];
            for (let i = 0; i < dow; i++) cells.push(<div key={`pad-${i}`} className="aspect-square" />);
            for (const c of grid) {
              const day = new Date(c.date).getUTCDate();
              const tooltip = `${c.date}\n${c.trades} trades · ${c.wins}W / ${c.losses}L\nP&L: ${c.pnl >= 0 ? "+" : ""}$${c.pnl.toFixed(2)}${c.topMistake ? `\nTop mistake: ${c.topMistake}` : ""}`;
              cells.push(
                <div
                  key={c.date}
                  title={tooltip}
                  className={cn(
                    "aspect-square rounded-md border border-border/40 p-1.5 flex flex-col justify-between transition-all hover:scale-105 hover:border-accent/60 cursor-help",
                    tileColor(c),
                  )}
                >
                  <div className="text-[9px] text-muted-light">{day}</div>
                  {c.trades > 0 && (
                    <div className="text-right">
                      <div className={cn("text-[10px] font-semibold font-mono",
                        c.pnl > 0 ? "text-bull-light" : c.pnl < 0 ? "text-bear-light" : "text-muted-light",
                      )}>
                        {c.pnl >= 0 ? "+" : ""}{Math.round(c.pnl)}
                      </div>
                      <div className="text-[8px] text-muted">{c.trades}t</div>
                    </div>
                  )}
                </div>,
              );
            }
            return cells;
          })()}
        </div>
        <div className="mt-3 flex items-center gap-3 text-[10px] text-muted">
          <span>Hover a tile for details.</span>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-bear/40" />
            <span>red</span>
            <div className="w-3 h-3 rounded bg-surface-2/40 ml-1" />
            <span>flat</span>
            <div className="w-3 h-3 rounded bg-bull/40 ml-1" />
            <span>green</span>
          </div>
        </div>
      </div>
    </div>
  );
}
