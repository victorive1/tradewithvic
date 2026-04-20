import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import Link from "next/link";
import { RefreshButton } from "./RefreshButton";
import { BrainTabs } from "./BrainTabs";
import { LiveRefresh } from "@/components/dashboard/LiveRefresh";

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
  const renderedAt = Date.now();
  const since24h = new Date(renderedAt - 24 * 60 * 60 * 1000);

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
    regimeSnaps,
    latestMacroRegime,
    activeLiquidityLevels,
    recentLiquidityEvents,
    openAlerts,
    latestMonitoring,
    activeSetupsCount,
    latestSentiment,
    upcomingEvents,
    elevatedEventRisks,
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
    prisma.regimeSnapshot.findMany({ orderBy: [{ symbol: "asc" }, { timeframe: "asc" }] }),
    prisma.macroRegimeSnapshot.findFirst({ orderBy: { capturedAt: "desc" } }),
    prisma.liquidityLevel.findMany({
      where: { status: "active" },
      orderBy: [{ symbol: "asc" }, { timeframe: "asc" }, { levelType: "asc" }],
      take: 40,
    }),
    prisma.liquidityEvent.findMany({ orderBy: { detectedAt: "desc" }, take: 10 }),
    prisma.monitoringAlert.findMany({
      where: { status: { in: ["open", "acknowledged"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.monitoringSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
    // Just the count — full setup list lives on the /dashboard/brain/setups sub-route
    prisma.tradeSetup.count({ where: { status: "active" } }),
    prisma.sentimentSnapshot.findFirst({ orderBy: { computedAt: "desc" } }),
    prisma.fundamentalEvent.findMany({
      where: { eventTime: { gte: new Date() } },
      orderBy: { eventTime: "asc" },
      take: 6,
    }),
    prisma.eventRiskSnapshot.findMany({
      where: { riskLevel: { in: ["medium", "high"] } },
      orderBy: { minutesToEvent: "asc" },
    }),
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
        <div className="flex items-center gap-4 flex-wrap">
          <LiveRefresh serverTimestamp={renderedAt} />
          <Link
            href="/dashboard/brain/performance"
            className="text-sm text-muted hover:text-foreground underline underline-offset-4"
          >
            Performance →
          </Link>
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

      <BrainTabs setupsCount={activeSetupsCount} />

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

      {regimeSnaps.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Regime Classification
            {latestMacroRegime && (
              <span className="ml-3 text-xs font-normal normal-case text-muted">
                Macro: <span className={latestMacroRegime.macroStability === "stable" ? "text-green-400" : "text-yellow-400"}>{latestMacroRegime.macroStability}</span> · {latestMacroRegime.macroTone} · {latestMacroRegime.dominantTheme ?? "—"}
              </span>
            )}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {regimeSnaps.map((r) => {
              const sClass = r.structureRegime === "trending" ? "text-green-400"
                : r.structureRegime === "compression" ? "text-yellow-400"
                  : r.structureRegime === "expansion" ? "text-orange-400"
                    : r.structureRegime === "transitioning" ? "text-purple-400"
                      : "text-muted";
              const vClass = r.volatilityRegime === "spike" ? "text-red-400"
                : r.volatilityRegime === "high" ? "text-orange-400"
                  : r.volatilityRegime === "low" ? "text-blue-400"
                    : "text-muted";
              return (
                <div key={`${r.symbol}-${r.timeframe}`} className={`flex flex-col p-2.5 rounded border border-border/60 ${r.unstable ? "border-yellow-500/40 bg-yellow-500/5" : ""}`}>
                  <span className="font-mono text-[11px] opacity-70">{r.symbol} · {r.timeframe}</span>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`font-medium uppercase ${sClass}`}>{r.structureRegime}</span>
                    <span className={`font-mono ${vClass}`}>{r.volatilityRegime}</span>
                  </div>
                  <span className="text-[10px] opacity-60 mt-0.5">{r.trendStrength} {r.directionalBias}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

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

      {openAlerts.length > 0 && (() => {
        const criticalCount = openAlerts.filter((a) => a.level === "critical").length;
        const severity = criticalCount > 0 ? "critical" : "warning";
        const bannerClass = severity === "critical"
          ? "border-red-500/40 bg-red-500/10 text-red-400"
          : "border-yellow-500/40 bg-yellow-500/10 text-yellow-400";
        return (
          <section className={`rounded-lg border p-4 ${bannerClass}`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide opacity-80">Agent Oversight</div>
                <div className="font-semibold">{openAlerts.length} active alert{openAlerts.length === 1 ? "" : "s"}{criticalCount > 0 ? ` · ${criticalCount} critical` : ""}</div>
              </div>
              <div className="text-xs space-y-0.5">
                {openAlerts.slice(0, 3).map((a) => (
                  <div key={a.id} className="font-mono">
                    <span className="uppercase opacity-70">{a.level}</span>
                    <span className="mx-1">·</span>
                    <span>{a.message}</span>
                  </div>
                ))}
                {openAlerts.length > 3 && <div className="opacity-60">+{openAlerts.length - 3} more</div>}
              </div>
            </div>
          </section>
        );
      })()}

      {(upcomingEvents.length > 0 || elevatedEventRisks.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
              Upcoming Economic Events
            </h2>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted">No events queued.</p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((e) => {
                  const minutesAway = Math.round((e.eventTime.getTime() - Date.now()) / 60000);
                  const impactClass = e.impact === "high" ? "bg-red-500/15 text-red-400" : e.impact === "medium" ? "bg-yellow-500/10 text-yellow-500" : "bg-muted/10 text-muted";
                  return (
                    <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${impactClass}`}>{e.impact}</span>
                        <span className="font-mono text-xs text-muted">{e.country}</span>
                        <span>{e.eventName}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span className="font-mono">in {minutesAway < 60 ? `${minutesAway}m` : `${Math.floor(minutesAway / 60)}h ${minutesAway % 60}m`}</span>
                        {e.forecast && <span className="font-mono">f {e.forecast}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
              Event Risk by Symbol
            </h2>
            {elevatedEventRisks.length === 0 ? (
              <p className="text-sm text-muted">No elevated event risk.</p>
            ) : (
              <div className="space-y-1.5">
                {elevatedEventRisks.map((r) => {
                  const riskClass = r.riskLevel === "high" ? "text-red-400 bg-red-500/10" : "text-yellow-400 bg-yellow-500/10";
                  return (
                    <div key={r.id} className={`flex items-center justify-between text-xs py-1.5 px-2 rounded ${riskClass}`}>
                      <span className="font-mono font-semibold">{r.symbol}</span>
                      <span className="uppercase">{r.riskLevel}</span>
                      {r.minutesToEvent !== null && r.minutesToEvent !== undefined && (
                        <span className="font-mono opacity-80">{r.minutesToEvent}m</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {latestSentiment && (() => {
        const toneClass = latestSentiment.riskTone === "risk_on" ? "from-green-500/15 to-transparent border-green-500/40 text-green-400"
          : latestSentiment.riskTone === "risk_off" ? "from-red-500/15 to-transparent border-red-500/40 text-red-400"
            : "from-muted/10 to-transparent border-border text-muted";
        return (
          <section className={`rounded-lg border bg-gradient-to-r p-5 ${toneClass}`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide opacity-80">
                  Market Sentiment
                </h2>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-2xl font-bold uppercase">
                    {latestSentiment.riskTone.replace("_", " ")}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-mono rounded border border-current bg-background/40">
                    {latestSentiment.riskScore > 0 ? "+" : ""}{latestSentiment.riskScore}
                  </span>
                </div>
              </div>
              <div className="flex gap-6 text-xs">
                <div>
                  <div className="opacity-60 uppercase">USD</div>
                  <div className="font-mono mt-0.5">{latestSentiment.usdBias} ({latestSentiment.usdScore.toFixed(0)})</div>
                </div>
                <div>
                  <div className="opacity-60 uppercase">Gold</div>
                  <div className="font-mono mt-0.5">{latestSentiment.goldBias} ({latestSentiment.goldChange > 0 ? "+" : ""}{latestSentiment.goldChange.toFixed(2)}%)</div>
                </div>
                <div>
                  <div className="opacity-60 uppercase">Crypto</div>
                  <div className="font-mono mt-0.5">{latestSentiment.cryptoBias} ({latestSentiment.cryptoChange > 0 ? "+" : ""}{latestSentiment.cryptoChange.toFixed(2)}%)</div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs opacity-80">{latestSentiment.reasoning}</p>
          </section>
        );
      })()}

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
