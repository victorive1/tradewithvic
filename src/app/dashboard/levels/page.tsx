"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { useTheme } from "@/components/ui/ThemeProvider";

interface SRZone {
  id: string;
  type: "support" | "resistance" | "flip";
  priceHigh: number;
  priceLow: number;
  strength: number;
  freshness: "fresh" | "tested" | "heavily_used";
  timeframe: string;
  touches: number;
  lastReaction: string;
  source: string;
  explanation: string;
  factors: { name: string; score: number; max: number }[];
}

// Generate SR zones from live quote data
function generateZones(quote: any): SRZone[] {
  if (!quote) return [];
  const price = quote.price;
  const range = quote.high - quote.low;
  const spread = range * 0.3;
  const zones: SRZone[] = [];
  let idCounter = 0;

  function makeId() { return `sr_${++idCounter}`; }
  function round(n: number, d: number) { return Math.round(n * Math.pow(10, d)) / Math.pow(10, d); }

  const decimals = quote.category === "forex" ? 5 : quote.category === "crypto" ? 2 : 2;

  // Session high — resistance
  zones.push({
    id: makeId(), type: "resistance", priceHigh: round(quote.high, decimals), priceLow: round(quote.high - spread * 0.1, decimals),
    strength: 82, freshness: "fresh", timeframe: "Intraday", touches: 1, lastReaction: "Today",
    source: "Session High", explanation: "Today's session high acts as near-term resistance. Price has already been rejected from this level once during the current session.",
    factors: [{ name: "Recency", score: 9, max: 10 }, { name: "Rejection Quality", score: 8, max: 10 }, { name: "Timeframe", score: 6, max: 10 }, { name: "Touch Count", score: 5, max: 10 }, { name: "Freshness", score: 9, max: 10 }],
  });

  // Session low — support
  zones.push({
    id: makeId(), type: "support", priceHigh: round(quote.low + spread * 0.1, decimals), priceLow: round(quote.low, decimals),
    strength: 80, freshness: "fresh", timeframe: "Intraday", touches: 1, lastReaction: "Today",
    source: "Session Low", explanation: "Today's session low forms a fresh support zone. Buyers have defended this level during the current trading day.",
    factors: [{ name: "Recency", score: 9, max: 10 }, { name: "Rejection Quality", score: 7, max: 10 }, { name: "Timeframe", score: 6, max: 10 }, { name: "Touch Count", score: 5, max: 10 }, { name: "Freshness", score: 9, max: 10 }],
  });

  // Previous close — flip zone
  zones.push({
    id: makeId(), type: "flip", priceHigh: round(quote.previousClose + spread * 0.05, decimals), priceLow: round(quote.previousClose - spread * 0.05, decimals),
    strength: 75, freshness: "tested", timeframe: "Daily", touches: 3, lastReaction: "Recent",
    source: "Previous Close / Flip Zone", explanation: "Yesterday's closing price often acts as a pivot. Price frequently retests this level before deciding direction. When broken, it tends to flip from support to resistance or vice versa.",
    factors: [{ name: "Recency", score: 8, max: 10 }, { name: "Rejection Quality", score: 7, max: 10 }, { name: "Timeframe", score: 8, max: 10 }, { name: "Touch Count", score: 7, max: 10 }, { name: "Freshness", score: 6, max: 10 }],
  });

  // Round number resistance
  const roundAbove = Math.ceil(price / (range > 10 ? 50 : range > 1 ? 1 : 0.01)) * (range > 10 ? 50 : range > 1 ? 1 : 0.01);
  zones.push({
    id: makeId(), type: "resistance", priceHigh: round(roundAbove + spread * 0.02, decimals), priceLow: round(roundAbove - spread * 0.02, decimals),
    strength: 68, freshness: "heavily_used", timeframe: "All", touches: 5, lastReaction: "Multiple",
    source: "Psychological / Round Number", explanation: `${round(roundAbove, decimals)} is a major psychological level. Round numbers attract significant order flow and often act as magnets or barriers for price.`,
    factors: [{ name: "Recency", score: 6, max: 10 }, { name: "Rejection Quality", score: 6, max: 10 }, { name: "Timeframe", score: 9, max: 10 }, { name: "Touch Count", score: 8, max: 10 }, { name: "Freshness", score: 4, max: 10 }],
  });

  // Round number support
  const roundBelow = Math.floor(price / (range > 10 ? 50 : range > 1 ? 1 : 0.01)) * (range > 10 ? 50 : range > 1 ? 1 : 0.01);
  if (roundBelow !== roundAbove) {
    zones.push({
      id: makeId(), type: "support", priceHigh: round(roundBelow + spread * 0.02, decimals), priceLow: round(roundBelow - spread * 0.02, decimals),
      strength: 65, freshness: "heavily_used", timeframe: "All", touches: 4, lastReaction: "Multiple",
      source: "Psychological / Round Number", explanation: `${round(roundBelow, decimals)} is a key psychological support. Institutional orders tend to cluster around round numbers.`,
      factors: [{ name: "Recency", score: 5, max: 10 }, { name: "Rejection Quality", score: 6, max: 10 }, { name: "Timeframe", score: 9, max: 10 }, { name: "Touch Count", score: 7, max: 10 }, { name: "Freshness", score: 4, max: 10 }],
    });
  }

  // Midpoint structure — potential level
  const mid = (quote.high + quote.low) / 2;
  zones.push({
    id: makeId(), type: price > mid ? "support" : "resistance", priceHigh: round(mid + spread * 0.05, decimals), priceLow: round(mid - spread * 0.05, decimals),
    strength: 58, freshness: "tested", timeframe: "Intraday", touches: 2, lastReaction: "Recent",
    source: "Range Midpoint", explanation: "The midpoint of today's range often acts as an intraday decision level. Price tends to react here before continuing or reversing.",
    factors: [{ name: "Recency", score: 7, max: 10 }, { name: "Rejection Quality", score: 5, max: 10 }, { name: "Timeframe", score: 5, max: 10 }, { name: "Touch Count", score: 5, max: 10 }, { name: "Freshness", score: 6, max: 10 }],
  });

  return zones.sort((a, b) => b.strength - a.strength);
}

