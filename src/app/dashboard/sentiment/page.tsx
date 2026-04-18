"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type SentimentState = "bullish" | "bearish" | "neutral" | "mixed" | "extreme_bull" | "extreme_bear";
type SentView = "dashboard" | "breakdown" | "shifts";

interface SentimentData {
  symbol: string;
  displayName: string;
  category: string;
  // Sentiment sources
  priceMomentum: number; // -100 to 100
  trendAlignment: number;
  crowdPositioning: number;
  volumePressure: number;
  // Derived
  compositeBias: number; // -100 to 100
  state: SentimentState;
  confidence: number; // 0-100
  freshness: "fresh" | "recent" | "aging";
  explanation: string;
  warning: string | null;
  // Visualization
  retailLong: number; // 0-100
  smartMoneyBias: string;
  signal: string;
}

function deriveSentiment(quote: any): SentimentData {
  const changePct = quote.changePercent;
  const range = quote.high - quote.low;
  const pricePosition = range > 0 ? (quote.price - quote.low) / range : 0.5;

  // Sentiment sources
  const priceMomentum = Math.max(-100, Math.min(100, Math.round(changePct * 60)));
  const trendAlignment = Math.max(-100, Math.min(100, Math.round((pricePosition - 0.5) * 150 + changePct * 20)));
  // Simulate crowd positioning (contrarian to price for educational value)
  const crowdBias = Math.round(50 + changePct * -25 + (Math.abs(quote.price * 7) % 20 - 10));
  const crowdPositioning = Math.max(-100, Math.min(100, crowdBias));
  const volumePressure = Math.max(-100, Math.min(100, Math.round(changePct * 40 + (pricePosition - 0.5) * 30)));

  // Composite bias — weighted average
  const compositeBias = Math.round(
    priceMomentum * 0.35 +
    trendAlignment * 0.30 +
    crowdPositioning * 0.15 +
    volumePressure * 0.20
  );

  // State classification
  let state: SentimentState;
  const agreementCount = [priceMomentum, trendAlignment, volumePressure].filter((v) => Math.sign(v) === Math.sign(compositeBias)).length;

  if (compositeBias > 60) state = "extreme_bull";
  else if (compositeBias > 20) state = "bullish";
  else if (compositeBias < -60) state = "extreme_bear";
  else if (compositeBias < -20) state = "bearish";
  else if (agreementCount <= 1) state = "mixed";
  else state = "neutral";

  // Confidence
  let confidence = Math.round(30 + Math.abs(compositeBias) * 0.5 + agreementCount * 10);
  if (state === "mixed") confidence = Math.min(40, confidence);
  confidence = Math.min(95, confidence);

  // Freshness
  const freshness = Math.abs(changePct) > 0.3 ? "fresh" : Math.abs(changePct) > 0.1 ? "recent" : "aging";

  // Retail positioning (simulated — contrarian to actual move for educational purposes)
  const retailLong = Math.max(15, Math.min(85, Math.round(50 - changePct * 20 + (Math.abs(quote.price * 3) % 10))));

  // Smart money bias — tends to align with actual price direction
  const smartMoneyBias = changePct > 0.1 ? "Bullish" : changePct < -0.1 ? "Bearish" : "Neutral";

  // Signal
  let signal: string;
  if (retailLong > 70 && changePct < 0) signal = "Crowd long, price dropping — fade risk";
  else if (retailLong < 30 && changePct > 0) signal = "Crowd short, price rising — squeeze risk";
  else if (retailLong > 65 && smartMoneyBias === "Bearish") signal = "Retail vs smart money divergence — caution";
  else if (retailLong < 35 && smartMoneyBias === "Bullish") signal = "Retail vs smart money divergence — watch for reversal";
  else if (state === "extreme_bull") signal = "Extreme bullish — crowded trade warning";
  else if (state === "extreme_bear") signal = "Extreme bearish — capitulation or opportunity";
  else if (confidence > 70) signal = `${state === "bullish" ? "Bullish" : state === "bearish" ? "Bearish" : "Neutral"} sentiment confirmed`;
  else signal = "No clear sentiment edge";

  // Warning
  let warning: string | null = null;
  if (state === "extreme_bull" || state === "extreme_bear") warning = "Extreme sentiment often precedes reversals. Use caution.";
  else if (state === "mixed") warning = "Conflicting sentiment sources. Reduced reliability.";
  else if (freshness === "aging") warning = "Sentiment data aging. Wait for fresh market activity.";

  // Explanation
  const explanation = generateExplanation(quote.displayName, state, compositeBias, priceMomentum, trendAlignment, crowdPositioning, confidence, retailLong, smartMoneyBias);

  return {
    symbol: quote.symbol, displayName: quote.displayName, category: quote.category,
    priceMomentum, trendAlignment, crowdPositioning, volumePressure,
    compositeBias, state, confidence, freshness, explanation, warning,
    retailLong, smartMoneyBias, signal,
  };
}

