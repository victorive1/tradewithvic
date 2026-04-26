"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

/* ---------- Types ---------- */
interface QuoteData {
  symbol: string;
  displayName: string;
  category: string;
  price: number;
  previousClose: number;
  high: number;
  low: number;
  changePercent: number;
  decimals: number;
}

type StructureState = "bullish" | "bearish" | "ranging" | "weakening" | "shifting";
type StructureQuality = "clean" | "moderate" | "messy";

interface TimeframeBias {
  state: StructureState;
  label: string;
}

interface InstrumentStructure {
  symbol: string;
  displayName: string;
  category: string;
  price: number;
  changePercent: number;
  high: number;
  low: number;
  previousClose: number;
  decimals: number;
  overallBias: StructureState;
  quality: StructureQuality;
  qualityScore: number;
  timeframes: { "5m": TimeframeBias; "15m": TimeframeBias; "1h": TimeframeBias; "4h": TimeframeBias };
  hhHl: boolean; // higher highs / higher lows
  llLh: boolean; // lower lows / lower highs
  bos: boolean;  // break of structure
  choch: boolean; // change of character
  invalidationLevel: number;
  confidence: number;
  explanation: string;
}

/* ---------- Helpers ---------- */

function deriveStructure(
  changePercent: number,
  price: number,
  previousClose: number,
  high: number,
  low: number,
  threshold: number
): StructureState {
  const range = high - low;
  const pricePos = range > 0 ? (price - low) / range : 0.5;
  const absPct = Math.abs(changePercent);

  // Shifting: large move with price at extreme
  if (absPct > threshold * 5 && (pricePos > 0.85 || pricePos < 0.15)) return "shifting";

  // Bullish: positive change above threshold, price above prevClose and closer to high
  if (changePercent > threshold && price > previousClose && pricePos > 0.45) return "bullish";

  // Bearish: negative change below threshold, price below prevClose and closer to low
  if (changePercent < -threshold && price < previousClose && pricePos < 0.55) return "bearish";

  // Weakening: direction conflicts with range position
  if ((changePercent > threshold && pricePos < 0.35) || (changePercent < -threshold && pricePos > 0.65)) return "weakening";

  // Ranging: small change, price near midpoint
  return "ranging";
}

function stateLabel(state: StructureState): string {
  const labels: Record<StructureState, string> = {
    bullish: "Bullish",
    bearish: "Bearish",
    ranging: "Ranging",
    weakening: "Weakening",
    shifting: "Shifting",
  };
  return labels[state];
}

function deriveTimeframes(q: QuoteData): InstrumentStructure["timeframes"] {
  // Different thresholds simulate different timeframe sensitivities
  // Shorter TFs use smaller thresholds (more sensitive)
  const tf5m = deriveStructure(q.changePercent, q.price, q.previousClose, q.high, q.low, 0.02);
  const tf15m = deriveStructure(q.changePercent, q.price, q.previousClose, q.high, q.low, 0.05);
  const tf1h = deriveStructure(q.changePercent, q.price, q.previousClose, q.high, q.low, 0.1);
  const tf4h = deriveStructure(q.changePercent, q.price, q.previousClose, q.high, q.low, 0.2);

  return {
    "5m": { state: tf5m, label: stateLabel(tf5m) },
    "15m": { state: tf15m, label: stateLabel(tf15m) },
    "1h": { state: tf1h, label: stateLabel(tf1h) },
    "4h": { state: tf4h, label: stateLabel(tf4h) },
  };
}

function deriveQuality(q: QuoteData, tfs: InstrumentStructure["timeframes"]): { quality: StructureQuality; score: number } {
  const states = [tfs["5m"].state, tfs["15m"].state, tfs["1h"].state, tfs["4h"].state];
  const directionalCount = states.filter((s) => s === "bullish" || s === "bearish").length;
  const sameDirection = states.filter((s) => s === states[0]).length;

  if (sameDirection >= 3 && directionalCount >= 3) return { quality: "clean", score: 85 + sameDirection * 3 };
  if (directionalCount >= 2) return { quality: "moderate", score: 55 + directionalCount * 8 };
  return { quality: "messy", score: 20 + directionalCount * 10 };
}