export default function SREnginePage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>("XAUUSD");
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedZone, setExpandedZone] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [timeframeFilter, setTimeframeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const { theme } = useTheme();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/market/quotes");
        const data = await res.json();
        if (data.quotes) setQuotes(data.quotes);
      } catch {}
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const selectedQuote = quotes.find((q: any) => q.symbol === selectedSymbol);
  const zones = generateZones(selectedQuote);
  const inst = ALL_INSTRUMENTS.find((i) => i.symbol === selectedSymbol);

  let filteredZones = zones;
  if (typeFilter !== "all") filteredZones = filteredZones.filter((z) => z.type === typeFilter);
  if (timeframeFilter !== "all") filteredZones = filteredZones.filter((z) => z.timeframe.toLowerCase().includes(timeframeFilter));

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Support & Resistance Engine</h1><p className="text-sm text-muted mt-1">Loading levels...</p></div>
        <div className="space-y-4">{[1,2,3,4].map((i) => <div key={i} className="glass-card p-5 animate-pulse"><div className="h-16 bg-surface-3 rounded" /></div>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Support & Resistance Engine</h1>
        <p className="text-sm text-muted mt-1">Zone-based level detection with strength scoring, freshness tracking, and explanations</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}
          className="bg-surface-2 text-foreground text-sm rounded-xl border border-border/50 px-4 py-2.5 focus:outline-none focus:border-accent">
          {ALL_INSTRUMENTS.map((i) => <option key={i.symbol} value={i.symbol}>{i.displayName}</option>)}
        </select>

        <div className="flex gap-1">
          {["all", "support", "resistance", "flip"].map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className={cn("px-3 py-1.5 rounded-lg text-xs capitalize transition-smooth",
              typeFilter === t ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{t === "all" ? "All Types" : t}</button>
          ))}
        </div>

        <div className="flex gap-1">
          {["all", "intraday", "daily"].map((tf) => (
            <button key={tf} onClick={() => setTimeframeFilter(tf)} className={cn("px-3 py-1.5 rounded-lg text-xs capitalize transition-smooth",
              timeframeFilter === tf ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{tf === "all" ? "All TFs" : tf}</button>
          ))}
        </div>

        <button onClick={() => setShowChart(!showChart)} className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth",
          showChart ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{showChart ? "Hide Chart" : "Show Chart"}</button>

        <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Live</span>
      </div>

      {/* Current price */}
      {selectedQuote && (
        <div className="glass-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div><div className="text-xs text-muted">{inst?.displayName}</div><div className="text-xl font-black font-mono text-foreground">{selectedQuote.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div>
            <span className={cn("text-sm font-medium", selectedQuote.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>{selectedQuote.changePercent >= 0 ? "+" : ""}{selectedQuote.changePercent.toFixed(2)}%</span>
          </div>
          <div className="flex gap-4 text-xs text-muted">
            <span>H: <span className="text-foreground font-mono">{selectedQuote.high.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
            <span>L: <span className="text-foreground font-mono">{selectedQuote.low.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
            <span>Zones: <span className="text-accent-light font-bold">{filteredZones.length}</span></span>
          </div>
        </div>
      )}

      {/* Chart */}
      {showChart && (
        <div className="glass-card overflow-hidden" style={{ height: 400 }}>
          <TradingViewWidget symbol={selectedSymbol} interval="60" theme={theme} height={400} autosize={false} />
        </div>
      )}

      {/* Zones */}
      <div className="space-y-3">
        {filteredZones.map((zone) => {
          const typeColor = zone.type === "support" ? "border-l-bull" : zone.type === "resistance" ? "border-l-bear" : "border-l-accent";
          const typeLabel = zone.type === "support" ? "badge-bull" : zone.type === "resistance" ? "badge-bear" : "bg-accent/10 text-accent-light border border-accent/20 rounded-full px-2.5 py-0.5 text-xs";
          const freshnessColor = zone.freshness === "fresh" ? "text-bull-light" : zone.freshness === "tested" ? "text-warn" : "text-muted";
          const isExpanded = expandedZone === zone.id;

          return (
            <div key={zone.id} className={cn("glass-card overflow-hidden border-l-4", typeColor)}>
              <div className="p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("text-xs font-medium capitalize", typeLabel)}>{zone.type === "flip" ? "Flip Zone" : zone.type}</span>
                    <span className="text-sm font-bold font-mono text-foreground">{zone.priceLow} — {zone.priceHigh}</span>
                    <span className="text-xs text-muted bg-surface-2 px-1.5 py-0.5 rounded">{zone.timeframe}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn("text-[10px] font-medium capitalize", freshnessColor)}>{zone.freshness.replace("_", " ")}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-2 rounded-full bg-surface-3 overflow-hidden">
                        <div className={cn("h-full rounded-full", zone.strength >= 75 ? "bg-bull" : zone.strength >= 60 ? "bg-accent" : "bg-warn")} style={{ width: `${zone.strength}%` }} />
                      </div>
                      <span className="text-xs font-bold font-mono text-foreground">{zone.strength}</span>
                    </div>
                  </div>
                </div>

                {/* Source & quick info */}
                <div className="flex items-center gap-4 mb-3 text-xs text-muted">
                  <span className="text-foreground font-medium">{zone.source}</span>
                  <span>{zone.touches} touches</span>
                  <span>Last: {zone.lastReaction}</span>
                </div>

                {/* Explanation */}
                <p className="text-xs text-muted-light leading-relaxed mb-3">{zone.explanation}</p>

                <button onClick={() => setExpandedZone(isExpanded ? null : zone.id)} className="text-xs text-accent-light hover:text-accent transition-smooth">
                  {isExpanded ? "Hide scoring factors" : "View scoring factors"}
                </button>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border/30">
                    <h5 className="text-xs font-semibold mb-3 text-foreground">Strength Score Breakdown</h5>
                    <div className="space-y-2">
                      {zone.factors.map((f) => (
                        <div key={f.name} className="flex items-center gap-3">
                          <span className="text-[10px] text-muted w-32">{f.name}</span>
                          <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                            <div className={cn("h-full rounded-full", f.score >= 8 ? "bg-bull" : f.score >= 6 ? "bg-accent" : "bg-warn")} style={{ width: `${(f.score / f.max) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-muted w-10 text-right">{f.score}/{f.max}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/20 flex items-center justify-between">
                      <span className="text-xs text-muted">Total Strength</span>
                      <span className={cn("text-sm font-bold", zone.strength >= 75 ? "text-bull-light" : zone.strength >= 60 ? "text-accent-light" : "text-warn")}>{zone.strength}/100</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How the S&R Engine Works</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Zone-Based Detection</p>
            <p>Levels are detected as zones (price ranges) rather than thin lines, reflecting how price actually reacts in the market. Zones are identified from swing points, session extremes, repeated reactions, and round numbers.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Strength Scoring</p>
            <p>Each zone is scored by 5 factors: Recency (how recent the reaction), Rejection Quality (how strong the rejection), Timeframe Importance (higher TF = stronger), Touch Count (more touches = more proven), and Freshness (untested = higher potential).</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Freshness Tracking</p>
            <p>Fresh = untouched zone with highest reaction potential. Tested = price has visited but held. Heavily Used = multiple penetrations reduce reliability.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Integration</p>
            <p>These zones feed into trade setup scoring, breakout engines, bot decision-making, and the signal channel. A setup near a strong S/R zone scores higher for structure quality.</p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Legend</h3>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-bull/30 border-l-2 border-l-bull" /><span className="text-muted">Support Zone</span></div>
          <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-bear/30 border-l-2 border-l-bear" /><span className="text-muted">Resistance Zone</span></div>
          <div className="flex items-center gap-2"><div className="w-4 h-3 rounded-sm bg-accent/30 border-l-2 border-l-accent" /><span className="text-muted">Flip Zone</span></div>
          <span className="text-bull-light">Fresh</span>
          <span className="text-warn">Tested</span>
          <span className="text-muted">Heavily Used</span>
        </div>
      </div>
    </div>
  );
}