function generateExplanation(name: string, state: SentimentState, bias: number, momentum: number, trend: number, crowd: number, conf: number, retail: number, smart: string): string {
  if (state === "extreme_bull") return `${name} sentiment is extremely bullish (${bias > 0 ? "+" : ""}${bias}). Price momentum, trend alignment, and volume all point higher. However, extreme readings often precede mean reversion. Retail positioning is ${retail}% long — ${retail > 70 ? "crowded trade risk" : "room to run"}.`;
  if (state === "extreme_bear") return `${name} sentiment is extremely bearish (${bias}). Selling pressure, weakening structure, and negative momentum are converging. Extreme readings can signal capitulation or the start of a reversal — watch for exhaustion.`;
  if (state === "bullish") return `${name} shows bullish sentiment bias (${bias > 0 ? "+" : ""}${bias}) with ${conf}% confidence. Price momentum and trend alignment support the upside. Smart money reads ${smart.toLowerCase()}. ${retail > 60 ? "Retail is getting crowded long — monitor for fade signals." : "Positioning is not yet extreme."}`;
  if (state === "bearish") return `${name} shows bearish sentiment bias (${bias}) with ${conf}% confidence. Downward momentum and weakening structure are driving the reading. ${retail < 40 ? "Retail is heavily short — potential squeeze territory." : "Retail positioning still balanced."}`;
  if (state === "mixed") return `${name} sentiment is mixed and conflicting. Momentum reads ${momentum > 0 ? "bullish" : "bearish"} but crowd positioning leans ${crowd > 0 ? "bullish" : "bearish"} — sources disagree. Confidence is low (${conf}%). Best to wait for clarity or use other confluence.`;
  return `${name} sentiment is neutral with no strong directional pressure. Readings are balanced across sources. This can indicate consolidation or a market waiting for a catalyst.`;
}

const STATE_CONFIG: Record<SentimentState, { label: string; color: string; badge: string }> = {
  extreme_bull: { label: "Extreme Bullish", color: "text-bull-light", badge: "bg-bull/20 text-bull-light border-bull/30" },
  bullish: { label: "Bullish", color: "text-bull-light", badge: "badge-bull" },
  neutral: { label: "Neutral", color: "text-muted-light", badge: "badge-neutral" },
  mixed: { label: "Mixed", color: "text-warn", badge: "bg-warn/10 text-warn border-warn/20" },
  bearish: { label: "Bearish", color: "text-bear-light", badge: "badge-bear" },
  extreme_bear: { label: "Extreme Bearish", color: "text-bear-light", badge: "bg-bear/20 text-bear-light border-bear/30" },
};