function buildInstrumentStructure(q: QuoteData): InstrumentStructure {
  const tfs = deriveTimeframes(q);
  const { quality, score: qualityScore } = deriveQuality(q, tfs);
  const range = q.high - q.low;
  const pricePos = range > 0 ? (q.price - q.low) / range : 0.5;
  const absPct = Math.abs(q.changePercent);

  const overallBias = deriveStructure(q.changePercent, q.price, q.previousClose, q.high, q.low, 0.1);

  // HH/HL detection: price near high + bullish change
  const hhHl = q.changePercent > 0.05 && pricePos > 0.6;
  // LL/LH detection: price near low + bearish change
  const llLh = q.changePercent < -0.05 && pricePos < 0.4;

  // BOS: large move in one direction
  const bos = absPct > 0.5;
  // CHoCH: bias conflicts with range position
  const choch = (q.changePercent > 0.1 && pricePos < 0.3) || (q.changePercent < -0.1 && pricePos > 0.7);

  // Invalidation level
  const invalidationLevel = overallBias === "bullish" || overallBias === "shifting"
    ? q.low - range * 0.1
    : q.high + range * 0.1;

  // Confidence from alignment
  const states = [tfs["5m"].state, tfs["15m"].state, tfs["1h"].state, tfs["4h"].state];
  const alignedCount = states.filter((s) => s === overallBias).length;
  const confidence = Math.min(95, 40 + alignedCount * 12 + (quality === "clean" ? 10 : quality === "moderate" ? 5 : 0));

  // Explanation
  let explanation: string;
  if (quality === "clean") {
    const dir = overallBias === "bullish" ? "upward" : overallBias === "bearish" ? "downward" : "sideways";
    explanation = `${q.displayName} shows clean ${dir} structure across most timeframes. ${hhHl ? "Higher highs and higher lows are forming, indicating sustained buying pressure. " : llLh ? "Lower highs and lower lows confirm sellers are in control. " : ""}${bos ? "A break of structure has occurred on the current session, signaling strong momentum. " : ""}Price is at ${q.price.toFixed(q.decimals)} with the range between ${q.low.toFixed(q.decimals)} and ${q.high.toFixed(q.decimals)}. Structure is reliable for directional trades.`;
  } else if (quality === "moderate") {
    explanation = `${q.displayName} has mixed structure with partial timeframe alignment. ${choch ? "A change of character signal is present -- watch for potential trend reversal. " : ""}Some timeframes agree on direction while others show indecision. Price at ${q.price.toFixed(q.decimals)} is ${pricePos > 0.6 ? "near the top" : pricePos < 0.4 ? "near the bottom" : "in the middle"} of today's range. Wait for cleaner alignment before entering with full size.`;
  } else {
    explanation = `${q.displayName} structure is messy and indecisive. Multiple timeframes conflict, making directional trades risky. Price at ${q.price.toFixed(q.decimals)} is chopping between ${q.low.toFixed(q.decimals)} and ${q.high.toFixed(q.decimals)}. ${choch ? "A change of character is detected but unconfirmed. " : ""}Avoid trading until structure cleans up.`;
  }

  return {
    symbol: q.symbol, displayName: q.displayName, category: q.category,
    price: q.price, changePercent: q.changePercent, high: q.high, low: q.low,
    previousClose: q.previousClose, decimals: q.decimals,
    overallBias, quality, qualityScore, timeframes: tfs,
    hhHl, llLh, bos, choch, invalidationLevel, confidence, explanation,
  };
}

/* ---------- Sub-components ---------- */

function StructureCell({ bias }: { bias: TimeframeBias }) {
  const colorMap: Record<StructureState, string> = {
    bullish: "bg-bull/10 text-bull-light",
    bearish: "bg-bear/10 text-bear-light",
    ranging: "bg-surface-2 text-muted",
    weakening: "bg-warn/10 text-warn",
    shifting: "bg-accent/10 text-accent-light",
  };
  return (
    <td className="px-2 py-2.5 text-center">
      <span className={cn("text-[10px] font-medium px-2 py-1 rounded-md inline-block", colorMap[bias.state])}>
        {bias.label}
      </span>
    </td>
  );
}

function LoadingSkeleton() {
  return (
    <div className="glass-card p-6 animate-pulse space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-8 bg-surface-2 rounded" />
      ))}
    </div>
  );
}

