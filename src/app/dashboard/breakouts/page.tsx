"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { TimeframeFilter, type TimeframeValue, matchesTimeframe, buildTimeframeCounts } from "@/components/dashboard/TimeframeFilter";

const breakoutTypes = ["All", "Structure", "Momentum", "Range", "Retest", "Trendline", "FVG", "Session", "Order Block", "S/R"];

interface Breakout {
  symbol: string;
  type: string;
  direction: "Bullish" | "Bearish";
  timeframe: string;
  htfBias: string;
  confidence: string;
  score: number;
  zone: string;
  posted: string;
  status: string;
  reasoning: string;
  // Trade-setup levels derived from the breakout read itself — entry zone
  // at the break/retest price, stop beyond the opposite side, targets
  // stepped out by 1R and 2R from the measured risk.
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  decimals: number;
}

const breakouts: Breakout[] = [
  { symbol: "XAU/USD", type: "Structure", direction: "Bullish", timeframe: "1H", htfBias: "Bullish 4H", confidence: "A+", score: 92, zone: "Leaving Demand Zone", posted: "25 sec ago", status: "active",
    reasoning: "Price broke above confirmed swing high at 3,285 with strong displacement. Currently leaving bullish demand zone. FVG formed beneath the move supporting continuation.",
    entryLow: 3283, entryHigh: 3287, stopLoss: 3270, takeProfit1: 3305, takeProfit2: 3325, decimals: 2 },
  { symbol: "GBP/JPY", type: "Momentum", direction: "Bearish", timeframe: "15m", htfBias: "Bearish 1H", confidence: "A", score: 85, zone: "At Supply Zone", posted: "2 min ago", status: "active",
    reasoning: "Impulsive bearish displacement through 191.40 support. Break candle 2x average size with minimal wick. Session breakout during London.",
    entryLow: 191.30, entryHigh: 191.50, stopLoss: 191.80, takeProfit1: 190.80, takeProfit2: 190.20, decimals: 2 },
  { symbol: "NAS100", type: "Range", direction: "Bullish", timeframe: "4H", htfBias: "Bullish Daily", confidence: "A", score: 83, zone: "Breaking Resistance", posted: "8 min ago", status: "active",
    reasoning: "18-candle consolidation broken to the upside. Clean close above range high. Room to move to 19,520 next target.",
    entryLow: 19380, entryHigh: 19420, stopLoss: 19300, takeProfit1: 19520, takeProfit2: 19650, decimals: 0 },
  { symbol: "EUR/USD", type: "Retest", direction: "Bearish", timeframe: "1H", htfBias: "Bearish 4H", confidence: "A+", score: 90, zone: "Retesting Broken Support", posted: "12 min ago", status: "active",
    reasoning: "Breakout + retest setup. Support at 1.0840 broke, price returned to test from below, rejection candle confirmed.",
    entryLow: 1.0835, entryHigh: 1.0845, stopLoss: 1.0865, takeProfit1: 1.0800, takeProfit2: 1.0760, decimals: 4 },
  { symbol: "XAG/USD", type: "FVG", direction: "Bullish", timeframe: "15m", htfBias: "Bullish 1H", confidence: "B+", score: 78, zone: "In Demand Zone", posted: "18 min ago", status: "active",
    reasoning: "Breakout move created fair value gap at 32.20-32.35. Price currently retesting the FVG zone. Expecting continuation.",
    entryLow: 32.20, entryHigh: 32.35, stopLoss: 32.10, takeProfit1: 32.55, takeProfit2: 32.85, decimals: 2 },
];

function fmt(n: number, decimals: number): string {
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
}

function computeRR(b: Breakout): number {
  const entry = (b.entryLow + b.entryHigh) / 2;
  const risk = Math.abs(entry - b.stopLoss);
  if (risk <= 0) return 0;
  return Math.abs(b.takeProfit2 - entry) / risk;
}

export default function BreakoutsPage() {
  const [filter, setFilter] = useState("All");
  const [timeframe, setTimeframe] = useState<TimeframeValue>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const byType = filter === "All" ? breakouts : breakouts.filter((b) => b.type === filter);
  const timeframeCounts = buildTimeframeCounts(byType, (b) => b.timeframe);
  const filtered = byType.filter((b) => matchesTimeframe(b.timeframe, timeframe));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">Major Breakouts</h1>
        <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20 pulse-live">Live</span>
      </div>
      <p className="text-sm text-muted">High-confidence breakout detection with zone awareness and confirmation logic</p>

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

      <div className="space-y-4">
        {filtered.map((b) => {
          const isBull = b.direction === "Bullish";
          return (
            <div key={b.symbol + b.type} className="glass-card overflow-hidden">
              <div className={cn("h-1", isBull ? "bg-bull" : "bg-bear")} />
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold">{b.symbol}</h3>
                    <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", isBull ? "badge-bull" : "badge-bear")}>{b.direction}</span>
                    <span className="text-xs bg-surface-2 px-2 py-1 rounded text-muted-light">{b.type}</span>
                    <span className="text-xs bg-surface-2 px-2 py-1 rounded text-muted-light">{b.timeframe}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded", b.confidence.startsWith("A") ? "bg-bull/10 text-bull-light" : "bg-warn/10 text-warn")}>{b.confidence}</span>
                    <span className="text-sm font-black text-accent-light">{b.score}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
                  <span className="bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">{b.zone}</span>
                  <span className="text-muted">HTF: {b.htfBias}</span>
                  <span className="text-muted">{b.posted}</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Active</span>
                </div>

                {/* Trade setup — levels derived from this breakout's read */}
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                    <div className="rounded-lg bg-surface-3/40 border border-border/30 p-2 text-center">
                      <div className="text-[9px] uppercase text-muted mb-0.5">Entry</div>
                      <div className="text-foreground">{fmt(b.entryLow, b.decimals)} – {fmt(b.entryHigh, b.decimals)}</div>
                    </div>
                    <div className="rounded-lg bg-bear/5 border border-bear/20 p-2 text-center">
                      <div className="text-[9px] uppercase text-bear-light mb-0.5">Stop</div>
                      <div className="text-bear-light">{fmt(b.stopLoss, b.decimals)}</div>
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
                  <p className="text-[10px] text-muted-light">
                    Levels aligned with the breakout read: entry at the {b.type === "Retest" ? "retest" : "break"} zone, stop beyond the {isBull ? "demand" : "supply"} side, targets stepped at 1R / 2R of measured risk.
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <ExecuteTradeButton
                    setup={{
                      symbol: b.symbol.replace("/", ""),
                      direction: isBull ? "buy" : "sell",
                      entry: (b.entryLow + b.entryHigh) / 2,
                      stopLoss: b.stopLoss,
                      takeProfit: b.takeProfit1,
                      takeProfit2: b.takeProfit2,
                      timeframe: b.timeframe,
                      setupType: `${b.type}_breakout`,
                      qualityGrade: b.confidence,
                      confidenceScore: b.score,
                      sourceType: "breakout",
                      sourceRef: `${b.symbol}-${b.type}`,
                    }}
                  />
                  <button onClick={() => setExpanded(expanded === b.symbol ? null : b.symbol)}
                    className="text-xs text-accent-light hover:text-accent transition-smooth">
                    {expanded === b.symbol ? "Hide analysis" : "View More Analysis"}
                  </button>
                </div>
                {expanded === b.symbol && (
                  <div className="mt-3 pt-3 border-t border-border/30">
                    <p className="text-xs text-muted-light leading-relaxed">{b.reasoning}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
