import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { RefreshButton } from "./RefreshButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function timeAgo(date: Date): string {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function BrainStatusPage() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    latestCycle,
    totalCycles,
    cyclesLast24h,
    totalSnapshots,
    totalCandles,
    recentCycles,
    recentSnapshots,
    candleCountsRaw,
    instrumentCount,
    structureStates,
    recentStructureEvents,
    indicatorSnaps,
    activeLiquidityLevels,
    recentLiquidityEvents,
  ] = await Promise.all([
    prisma.scanCycle.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.scanCycle.count(),
    prisma.scanCycle.count({ where: { startedAt: { gte: since24h } } }),
    prisma.marketSnapshot.count(),
    prisma.candle.count(),
    prisma.scanCycle.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    prisma.marketSnapshot.findMany({
      orderBy: { capturedAt: "desc" },
      take: 15,
      select: { symbol: true, price: true, changePercent: true, capturedAt: true },
    }),
    prisma.candle.groupBy({
      by: ["symbol", "timeframe"],
      _count: { _all: true },
      orderBy: [{ symbol: "asc" }, { timeframe: "asc" }],
    }),
    prisma.instrument.count({ where: { isActive: true } }),
    prisma.structureState.findMany({ orderBy: [{ symbol: "asc" }, { timeframe: "asc" }] }),
    prisma.structureEvent.findMany({ orderBy: { detectedAt: "desc" }, take: 8 }),
    prisma.indicatorSnapshot.findMany({ orderBy: [{ symbol: "asc" }, { timeframe: "asc" }] }),
    prisma.liquidityLevel.findMany({
      where: { status: "active" },
      orderBy: [{ symbol: "asc" }, { timeframe: "asc" }, { levelType: "asc" }],
      take: 40,
    }),
    prisma.liquidityEvent.findMany({ orderBy: { detectedAt: "desc" }, take: 10 }),
  ]);

  const health = latestCycle
    ? latestCycle.status === "completed"
      ? "healthy"
      : latestCycle.status === "running"
        ? "scanning"
        : "failing"
    : "idle";

  const healthColor =
    health === "healthy" ? "text-green-500"
      : health === "scanning" ? "text-blue-500"
        : health === "failing" ? "text-red-500"
          : "text-muted";

  const healthDot =
    health === "healthy" ? "bg-green-500"
      : health === "scanning" ? "bg-blue-500 animate-pulse"
        : health === "failing" ? "bg-red-500"
          : "bg-muted";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market Core Brain</h1>
          <p className="text-sm text-muted mt-1">
            24/7 multi-asset scanning engine · every 2 min · Vercel Cron
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Suspense fallback={null}>
            <RefreshButton />
          </Suspense>
          <div className={`flex items-center gap-2 ${healthColor}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${healthDot}`} />
            <span className="text-sm font-medium uppercase tracking-wide">{health}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Last Scan" value={latestCycle ? timeAgo(latestCycle.startedAt) : "—"} sub={latestCycle ? `${latestCycle.durationMs ?? 0}ms · ${latestCycle.quotesFetched} quotes` : ""} />
        <StatCard label="Cycles (24h)" value={cyclesLast24h.toString()} sub={`${totalCycles} total`} />
        <StatCard label="Snapshots" value={totalSnapshots.toLocaleString()} sub={`${instrumentCount} instruments tracked`} />
        <StatCard label="Candles" value={totalCandles.toLocaleString()} sub="across 4 timeframes" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Recent Scan Cycles
          </h2>
          <div className="space-y-2">
            {recentCycles.length === 0 && (
              <p className="text-sm text-muted">No cycles yet.</p>
            )}
            {recentCycles.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${c.status === "completed" ? "bg-green-500" : c.status === "running" ? "bg-blue-500" : "bg-red-500"}`} />
                  <span className="font-mono text-xs text-muted">{timeAgo(c.startedAt)}</span>
                </div>
                <div className="flex gap-4 text-xs text-muted">
                  <span>{c.quotesFetched}q</span>
                  <span>{c.candlesFetched}c</span>
                  <span>{c.durationMs ?? "—"}ms</span>
                  <span className={c.errorCount > 0 ? "text-red-500" : ""}>
                    {c.errorCount > 0 ? `${c.errorCount} err` : "ok"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Latest Quotes
          </h2>
          <div className="space-y-1.5">
            {recentSnapshots.length === 0 && (
              <p className="text-sm text-muted">No snapshots yet.</p>
            )}
            {recentSnapshots.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-0">
                <span className="font-mono font-medium">{s.symbol}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-mono">{s.price}</span>
                  <span className={`font-mono min-w-[60px] text-right ${s.changePercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {s.changePercent >= 0 ? "+" : ""}{s.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
          Market Structure · Current Bias
        </h2>
        {structureStates.length === 0 ? (
          <p className="text-sm text-muted">No structure analyzed yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {structureStates.map((s) => {
              const biasClass =
                s.bias === "bullish" ? "text-green-500 bg-green-500/10 border-green-500/30"
                  : s.bias === "bearish" ? "text-red-500 bg-red-500/10 border-red-500/30"
                    : "text-muted bg-muted/10 border-border";
              return (
                <div key={`${s.symbol}-${s.timeframe}`} className={`flex flex-col p-3 rounded border ${biasClass}`}>
                  <span className="font-mono text-xs opacity-70">{s.symbol} · {s.timeframe}</span>
                  <span className="text-lg font-semibold uppercase mt-0.5">{s.bias}</span>
                  {s.lastSwingHigh && s.lastSwingLow && (
                    <span className="text-[10px] font-mono opacity-70 mt-0.5">
                      SH {s.lastSwingHigh.toFixed(2)} · SL {s.lastSwingLow.toFixed(2)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
          Recent Structure Events (BOS / CHoCH)
        </h2>
        {recentStructureEvents.length === 0 ? (
          <p className="text-sm text-muted">No BOS/CHoCH events detected yet.</p>
        ) : (
          <div className="space-y-2">
            {recentStructureEvents.map((e) => {
              const isBull = e.eventType.endsWith("bullish");
              const isChoch = e.eventType.startsWith("choch");
              return (
                <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-[10px] font-mono uppercase rounded ${isChoch ? "bg-yellow-500/10 text-yellow-500" : isBull ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                      {isChoch ? "CHoCH" : "BOS"} {isBull ? "↑" : "↓"}
                    </span>
                    <span className="font-mono text-xs">{e.symbol} · {e.timeframe}</span>
                    <span className="text-xs text-muted">@ {e.priceLevel.toFixed(4)}</span>
                  </div>
                  <span className="font-mono text-xs text-muted">{timeAgo(e.detectedAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Active Liquidity Levels
          </h2>
          {activeLiquidityLevels.length === 0 ? (
            <p className="text-sm text-muted">No active levels tracked yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {activeLiquidityLevels.map((l) => {
                const isHigh = l.levelType.endsWith("high");
                const badgeColor = l.levelType.startsWith("equal") ? "bg-yellow-500/10 text-yellow-500"
                  : l.levelType.startsWith("prev_day") ? "bg-blue-500/10 text-blue-500"
                    : "bg-purple-500/10 text-purple-500";
                return (
                  <div key={l.id} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] uppercase ${badgeColor}`}>
                        {l.levelType.replace(/_/g, " ")}
                      </span>
                      <span className="font-mono">{l.symbol} · {l.timeframe}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono ${isHigh ? "text-red-400" : "text-green-400"}`}>{l.price.toFixed(l.price > 100 ? 2 : 5)}</span>
                      {l.strength > 1 && <span className="text-[10px] text-muted">×{l.strength}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Recent Liquidity Sweeps
          </h2>
          {recentLiquidityEvents.length === 0 ? (
            <p className="text-sm text-muted">No sweeps detected yet.</p>
          ) : (
            <div className="space-y-2">
              {recentLiquidityEvents.map((e) => {
                const isBull = e.sweepDirection === "bullish_sweep";
                return (
                  <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 text-[10px] font-mono uppercase rounded ${isBull ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                        SWEEP {isBull ? "↑" : "↓"}
                      </span>
                      <span className="font-mono text-xs">{e.symbol} · {e.timeframe}</span>
                      <span className="text-xs text-muted">{e.levelType.replace(/_/g, " ")} @ {e.levelPrice.toFixed(4)}</span>
                    </div>
                    <span className="font-mono text-xs text-muted">{timeAgo(e.detectedAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
          Indicators · Latest Values
        </h2>
        {indicatorSnaps.length === 0 ? (
          <p className="text-sm text-muted">No indicators computed yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border/40">
                  <th className="text-left py-2 pr-3">Symbol · TF</th>
                  <th className="text-right px-2">Close</th>
                  <th className="text-right px-2">Trend</th>
                  <th className="text-right px-2">RSI</th>
                  <th className="text-right px-2">ATR %</th>
                  <th className="text-right px-2">MACD</th>
                  <th className="text-right px-2">BB %</th>
                  <th className="text-right pl-2">Momentum</th>
                </tr>
              </thead>
              <tbody>
                {indicatorSnaps.map((s) => {
                  const trendClass = s.trendBias === "bullish" ? "text-green-500" : s.trendBias === "bearish" ? "text-red-500" : "text-muted";
                  const rsiClass = s.rsiState === "overbought" ? "text-red-500" : s.rsiState === "oversold" ? "text-green-500" : "text-foreground";
                  const momentumClass = s.momentum === "up" ? "text-green-500" : s.momentum === "down" ? "text-red-500" : "text-muted";
                  return (
                    <tr key={`${s.symbol}-${s.timeframe}`} className="border-b border-border/20 last:border-0">
                      <td className="py-2 pr-3 font-mono">{s.symbol} · {s.timeframe}</td>
                      <td className="text-right px-2 font-mono">{s.close.toFixed(s.close > 100 ? 2 : 5)}</td>
                      <td className={`text-right px-2 font-medium uppercase ${trendClass}`}>{s.trendBias}</td>
                      <td className={`text-right px-2 font-mono ${rsiClass}`}>{s.rsi14?.toFixed(1) ?? "—"}</td>
                      <td className="text-right px-2 font-mono">{s.atrPercent?.toFixed(3) ?? "—"}</td>
                      <td className="text-right px-2 font-mono">{s.macdHist !== null && s.macdHist !== undefined ? (s.macdHist > 0 ? "+" : "") + s.macdHist.toFixed(4) : "—"}</td>
                      <td className="text-right px-2 font-mono">{s.bbPercentB !== null && s.bbPercentB !== undefined ? (s.bbPercentB * 100).toFixed(0) : "—"}</td>
                      <td className={`text-right pl-2 uppercase ${momentumClass}`}>{s.momentum}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
          Candle History by Symbol × Timeframe
        </h2>
        {candleCountsRaw.length === 0 ? (
          <p className="text-sm text-muted">No candles ingested yet. Wait for next cycle.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {candleCountsRaw.map((r) => (
              <div key={`${r.symbol}-${r.timeframe}`} className="flex flex-col p-3 rounded border border-border/60">
                <span className="font-mono text-xs text-muted">{r.symbol} · {r.timeframe}</span>
                <span className="text-xl font-semibold">{r._count._all}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-foreground mt-1">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
