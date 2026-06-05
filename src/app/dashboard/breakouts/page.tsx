"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { TimeframeFilter, type TimeframeValue, matchesTimeframe, buildTimeframeCounts } from "@/components/dashboard/TimeframeFilter";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";
import { useStableSetups } from "@/lib/dashboard/use-stable-setups";
import { type Breakout, type BreakoutType, breakoutTypes } from "@/lib/breakouts/derive";
import { FirstDroppedBadge } from "@/components/setups/FirstDroppedBadge";

function fmt(n: number, decimals: number): string {
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
}

function computeRR(b: Pick<Breakout, "entryLow" | "entryHigh" | "stopLoss" | "takeProfit2">): number {
  const entry = (b.entryLow + b.entryHigh) / 2;
  const risk = Math.abs(entry - b.stopLoss);
  if (risk <= 0) return 0;
  return Math.abs(b.takeProfit2 - entry) / risk;
}

// deriveBreakout now lives in @/lib/breakouts/derive so the API route can
// run it server-side for backlog capture. This page consumes the derived
// breakouts (with their first-dropped stamp) from /api/market/breakouts.
export default function BreakoutsPage() {
  const [feed, setFeed] = useState<Breakout[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<BreakoutType>("All");
  const [timeframe, setTimeframe] = useState<TimeframeValue>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  // Pause refresh while user is hovering the breakout list so the
  // entry/SL/TP numbers don't shift while they're copying them.
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (pausedRef.current) return;
      try {
        const res = await fetch("/api/market/breakouts", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && Array.isArray(data.breakouts)) {
          setFeed(data.breakouts);
          setLastUpdated(data.timestamp ?? Date.now());
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Breakouts come pre-derived and pre-sorted (highest score first) from the
  // API, which also stamps each one's immutable first-dropped time. We still
  // run them through useStableSetups so cards keep their slots across refreshes
  // and a small score wiggle doesn't reshuffle the page.
  const derived = feed;

  // Stable id per breakout: symbol-only is too coarse (a symbol can flip
  // bullish/bearish between sessions); we include direction so a flip
  // re-mounts the card with the new color, but tweaks within a direction
  // keep the card put. setupType deliberately NOT in the key — type can
  // re-classify (Momentum → Range) on the same setup as price moves
  // through thresholds, and we don't want that to look like a new card.
  const getId = useCallback((b: Breakout) => `${b.symbol}_${b.direction}`, []);
  const { items: breakouts, changedIds } = useStableSetups(derived, getId, paused);

  const byType = filter === "All" ? breakouts : breakouts.filter((b) => b.type === filter);
  const timeframeCounts = buildTimeframeCounts(byType, (b) => b.timeframe);
  const filtered = byType.filter((b) => matchesTimeframe(b.timeframe, timeframe));

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;

  return (
    <div
      className="space-y-6"
      onMouseEnter={() => { pausedRef.current = true; setPaused(true); }}
      onMouseLeave={() => { pausedRef.current = false; setPaused(false); }}
    >
      <AdminRiskTargetBar />
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">Major Breakouts</h1>
        <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20 pulse-live">Live</span>
        {ageSec != null && (
          <span className="text-xs text-muted">
            Last updated {ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`}
          </span>
        )}
        {paused && (
          <span className="text-[11px] text-warn-light bg-warn/10 border border-warn/30 px-2 py-0.5 rounded-full" title="Refresh paused while you're hovering — move away to resume">
            ⏸ paused while interacting
          </span>
        )}
      </div>
      <p className="text-sm text-muted">
        Breakouts derived live from the current session read for every tracked instrument. When no symbol is actually breaking out, this list is empty — that's the honest answer for a quiet market.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {breakoutTypes.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth",
              filter === t ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>
            {t}
          </button>
        ))}
      </div>

      <TimeframeFilter value={timeframe} onChange={setTimeframe} counts={timeframeCounts} />

      {loading ? (
        <div className="glass-card p-12 text-center text-sm text-muted">Scanning the market for breakouts…</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⏸</div>
          <p className="text-sm text-muted">
            No {filter === "All" ? "" : `${filter.toLowerCase()} `}breakouts active
            {timeframe !== "all" ? ` on ${timeframe}` : ""}.
          </p>
          <p className="text-[11px] text-muted-light">
            The engine flags a breakout only when a symbol is pressing session extremes with meaningful directional thrust. Refreshes every 60 seconds.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((b) => {
            const isBull = b.direction === "Bullish";
            const justUpdated = changedIds.has(getId(b));
            return (
              <div
                key={getId(b)}
                className={cn(
                  "glass-card overflow-hidden transition-all duration-300",
                  justUpdated && "ring-2 ring-accent/40 shadow-lg shadow-accent/10",
                )}
              >
                <div className={cn("h-1", isBull ? "bg-bull" : "bg-bear")} />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-base font-bold">{b.displayName}</h3>
                      <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", isBull ? "badge-bull" : "badge-bear")}>{b.direction}</span>
                      <span className="text-xs bg-surface-2 px-2 py-1 rounded text-muted-light">{b.type}</span>
                      <span className="text-xs bg-surface-2 px-2 py-1 rounded text-muted-light">{b.timeframe}</span>
                      <span className="text-xs font-mono text-muted-light">{fmt(b.price, b.decimals)}</span>
                      <span className={cn("text-xs font-mono", b.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>
                        {b.changePct >= 0 ? "+" : ""}{b.changePct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded", b.confidence.startsWith("A") ? "bg-bull/10 text-bull-light" : "bg-warn/10 text-warn")}>{b.confidence}</span>
                      <span className="text-sm font-black text-accent-light">{b.score}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
                    <span className="bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">{b.zone}</span>
                    <span className="text-muted">HTF: {b.htfBias}</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Active · {b.posted}</span>
                    {b.firstDroppedAt && <FirstDroppedBadge at={b.firstDroppedAt} compact />}
                  </div>

                  {/* Trade setup — levels derived from the live session range */}
                  <div className="rounded-xl border border-border/50 bg-surface-2/40 p-3 space-y-3 mb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Trade Setup</span>
                        <span className={cn(
                          "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border",
                          isBull ? "bg-bull/10 text-bull-light border-bull/40" : "bg-bear/10 text-bear-light border-bear/40",
                        )}>
                          {isBull ? "▲ BUY" : "▼ SELL"}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted font-mono">
                        RR {computeRR(b).toFixed(2)} · {b.type} · {b.timeframe}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono">
                      <div className="rounded-lg bg-surface-3/40 border border-border/30 p-2 text-center">
                        <div className="text-[9px] uppercase text-muted mb-0.5">Entry</div>
                        <div className="text-foreground">{fmt(b.entryLow, b.decimals)} – {fmt(b.entryHigh, b.decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-bear/5 border border-bear/20 p-2 text-center">
                        <div className="text-[9px] uppercase text-bear-light mb-0.5">Stop</div>
                        <div className="text-bear-light">{fmt(b.stopLoss, b.decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-accent/5 border border-accent/20 p-2 text-center">
                        <div className="text-[9px] uppercase text-accent-light mb-0.5">1R</div>
                        <div className="text-accent-light">{fmt(computeOneR((b.entryLow + b.entryHigh) / 2, b.stopLoss, isBull ? "buy" : "sell"), b.decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-bull/5 border border-bull/20 p-2 text-center">
                        <div className="text-[9px] uppercase text-bull-light mb-0.5">TP1</div>
                        <div className="text-bull-light">{fmt(b.takeProfit1, b.decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-bull/5 border border-bull/20 p-2 text-center">
                        <div className="text-[9px] uppercase text-bull-light mb-0.5">TP2</div>
                        <div className="text-bull-light">{fmt(b.takeProfit2, b.decimals)}</div>
                      </div>
                    </div>
                    <AdminLotSizeForCard
                      symbol={b.symbol}
                      entry={(b.entryLow + b.entryHigh) / 2}
                      stopLoss={b.stopLoss}
                    />
                    <p className="text-[10px] text-muted-light">
                      Levels aligned with the live session: entry at market, stop beyond the {isBull ? "demand" : "supply"} extreme, targets stepped at 1R / 2R of measured risk.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <ExecuteTradeButton
                      setup={{
                        symbol: b.symbol,
                        direction: isBull ? "buy" : "sell",
                        entry: (b.entryLow + b.entryHigh) / 2,
                        stopLoss: b.stopLoss,
                        takeProfit: b.takeProfit1,
                        takeProfit2: b.takeProfit2,
                        timeframe: b.timeframe,
                        setupType: `${b.type.toLowerCase()}_breakout`,
                        qualityGrade: b.confidence,
                        confidenceScore: b.score,
                        sourceType: "breakout",
                        sourceRef: `${b.symbol}-${b.type}`,
                      }}
                    />
                    <button onClick={() => setExpanded(expanded === b.symbol + b.type ? null : b.symbol + b.type)}
                      className="text-xs text-accent-light hover:text-accent transition-smooth">
                      {expanded === b.symbol + b.type ? "Hide analysis" : "View More Analysis"}
                    </button>
                  </div>
                  {expanded === b.symbol + b.type && (
                    <div className="mt-3 pt-3 border-t border-border/30">
                      <p className="text-xs text-muted-light leading-relaxed">{b.reasoning}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
