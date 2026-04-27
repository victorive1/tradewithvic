"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { TimeframeFilter, type TimeframeValue, matchesTimeframe, buildTimeframeCounts } from "@/components/dashboard/TimeframeFilter";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import type { MarketQuote } from "@/lib/market-data";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";
import { useStableSetups } from "@/lib/dashboard/use-stable-setups";

const breakoutTypes = ["All", "Structure", "Momentum", "Range", "Retest", "FVG"] as const;
type BreakoutType = (typeof breakoutTypes)[number];

interface Breakout {
  symbol: string;            // canonical (EURUSD)
  displayName: string;       // formatted (EUR/USD)
  type: Exclude<BreakoutType, "All">;
  direction: "Bullish" | "Bearish";
  timeframe: string;
  htfBias: string;
  confidence: "A+" | "A" | "B+" | "B";
  score: number;
  zone: string;
  posted: string;
  reasoning: string;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  decimals: number;
  price: number;
  changePct: number;
}

function fmt(n: number, decimals: number): string {
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
}

function computeRR(b: Pick<Breakout, "entryLow" | "entryHigh" | "stopLoss" | "takeProfit2">): number {
  const entry = (b.entryLow + b.entryHigh) / 2;
  const risk = Math.abs(entry - b.stopLoss);
  if (risk <= 0) return 0;
  return Math.abs(b.takeProfit2 - entry) / risk;
}

function timeframeForMove(absChange: number): string {
  // Rough heuristic: big % moves read as higher-TF breakouts, small ones as intraday.
  if (absChange > 1.5) return "4h";
  if (absChange > 0.6) return "1h";
  if (absChange > 0.25) return "15m";
  return "5m";
}

/**
 * Derive a live breakout signal from a single MarketQuote.
 * Returns null if the quote doesn't represent a current breakout —
 * no signal is the honest answer when the market is range-bound.
 */
function deriveBreakout(q: MarketQuote): Breakout | null {
  const changePct = q.changePercent ?? 0;
  const absChange = Math.abs(changePct);
  const range = (q.high ?? 0) - (q.low ?? 0);
  if (!q.price || range <= 0) return null;

  const pricePos = (q.price - q.low) / range;
  const rangePct = (range / q.price) * 100;

  // Gate: meaningful directional move AND price closing near the extreme
  // it just broke. Avoids flagging chop as a breakout.
  const isBullish = changePct > 0.25 && pricePos > 0.70;
  const isBearish = changePct < -0.25 && pricePos < 0.30;
  if (!isBullish && !isBearish) return null;

  const direction: "Bullish" | "Bearish" = isBullish ? "Bullish" : "Bearish";
  const inst = ALL_INSTRUMENTS.find((i) => i.symbol === q.symbol);
  const decimals = inst?.decimals ?? 2;

  // Classify breakout type from the shape of the session read.
  let type: Exclude<BreakoutType, "All"> = "Structure";
  if (absChange > 0.75) type = "Momentum";
  else if (rangePct > 0.9) type = "Range";
  else if (pricePos > 0.60 && pricePos < 0.85 && isBullish) type = "Retest";
  else if (pricePos > 0.15 && pricePos < 0.40 && isBearish) type = "Retest";
  else if (rangePct > 0.45) type = "FVG";

  // Score: confidence in the read from move magnitude, position near extreme,
  // and meaningful range (avoid low-volatility signal dilution).
  const score = Math.min(100, Math.round(
    40 + absChange * 22 + (pricePos > 0.85 || pricePos < 0.15 ? 15 : 6) + Math.min(18, rangePct * 12),
  ));
  const confidence: Breakout["confidence"] =
    score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B+" : "B";

  // Trade levels derived from the same session range that produced the score.
  const entry = q.price;
  const entryBand = Math.max(range * 0.03, q.price * 0.0005);
  const entryLow = entry - entryBand;
  const entryHigh = entry + entryBand;
  const stopLoss = isBullish ? q.low - range * 0.12 : q.high + range * 0.12;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit1 = isBullish ? entry + risk * 1.5 : entry - risk * 1.5;
  const takeProfit2 = isBullish ? entry + risk * 2.5 : entry - risk * 2.5;

  const tf = timeframeForMove(absChange);
  const htfBias = isBullish
    ? `Bullish session (${absChange.toFixed(2)}%)`
    : `Bearish session (${absChange.toFixed(2)}%)`;
  const zone = isBullish
    ? (pricePos > 0.9 ? "Breaking Session High" : "Leaving Demand Zone")
    : (pricePos < 0.1 ? "Breaking Session Low" : "Rejecting Supply Zone");

  const reasoning = isBullish
    ? `${q.displayName} is pressing ${pricePos > 0.9 ? "into session highs" : "toward session highs"} with a ${absChange.toFixed(2)}% move over the session (range ${rangePct.toFixed(2)}%). Price is sitting at ${((pricePos) * 100).toFixed(0)}% of the day's range, consistent with a ${type.toLowerCase()} breakout. Stop sits beneath the session demand; targets step at 1R / 2R.`
    : `${q.displayName} is pressing ${pricePos < 0.1 ? "into session lows" : "toward session lows"} with a ${absChange.toFixed(2)}% decline over the session (range ${rangePct.toFixed(2)}%). Price is sitting at ${((pricePos) * 100).toFixed(0)}% of the day's range, consistent with a ${type.toLowerCase()} breakout. Stop sits above the session supply; targets step at 1R / 2R.`;

  return {
    symbol: q.symbol,
    displayName: q.displayName,
    type, direction, timeframe: tf, htfBias,
    confidence, score, zone, posted: "live", reasoning,
    entryLow, entryHigh, stopLoss, takeProfit1, takeProfit2, decimals,
    price: q.price, changePct,
  };
}

export default function BreakoutsPage() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
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
        const res = await fetch("/api/market/quotes", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && Array.isArray(data.quotes)) {
          setQuotes(data.quotes);
          setLastUpdated(data.timestamp ?? Date.now());
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Re-derive on each quotes change. Sorting happens server-flavor (highest
  // first) BUT useStableSetups merges this list against the previously
  // displayed order so cards keep their slots — so a small score wiggle
  // doesn't reshuffle the page.
  const derived = useMemo(() => {
    return quotes
      .map(deriveBreakout)
      .filter((b): b is Breakout => b !== null)
      .sort((a, b) => b.score - a.score);
  }, [quotes]);

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
