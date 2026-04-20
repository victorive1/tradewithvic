"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { TimeframeFilter, type TimeframeValue, matchesTimeframe, buildTimeframeCounts } from "@/components/dashboard/TimeframeFilter";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import type { MarketQuote } from "@/lib/market-data";

type OBStatus = "Fresh" | "Tested" | "Mitigated";

interface OrderBlock {
  symbol: string;
  displayName: string;
  category: string;
  type: "Bullish OB" | "Bearish OB";
  zoneHigh: number;
  zoneLow: number;
  status: OBStatus;
  confidence: number;
  price: number;
  changePct: number;
  // Derived trade setup
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  timeframe: string;
  decimals: number;
  proximityPct: number;
  reasoning: string;
}

function timeframeForMove(absChange: number): string {
  if (absChange > 1.5) return "4h";
  if (absChange > 0.6) return "1h";
  if (absChange > 0.3) return "15m";
  return "5m";
}

function fmt(n: number, decimals: number): string {
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
}

/**
 * Derive an order block from a live quote, only when the session actually
 * shows an OB-like structure. Returns null if the quote doesn't qualify.
 *
 * Gates:
 *   - meaningful directional move (|Δ| > 0.3%)
 *   - range is wide enough to define a zone (> 0.15% of price)
 *   - price is currently NOT at the session extreme (a true OB implies a
 *     pullback away from the extreme)
 */
function deriveOrderBlock(q: MarketQuote): OrderBlock | null {
  const changePct = q.changePercent ?? 0;
  const absChange = Math.abs(changePct);
  const range = (q.high ?? 0) - (q.low ?? 0);
  if (!q.price || range <= 0) return null;

  const rangePct = (range / q.price) * 100;
  if (rangePct < 0.15) return null;                  // flat, no tradeable zone
  if (absChange < 0.3) return null;                  // no directional context

  const pricePos = (q.price - q.low) / range;        // 0 = at low, 1 = at high

  const isBullish = changePct > 0;
  // Bullish OB = session rallied, price pulled back into the demand side.
  // Bearish OB = session dropped, price bounced into the supply side.
  const validPullback = isBullish
    ? pricePos > 0.10 && pricePos < 0.70
    : pricePos > 0.30 && pricePos < 0.90;
  if (!validPullback) return null;

  // Zone: lower ~25% of range for bullish OB, upper ~25% for bearish.
  const zoneHigh = isBullish ? q.low + range * 0.30 : q.high - range * 0.05;
  const zoneLow  = isBullish ? q.low + range * 0.05 : q.high - range * 0.30;
  const zoneMid = (zoneHigh + zoneLow) / 2;
  const zoneWidth = zoneHigh - zoneLow;

  // Status: how close is price to the zone right now?
  const inZone = q.price >= zoneLow && q.price <= zoneHigh;
  const mitigated = isBullish ? q.price < zoneLow - zoneWidth * 0.2 : q.price > zoneHigh + zoneWidth * 0.2;
  const status: OBStatus = mitigated ? "Mitigated" : inZone ? "Tested" : "Fresh";

  // Proximity — closer to zone = higher
  const distToZone = inZone ? 0 : Math.min(Math.abs(q.price - zoneLow), Math.abs(q.price - zoneHigh));
  const proximityPct = range > 0 ? Math.max(0, Math.round(100 - (distToZone / range) * 100)) : 0;

  // Confidence blends move magnitude, proximity to zone, and session range.
  const confidence = Math.min(95, Math.round(
    35 + absChange * 18 + proximityPct * 0.25 + Math.min(15, rangePct * 10),
  ));

  // Trade setup — entry inside the zone, stop beyond it.
  const entryLow = zoneLow + zoneWidth * 0.25;
  const entryHigh = zoneLow + zoneWidth * 0.75;
  const stopLoss = isBullish ? zoneLow - zoneWidth * 0.35 : zoneHigh + zoneWidth * 0.35;
  const entry = zoneMid;
  const risk = Math.abs(entry - stopLoss);
  const takeProfit1 = isBullish ? entry + risk * 1.5 : entry - risk * 1.5;
  const takeProfit2 = isBullish ? entry + risk * 2.5 : entry - risk * 2.5;

  const inst = ALL_INSTRUMENTS.find((i) => i.symbol === q.symbol);
  const decimals = inst?.decimals ?? 2;
  const timeframe = timeframeForMove(absChange);

  const reasoning = isBullish
    ? `${q.displayName} rallied ${absChange.toFixed(2)}% this session and pulled back toward the demand side. The zone between ${fmt(zoneLow, decimals)} and ${fmt(zoneHigh, decimals)} marks where the institutional bid likely entered. ${status === "Tested" ? "Price is currently inside the zone — the reaction here decides the trade." : status === "Mitigated" ? "Price has fallen through the zone — treat as invalidated until structure confirms otherwise." : "Still approaching the zone; wait for a touch before committing."}`
    : `${q.displayName} sold ${absChange.toFixed(2)}% this session and bounced back toward the supply side. The zone between ${fmt(zoneLow, decimals)} and ${fmt(zoneHigh, decimals)} marks where the institutional offer likely stepped in. ${status === "Tested" ? "Price is currently inside the zone — the reaction here decides the trade." : status === "Mitigated" ? "Price has pushed through the zone — treat as invalidated until structure confirms otherwise." : "Still approaching the zone; wait for a touch before committing."}`;

  return {
    symbol: q.symbol,
    displayName: q.displayName || q.symbol,
    category: q.category || "forex",
    type: isBullish ? "Bullish OB" : "Bearish OB",
    zoneHigh, zoneLow, status, confidence, price: q.price, changePct,
    entryLow, entryHigh, stopLoss, takeProfit1, takeProfit2,
    timeframe, decimals, proximityPct, reasoning,
  };
}