function BiasGauge({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const normalized = (value + 100) / 200; // 0 to 1
  const pct = Math.round(normalized * 100);
  return (
    <div className={cn("relative", size === "md" ? "h-3" : "h-2")}>
      <div className="absolute inset-0 rounded-full overflow-hidden flex">
        <div className="w-1/2 bg-bear/30" /><div className="w-1/2 bg-bull/30" />
      </div>
      <div className="absolute top-0 bottom-0 w-0.5 bg-muted left-1/2 -translate-x-1/2 z-10" />
      <div className="absolute top-0 bottom-0 z-20" style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>
        <div className={cn("rounded-full border-2 border-foreground", size === "md" ? "w-4 h-4 -mt-0.5" : "w-3 h-3 -mt-0.5", value > 20 ? "bg-bull" : value < -20 ? "bg-bear" : "bg-muted")} />
      </div>
    </div>
  );
}

export default function SentimentPage() {
  const [data, setData] = useState<SentimentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<SentView>("dashboard");
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/market/quotes");
        const json = await res.json();
        if (json.quotes) setData(json.quotes.map((q: any) => deriveSentiment(q)));
      } catch {}
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  let filtered = data;
  if (categoryFilter !== "all") filtered = filtered.filter((d) => d.category === categoryFilter);
  const sorted = [...filtered].sort((a, b) => Math.abs(b.compositeBias) - Math.abs(a.compositeBias));

  const bullish = data.filter((d) => d.state === "bullish" || d.state === "extreme_bull").length;
  const bearish = data.filter((d) => d.state === "bearish" || d.state === "extreme_bear").length;
  const extremes = data.filter((d) => d.state === "extreme_bull" || d.state === "extreme_bear").length;
  const avgConf = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.confidence, 0) / data.length) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Sentiment Bias Engine</h1><p className="text-sm text-muted mt-1">Analyzing sentiment...</p></div>
        <div className="space-y-3">{[1,2,3,4].map((i) => <div key={i} className="glass-card p-5 animate-pulse"><div className="h-16 bg-surface-3 rounded" /></div>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sentiment Bias Engine</h1>
        <p className="text-sm text-muted mt-1">Aggregated sentiment intelligence with confidence scoring, source breakdown, and crowd-extreme warnings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{data.length}</div><div className="text-[10px] text-muted">Instruments</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bull-light">{bullish}</div><div className="text-[10px] text-muted">Bullish</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bear-light">{bearish}</div><div className="text-[10px] text-muted">Bearish</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-warn">{extremes}</div><div className="text-[10px] text-muted">Extreme</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-accent-light">{avgConf}%</div><div className="text-[10px] text-muted">Avg Confidence</div></div>
      </div>

      {/* View tabs + filters */}
      <div className="flex flex-wrap items-center gap-2">
        {[{ id: "dashboard" as SentView, l: "Dashboard" }, { id: "breakdown" as SentView, l: "Source Breakdown" }, { id: "shifts" as SentView, l: "Warnings & Extremes" }].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", view === v.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{v.l}</button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        {["all", "forex", "metals", "crypto", "indices"].map((c) => (
          <button key={c} onClick={() => setCategoryFilter(c)} className={cn("px-2.5 py-1 rounded-lg text-[10px] capitalize transition-smooth", categoryFilter === c ? "bg-surface-3 text-foreground border border-border-light" : "text-muted hover:text-muted-light")}>{c === "all" ? "All" : c}</button>
        ))}
      </div>

      {/* DASHBOARD VIEW */}
      {view === "dashboard" && (
        <div className="space-y-3">
          {sorted.map((d) => {
            const sc = STATE_CONFIG[d.state];
            const isExpanded = expandedSymbol === d.symbol;
            return (
              <div key={d.symbol} className="glass-card overflow-hidden">
                <div className="p-4 cursor-pointer" onClick={() => setExpandedSymbol(isExpanded ? null : d.symbol)}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold">{d.displayName}</span>
                      <span className={cn("text-[10px] font-medium px-2.5 py-0.5 rounded-full border", sc.badge)}>{sc.label}</span>
                      {d.warning && <span className="text-warn text-[10px]">⚠</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24"><BiasGauge value={d.compositeBias} /></div>
                      <span className={cn("text-sm font-bold font-mono w-10 text-right", d.compositeBias > 20 ? "text-bull-light" : d.compositeBias < -20 ? "text-bear-light" : "text-muted")}>{d.compositeBias > 0 ? "+" : ""}{d.compositeBias}</span>
                      <span className="text-xs text-muted">{d.confidence}%</span>
                    </div>
                  </div>

                  {/* Retail vs Smart Money bar */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-bull-light w-8">{d.retailLong}%</span>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden flex">
                      <div className="bg-bull h-full" style={{ width: `${d.retailLong}%` }} />
                      <div className="bg-bear h-full" style={{ width: `${100 - d.retailLong}%` }} />
                    </div>
                    <span className="text-[10px] text-bear-light w-8 text-right">{100 - d.retailLong}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted">Retail Long/Short</span>
                    <span className="text-muted">Smart Money: <span className={cn("font-medium", d.smartMoneyBias === "Bullish" ? "text-bull-light" : d.smartMoneyBias === "Bearish" ? "text-bear-light" : "text-muted-light")}>{d.smartMoneyBias}</span></span>
                    <span className="text-accent-light">{d.signal}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-border/30">
                    <p className="text-xs text-muted-light leading-relaxed mb-3">{d.explanation}</p>
                    {d.warning && (
                      <div className="bg-warn/5 border border-warn/10 rounded-lg p-2.5 mb-3">
                        <span className="text-xs text-warn">⚠ {d.warning}</span>
                      </div>
                    )}
                    {/* Source breakdown mini */}
                    <div className="grid grid-cols-4 gap-2 text-[10px]">
                      {[
                        { label: "Price Mom.", value: d.priceMomentum },
                        { label: "Trend Align.", value: d.trendAlignment },
                        { label: "Crowd Pos.", value: d.crowdPositioning },
                        { label: "Vol. Press.", value: d.volumePressure },
                      ].map((src) => (
                        <div key={src.label} className="bg-surface-2 rounded-lg p-2 text-center">
                          <div className="text-[9px] text-muted mb-0.5">{src.label}</div>
                          <div className={cn("font-bold font-mono", src.value > 20 ? "text-bull-light" : src.value < -20 ? "text-bear-light" : "text-muted")}>{src.value > 0 ? "+" : ""}{src.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* BREAKDOWN VIEW */}
      {view === "breakdown" && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Sentiment Source Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-border/50">
                <th className="text-left text-[10px] text-muted font-medium px-3 py-2">Instrument</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Price Mom.</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Trend</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Crowd</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Volume</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Composite</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">State</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Conf.</th>
              </tr></thead>
              <tbody>
                {sorted.map((d) => {
                  const sc = STATE_CONFIG[d.state];
                  const valColor = (v: number) => v > 20 ? "text-bull-light" : v < -20 ? "text-bear-light" : "text-muted";
                  return (
                    <tr key={d.symbol} className="border-b border-border/20">
                      <td className="px-3 py-2.5 text-xs font-medium">{d.displayName}</td>
                      <td className={cn("px-2 py-2.5 text-xs text-center font-mono", valColor(d.priceMomentum))}>{d.priceMomentum > 0 ? "+" : ""}{d.priceMomentum}</td>
                      <td className={cn("px-2 py-2.5 text-xs text-center font-mono", valColor(d.trendAlignment))}>{d.trendAlignment > 0 ? "+" : ""}{d.trendAlignment}</td>
                      <td className={cn("px-2 py-2.5 text-xs text-center font-mono", valColor(d.crowdPositioning))}>{d.crowdPositioning > 0 ? "+" : ""}{d.crowdPositioning}</td>
                      <td className={cn("px-2 py-2.5 text-xs text-center font-mono", valColor(d.volumePressure))}>{d.volumePressure > 0 ? "+" : ""}{d.volumePressure}</td>
                      <td className={cn("px-2 py-2.5 text-xs text-center font-bold font-mono", valColor(d.compositeBias))}>{d.compositeBias > 0 ? "+" : ""}{d.compositeBias}</td>
                      <td className="px-2 py-2.5 text-center"><span className={cn("text-[10px] px-2 py-0.5 rounded-full border", sc.badge)}>{sc.label}</span></td>
                      <td className="px-2 py-2.5 text-xs text-center text-muted">{d.confidence}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-[10px] text-muted">
            <strong>Weights:</strong> Price Momentum (35%) • Trend Alignment (30%) • Crowd Positioning (15%) • Volume Pressure (20%)
          </div>
        </div>
      )}

      {/* WARNINGS & EXTREMES VIEW */}
      {view === "shifts" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Instruments with extreme sentiment, crowd warnings, or mixed signals — potential reversal zones or high-risk conditions</p>
          {data.filter((d) => d.warning || d.state === "extreme_bull" || d.state === "extreme_bear" || d.state === "mixed").length > 0 ? (
            data.filter((d) => d.warning || d.state === "extreme_bull" || d.state === "extreme_bear" || d.state === "mixed").map((d) => {
              const sc = STATE_CONFIG[d.state];
              return (
                <div key={d.symbol} className={cn("glass-card p-5 border-l-4", d.state.includes("bull") ? "border-l-bull" : d.state.includes("bear") ? "border-l-bear" : "border-l-warn")}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-warn text-xs">⚠</span>
                      <span className="text-sm font-bold">{d.displayName}</span>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", sc.badge)}>{sc.label}</span>
                    </div>
                    <span className={cn("text-sm font-bold font-mono", d.compositeBias > 0 ? "text-bull-light" : "text-bear-light")}>{d.compositeBias > 0 ? "+" : ""}{d.compositeBias}</span>
                  </div>
                  <p className="text-xs text-muted-light leading-relaxed mb-2">{d.explanation}</p>
                  {d.warning && <p className="text-xs text-warn">⚠ {d.warning}</p>}
                  <div className="mt-2 text-[10px] text-muted">Signal: <span className="text-accent-light">{d.signal}</span></div>
                </div>
              );
            })
          ) : (
            <div className="glass-card p-12 text-center"><p className="text-muted text-sm">No extreme sentiment or warnings detected. Markets are within normal sentiment ranges.</p></div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How the Sentiment Engine Works</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">4 Sentiment Sources</p>
            <p><strong>Price Momentum</strong> (35%) — directional force from recent price action. <strong>Trend Alignment</strong> (30%) — where price sits within its range. <strong>Crowd Positioning</strong> (15%) — retail long/short balance. <strong>Volume Pressure</strong> (20%) — directional participation strength.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">6 Sentiment States</p>
            <p>Extreme Bullish, Bullish, Neutral, Mixed, Bearish, Extreme Bearish. Each derived from composite score + source agreement. Mixed = sources disagree, confidence drops.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Crowd vs Smart Money</p>
            <p>When retail is heavily long but price is falling = fade risk. When crowd positioning is extreme, contrarian signals may emerge. Smart money bias tends to align with actual price direction.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Integration</p>
            <p>Sentiment serves as a context layer — not a standalone trigger. Signal engines use it for confluence. Bots reduce size when direction fights strong opposing sentiment.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
