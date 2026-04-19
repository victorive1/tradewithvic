"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { TimeframeFilter, type TimeframeValue, matchesTimeframe, buildTimeframeCounts } from "@/components/dashboard/TimeframeFilter";

const breakoutTypes = ["All", "Structure", "Momentum", "Range", "Retest", "Trendline", "FVG", "Session", "Order Block", "S/R"];

const breakouts = [
  { symbol: "XAU/USD", type: "Structure", direction: "Bullish", timeframe: "1H", htfBias: "Bullish 4H", confidence: "A+", score: 92, zone: "Leaving Demand Zone", posted: "25 sec ago", status: "active",
    reasoning: "Price broke above confirmed swing high at 3,285 with strong displacement. Currently leaving bullish demand zone. FVG formed beneath the move supporting continuation." },
  { symbol: "GBP/JPY", type: "Momentum", direction: "Bearish", timeframe: "15m", htfBias: "Bearish 1H", confidence: "A", score: 85, zone: "At Supply Zone", posted: "2 min ago", status: "active",
    reasoning: "Impulsive bearish displacement through 191.40 support. Break candle 2x average size with minimal wick. Session breakout during London." },
  { symbol: "NAS100", type: "Range", direction: "Bullish", timeframe: "4H", htfBias: "Bullish Daily", confidence: "A", score: 83, zone: "Breaking Resistance", posted: "8 min ago", status: "active",
    reasoning: "18-candle consolidation broken to the upside. Clean close above range high. Room to move to 19,520 next target." },
  { symbol: "EUR/USD", type: "Retest", direction: "Bearish", timeframe: "1H", htfBias: "Bearish 4H", confidence: "A+", score: 90, zone: "Retesting Broken Support", posted: "12 min ago", status: "active",
    reasoning: "Breakout + retest setup. Support at 1.0840 broke, price returned to test from below, rejection candle confirmed." },
  { symbol: "XAG/USD", type: "FVG", direction: "Bullish", timeframe: "15m", htfBias: "Bullish 1H", confidence: "B+", score: 78, zone: "In Demand Zone", posted: "18 min ago", status: "active",
    reasoning: "Breakout move created fair value gap at 32.20-32.35. Price currently retesting the FVG zone. Expecting continuation." },
];

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
                <div className="flex items-center gap-3 flex-wrap">
                  <ExecuteTradeButton
                    setup={{
                      symbol: b.symbol.replace("/", ""),
                      direction: isBull ? "buy" : "sell",
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