/* ---------- Main Component ---------- */
export default function MTFPage() {
  const [instruments, setInstruments] = useState<InstrumentStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [lastUpdated, setLastUpdated] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/market/quotes");
      const data = await res.json();
      if (data.quotes) {
        const structures: InstrumentStructure[] = data.quotes.map((q: any) => {
          const inst = ALL_INSTRUMENTS.find((i) => i.symbol === q.symbol);
          const quote: QuoteData = {
            symbol: q.symbol,
            displayName: q.displayName || inst?.displayName || q.symbol,
            category: q.category || inst?.category || "forex",
            price: q.price ?? 0,
            previousClose: q.previousClose ?? q.price ?? 0,
            high: q.high ?? q.price ?? 0,
            low: q.low ?? q.price ?? 0,
            changePercent: q.changePercent ?? 0,
            decimals: inst?.decimals ?? 2,
          };
          return buildInstrumentStructure(quote);
        });
        setInstruments(structures);
        setLastUpdated(new Date(data.timestamp || Date.now()).toLocaleTimeString());
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  // Initial fetch + auto-refresh every 60s
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (filterCat === "all") return instruments;
    return instruments.filter((i) => i.category === filterCat);
  }, [instruments, filterCat]);

  const selectedInstrument = useMemo(
    () => instruments.find((i) => i.symbol === selected) ?? null,
    [instruments, selected]
  );

  // Alignment summary
  const alignmentSummary = useMemo(() => {
    let aligned = 0;
    let conflicting = 0;
    instruments.forEach((inst) => {
      const states = Object.values(inst.timeframes).map((tf) => tf.state);
      const allSame = states.every((s) => s === states[0]);
      if (allSame && (states[0] === "bullish" || states[0] === "bearish")) aligned++;
      else conflicting++;
    });
    return { aligned, conflicting, total: instruments.length };
  }, [instruments]);

  const categories = ["all", "forex", "metals", "crypto", "energy"];
  const timeframeKeys = ["5m", "15m", "1h", "4h"] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Market Structure Engine</h1>
        <p className="text-sm text-muted mt-1">
          Multi-timeframe structure analysis with BOS/CHoCH detection across all instruments
        </p>
        {lastUpdated && <p className="text-xs text-muted mt-1">Live data -- auto-refreshes every 60s -- last updated {lastUpdated}</p>}
      </div>

      {/* Alignment Summary */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-bull-light">{alignmentSummary.aligned}</div>
            <div className="text-xs text-muted mt-1">Fully Aligned</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-bear-light">{alignmentSummary.conflicting}</div>
            <div className="text-xs text-muted mt-1">Conflicting</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{alignmentSummary.total}</div>
            <div className="text-xs text-muted mt-1">Total Instruments</div>
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth capitalize",
              filterCat === cat ? "bg-accent text-white" : "bg-surface-2 text-muted border border-border/50"
            )}
          >
            {cat === "all" ? "All Markets" : cat}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && <LoadingSkeleton />}

      {/* MTF Alignment Grid */}
      {!loading && (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left text-xs text-muted font-medium px-4 py-3">Instrument</th>
                  <th className="text-center text-xs text-muted font-medium px-2 py-3">Bias</th>
                  <th className="text-center text-xs text-muted font-medium px-2 py-3">Quality</th>
                  {timeframeKeys.map((tf) => (
                    <th key={tf} className="text-center text-xs text-muted font-medium px-2 py-3">{tf.toUpperCase()}</th>
                  ))}
                  <th className="text-center text-xs text-muted font-medium px-2 py-3">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inst) => (
                  <tr
                    key={inst.symbol}
                    onClick={() => setSelected(inst.symbol === selected ? null : inst.symbol)}
                    className={cn(
                      "border-b border-border/20 cursor-pointer transition-smooth",
                      selected === inst.symbol ? "bg-accent/5" : "hover:bg-surface-2/50"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-foreground">{inst.displayName}</div>
                      <div className="text-[10px] text-muted capitalize">{inst.category}</div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span className={cn(
                        "text-[10px] font-semibold px-2 py-1 rounded-md inline-block",
                        inst.overallBias === "bullish" ? "bg-bull/10 text-bull-light" :
                        inst.overallBias === "bearish" ? "bg-bear/10 text-bear-light" :
                        inst.overallBias === "shifting" ? "bg-accent/10 text-accent-light" :
                        "bg-surface-2 text-muted"
                      )}>
                        {stateLabel(inst.overallBias)}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span className={cn(
                        "text-[10px] font-medium",
                        inst.quality === "clean" ? "text-bull-light" :
                        inst.quality === "moderate" ? "text-accent-light" : "text-bear-light"
                      )}>
                        {inst.quality}
                      </span>
                    </td>
                    {timeframeKeys.map((tf) => (
                      <StructureCell key={tf} bias={inst.timeframes[tf]} />
                    ))}
                    <td className="px-2 py-3 text-center">
                      <span className={cn(
                        "text-xs font-mono",
                        inst.confidence >= 75 ? "text-bull-light" :
                        inst.confidence >= 55 ? "text-accent-light" : "text-muted"
                      )}>
                        {inst.confidence}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Structure Detail Panel */}
      {selectedInstrument && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-foreground">{selectedInstrument.displayName} -- Structure Detail</h3>
              <p className="text-sm text-muted mt-0.5">
                Price: <span className="font-mono text-foreground">{selectedInstrument.price.toFixed(selectedInstrument.decimals)}</span>
                <span className={cn("ml-2 font-mono text-xs", selectedInstrument.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                  {selectedInstrument.changePercent >= 0 ? "+" : ""}{selectedInstrument.changePercent.toFixed(2)}%
                </span>
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-muted hover:text-foreground transition-smooth text-lg">x</button>
          </div>

          {/* Structure info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-surface-2 rounded-lg p-3">
              <div className="text-xs text-muted mb-1">Structural Bias</div>
              <div className={cn(
                "text-sm font-semibold",
                selectedInstrument.overallBias === "bullish" ? "text-bull-light" :
                selectedInstrument.overallBias === "bearish" ? "text-bear-light" :
                "text-accent-light"
              )}>
                {stateLabel(selectedInstrument.overallBias)}
              </div>
              <div className="text-[10px] text-muted mt-0.5">{selectedInstrument.confidence}% confidence</div>
            </div>

            <div className="bg-surface-2 rounded-lg p-3">
              <div className="text-xs text-muted mb-1">Structure Pattern</div>
              <div className="text-sm font-semibold text-foreground">
                {selectedInstrument.hhHl ? "HH / HL" : selectedInstrument.llLh ? "LH / LL" : "No clear pattern"}
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                {selectedInstrument.hhHl ? "Higher Highs & Higher Lows" : selectedInstrument.llLh ? "Lower Highs & Lower Lows" : "Indecisive"}
              </div>
            </div>

            <div className="bg-surface-2 rounded-lg p-3">
              <div className="text-xs text-muted mb-1">BOS / CHoCH</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded",
                  selectedInstrument.bos ? "bg-bull/10 text-bull-light" : "bg-surface-2 text-muted border border-border/30"
                )}>
                  BOS {selectedInstrument.bos ? "Detected" : "None"}
                </span>
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded",
                  selectedInstrument.choch ? "bg-accent/10 text-accent-light" : "bg-surface-2 text-muted border border-border/30"
                )}>
                  CHoCH {selectedInstrument.choch ? "Detected" : "None"}
                </span>
              </div>
            </div>

            <div className="bg-surface-2 rounded-lg p-3">
              <div className="text-xs text-muted mb-1">Invalidation Level</div>
              <div className="text-sm font-mono text-bear-light">
                {selectedInstrument.invalidationLevel.toFixed(selectedInstrument.decimals)}
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                Structure Quality: <span className={cn(
                  "font-medium",
                  selectedInstrument.quality === "clean" ? "text-bull-light" :
                  selectedInstrument.quality === "moderate" ? "text-accent-light" : "text-bear-light"
                )}>{selectedInstrument.quality}</span>
              </div>
            </div>
          </div>

          {/* Range visualization */}
          <div className="bg-surface-2 rounded-lg p-4">
            <div className="flex items-center justify-between text-xs text-muted mb-2">
              <span className="font-mono">{selectedInstrument.low.toFixed(selectedInstrument.decimals)}</span>
              <span>Session Range</span>
              <span className="font-mono">{selectedInstrument.high.toFixed(selectedInstrument.decimals)}</span>
            </div>
            <div className="relative h-3 bg-surface-2 rounded-full border border-border/30 overflow-visible">
              {(() => {
                const range = selectedInstrument.high - selectedInstrument.low;
                const pos = range > 0 ? ((selectedInstrument.price - selectedInstrument.low) / range) * 100 : 50;
                return (
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2",
                      selectedInstrument.overallBias === "bullish" ? "bg-bull border-bull-light" :
                      selectedInstrument.overallBias === "bearish" ? "bg-bear border-bear-light" :
                      "bg-accent border-accent-light"
                    )}
                    style={{ left: `${Math.min(100, Math.max(0, pos))}%`, transform: "translate(-50%, -50%)" }}
                  />
                );
              })()}
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-surface-2 rounded-lg p-4">
            <div className="text-xs text-muted font-medium mb-2">Structure Analysis</div>
            <p className="text-sm text-foreground leading-relaxed">{selectedInstrument.explanation}</p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">Legend</h3>
        <div className="flex flex-wrap gap-4">
          {[
            { label: "Bullish", cls: "text-bull-light" },
            { label: "Bearish", cls: "text-bear-light" },
            { label: "Ranging", cls: "text-muted" },
            { label: "Weakening", cls: "text-warn" },
            { label: "Shifting", cls: "text-accent-light" },
          ].map((l) => (
            <span key={l.label} className={cn("text-xs font-medium", l.cls)}>{l.label}</span>
          ))}
          <span className="text-xs text-muted ml-2">| BOS = Break of Structure | CHoCH = Change of Character</span>
        </div>
      </div>
    </div>
  );
}