function computeRR(b: Pick<OrderBlock, "entryLow" | "entryHigh" | "stopLoss" | "takeProfit2">): number {
  const entry = (b.entryLow + b.entryHigh) / 2;
  const risk = Math.abs(entry - b.stopLoss);
  if (risk <= 0) return 0;
  return Math.abs(b.takeProfit2 - entry) / risk;
}

export default function OrderBlocksPage() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "fresh" | "tested" | "mitigated">("all");
  const [timeframe, setTimeframe] = useState<TimeframeValue>("all");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
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

  const blocks = useMemo(() => {
    return quotes
      .map(deriveOrderBlock)
      .filter((b): b is OrderBlock => b !== null)
      .sort((a, b) => b.confidence - a.confidence);
  }, [quotes]);

  const byStatus = filterStatus === "all"
    ? blocks
    : blocks.filter((b) => b.status.toLowerCase() === filterStatus);
  const timeframeCounts = buildTimeframeCounts(byStatus, (b) => b.timeframe);
  const filtered = byStatus.filter((b) => matchesTimeframe(b.timeframe, timeframe));

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">Order Block Signals</h1>
        <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20 pulse-live">Live</span>
        {ageSec != null && (
          <span className="text-xs text-muted">
            Last updated {ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`}
          </span>
        )}
      </div>
      <p className="text-sm text-muted">
        Demand and supply zones inferred from the live session read. A signal only fires when a real directional move paired with a meaningful pullback — quiet markets return no OBs.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Active OBs</div>
          <div className="text-xl font-bold">{blocks.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Bullish OBs</div>
          <div className="text-xl font-bold text-bull-light">{blocks.filter((b) => b.type === "Bullish OB").length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Bearish OBs</div>
          <div className="text-xl font-bold text-bear-light">{blocks.filter((b) => b.type === "Bearish OB").length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Fresh Zones</div>
          <div className="text-xl font-bold text-accent-light">{blocks.filter((b) => b.status === "Fresh").length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", "fresh", "tested", "mitigated"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth capitalize",
              filterStatus === s ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light",
            )}
          >
            {s === "all" ? "All Status" : s}
          </button>
        ))}
      </div>

      <TimeframeFilter value={timeframe} onChange={setTimeframe} counts={timeframeCounts} />

      {/* Loading */}
      {loading && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="h-1 bg-surface-3 rounded-t" />
              <div className="h-4 bg-surface-3 rounded w-24 mb-3 mt-4" />
              <div className="h-6 bg-surface-3 rounded w-32 mb-2" />
              <div className="h-24 bg-surface-3 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⏸</div>
          <p className="text-sm text-muted">
            No {filterStatus === "all" ? "" : `${filterStatus} `}order blocks detected
            {timeframe !== "all" ? ` on ${timeframe}` : ""}.
          </p>
          <p className="text-[11px] text-muted-light">
            The scanner only flags real demand/supply zones — session with a directional move and a meaningful pullback. Refreshes every 60 seconds.
          </p>
        </div>
      )}

      {/* Cards */}
      {!loading && filtered.length > 0 && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((ob) => {
            const isBull = ob.type === "Bullish OB";
            return (
              <div key={ob.symbol} className="glass-card overflow-hidden">
                <div className={cn("h-1.5", isBull ? "bg-bull" : "bg-bear")} />
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-foreground">{ob.displayName}</h3>
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", isBull ? "badge-bull" : "badge-bear")}>
                        {ob.type}
                      </span>
                      <span className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded text-muted-light uppercase tracking-wider">{ob.timeframe}</span>
                    </div>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider",
                      ob.status === "Fresh" ? "bg-bull/10 text-bull-light border border-bull/30" :
                      ob.status === "Tested" ? "bg-warn/10 text-warn border border-warn/30" :
                      "bg-bear/10 text-bear-light border border-bear/30",
                    )}>
                      {ob.status}
                    </span>
                  </div>

                  {/* Zone */}
                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                    <div className="bg-surface-2/60 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase mb-0.5">Zone High</div>
                      <div className="text-foreground">{fmt(ob.zoneHigh, ob.decimals)}</div>
                    </div>
                    <div className="bg-surface-2/60 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase mb-0.5">Zone Low</div>
                      <div className="text-foreground">{fmt(ob.zoneLow, ob.decimals)}</div>
                    </div>
                    <div className="bg-surface-2/60 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase mb-0.5">Price</div>
                      <div className={cn(ob.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>
                        {fmt(ob.price, ob.decimals)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">Proximity · <span className="text-accent-light font-mono">{ob.proximityPct}%</span></span>
                    <span className="text-muted">Move · <span className={cn("font-mono", ob.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>{ob.changePct >= 0 ? "+" : ""}{ob.changePct.toFixed(2)}%</span></span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-10 h-1 rounded-full bg-surface-3 overflow-hidden">
                        <div className={cn("h-full rounded-full", ob.confidence >= 75 ? "bg-bull" : ob.confidence >= 60 ? "bg-accent" : "bg-warn")} style={{ width: `${ob.confidence}%` }} />
                      </div>
                      <span className="text-muted font-mono text-[10px]">{ob.confidence}</span>
                    </span>
                  </div>

                  {/* Trade setup */}
                  <div className="rounded-xl border border-border/50 bg-surface-2/40 p-3 space-y-2">
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
                        RR {computeRR(ob).toFixed(2)}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono">
                      <div className="rounded-lg bg-surface-3/40 border border-border/30 p-1.5 text-center">
                        <div className="text-[9px] uppercase text-muted">Entry</div>
                        <div className="text-foreground">{fmt((ob.entryLow + ob.entryHigh) / 2, ob.decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-bear/5 border border-bear/20 p-1.5 text-center">
                        <div className="text-[9px] uppercase text-bear-light">Stop</div>
                        <div className="text-bear-light">{fmt(ob.stopLoss, ob.decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-bull/5 border border-bull/20 p-1.5 text-center">
                        <div className="text-[9px] uppercase text-bull-light">TP1</div>
                        <div className="text-bull-light">{fmt(ob.takeProfit1, ob.decimals)}</div>
                      </div>
                      <div className="rounded-lg bg-bull/5 border border-bull/20 p-1.5 text-center">
                        <div className="text-[9px] uppercase text-bull-light">TP2</div>
                        <div className="text-bull-light">{fmt(ob.takeProfit2, ob.decimals)}</div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-light leading-relaxed">{ob.reasoning}</p>
                    <ExecuteTradeButton
                      setup={{
                        symbol: ob.symbol,
                        direction: isBull ? "buy" : "sell",
                        entry: (ob.entryLow + ob.entryHigh) / 2,
                        stopLoss: ob.stopLoss,
                        takeProfit: ob.takeProfit1,
                        takeProfit2: ob.takeProfit2,
                        timeframe: ob.timeframe,
                        setupType: isBull ? "bullish_order_block" : "bearish_order_block",
                        qualityGrade: ob.confidence >= 80 ? "A" : ob.confidence >= 65 ? "B" : "C",
                        confidenceScore: ob.confidence,
                        sourceType: "order_block",
                        sourceRef: ob.symbol,
                      }}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
