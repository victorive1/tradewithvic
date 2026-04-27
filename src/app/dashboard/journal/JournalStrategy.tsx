"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ByStrategy {
  strategy: string;
  trades: number;
  winRate: number | null;
  avgR: number | null;
  pnl: number;
  grade: string;
}
interface BySession {
  session: string;
  trades: number;
  pnl: number;
  wins: number;
  losses: number;
  winRate: number | null;
}

interface Stats {
  range: { days: number };
  summary: {
    totalTrades: number;
    closedTrades: number;
    pnl: number;
    wins: number;
    losses: number;
    winRate: number;
    avgR: number;
    biggestWin: number;
    biggestLoss: number;
    lossStreak: number;
  };
  byStrategy: ByStrategy[];
  bySession: BySession[];
}

export function JournalStrategy() {
  const [stats, setStats] = useState<Stats | null>(null);
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
        if (!cancelled && data.success) setStats(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  if (authError) return <div className="glass-card p-8 text-center text-sm text-muted-light">Sign in to see strategy performance.</div>;
  if (loading || !stats) return <div className="glass-card p-8 text-center text-sm text-muted">Crunching the numbers…</div>;

  const winRatePct = Math.round(stats.summary.winRate * 100);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-light mr-1">Range:</span>
        {[7, 30, 90, 365].map((n) => (
          <button key={n} onClick={() => setDays(n)}
            className={cn(
              "px-2.5 py-1 rounded text-[11px] border",
              days === n ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50",
            )}>
            {n === 365 ? "1y" : `${n}d`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Net P&L" value={`${stats.summary.pnl >= 0 ? "+" : ""}$${Math.abs(stats.summary.pnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} colorClass={stats.summary.pnl > 0 ? "text-bull-light" : stats.summary.pnl < 0 ? "text-bear-light" : "text-foreground"} />
        <Tile label="Win rate" value={`${winRatePct}%`} sub={`${stats.summary.wins}W / ${stats.summary.losses}L`} />
        <Tile label="Avg R" value={stats.summary.avgR.toFixed(2)} sub={`${stats.summary.closedTrades} closed`} />
        <Tile label="Loss streak (max)" value={String(stats.summary.lossStreak)} colorClass={stats.summary.lossStreak >= 4 ? "text-bear-light" : "text-foreground"} />
      </div>

      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">By strategy</h3>
        {stats.byStrategy.length === 0 ? (
          <p className="text-xs text-muted">No tagged trades yet — tag your strategy when logging to see this breakdown.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-light">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-normal">Strategy</th>
                  <th className="py-1 pr-3 font-normal text-right">Trades</th>
                  <th className="py-1 pr-3 font-normal text-right">Win rate</th>
                  <th className="py-1 pr-3 font-normal text-right">Avg R</th>
                  <th className="py-1 pr-3 font-normal text-right">P&amp;L</th>
                  <th className="py-1 pr-3 font-normal text-right">Grade</th>
                </tr>
              </thead>
              <tbody>
                {stats.byStrategy.map((s) => (
                  <tr key={s.strategy} className="border-t border-border/30">
                    <td className="py-2 pr-3 font-mono">{s.strategy.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-3 text-right font-mono">{s.trades}</td>
                    <td className="py-2 pr-3 text-right font-mono">{s.winRate == null ? "—" : `${Math.round(s.winRate * 100)}%`}</td>
                    <td className="py-2 pr-3 text-right font-mono">{s.avgR == null ? "—" : s.avgR.toFixed(2)}</td>
                    <td className={cn("py-2 pr-3 text-right font-mono", s.pnl > 0 ? "text-bull-light" : s.pnl < 0 ? "text-bear-light" : "text-muted")}>
                      {s.pnl >= 0 ? "+" : ""}${Math.abs(s.pnl).toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={cn("font-bold px-1.5 py-0.5 rounded text-[10px]",
                        s.grade === "A" ? "bg-bull/15 text-bull-light"
                          : s.grade === "A-" ? "bg-bull/10 text-bull-light"
                          : s.grade === "B" ? "bg-warn/10 text-warn"
                          : s.grade === "C" ? "bg-warn/15 text-warn"
                          : s.grade === "F" ? "bg-bear/15 text-bear-light"
                          : "bg-surface-3 text-muted-light",
                      )}>{s.grade}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">By session</h3>
        {stats.bySession.length === 0 ? (
          <p className="text-xs text-muted">Tag the session on your trades to see this breakdown.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.bySession.map((s) => (
              <div key={s.session} className="bg-surface-2 rounded-lg p-3 border border-border/40">
                <div className="text-[10px] uppercase tracking-wider text-muted">{s.session}</div>
                <div className="text-base font-semibold mt-1">{s.trades} trades</div>
                <div className={cn("text-xs font-mono mt-0.5", s.pnl > 0 ? "text-bull-light" : s.pnl < 0 ? "text-bear-light" : "text-muted")}>
                  {s.pnl >= 0 ? "+" : ""}${Math.abs(s.pnl).toFixed(0)}
                </div>
                {s.winRate != null && (
                  <div className="text-[10px] text-muted mt-0.5">{Math.round(s.winRate * 100)}% win</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-[10px] text-muted-light leading-relaxed max-w-3xl">
        <strong>Reading the grid:</strong> A strategy is "A" when it has a positive expectancy (positive P&amp;L AND positive avg R) AND a healthy win rate. Anything graded C or worse is a candidate to stop trading until you can identify what's broken — that's the journal's primary job.
      </div>
    </div>
  );
}

function Tile({ label, value, sub, colorClass }: { label: string; value: string; sub?: string; colorClass?: string }) {
  return (
    <div className="glass-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={cn("text-lg font-bold mt-1", colorClass)}>{value}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
