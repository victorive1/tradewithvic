"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CurrencyStrength, MarketQuote } from "@/lib/market-data";

interface PairOpportunity {
  pair: string;
  strongCurrency: string;
  weakCurrency: string;
  spreadScore: number;
  bias: "bullish" | "bearish";
  confidence: number;
  liveChange?: number;
}

const PAIR_MAP: Record<string, [string, string]> = {
  EURUSD: ["EUR", "USD"], GBPUSD: ["GBP", "USD"], USDJPY: ["USD", "JPY"], USDCHF: ["USD", "CHF"],
  AUDUSD: ["AUD", "USD"], NZDUSD: ["NZD", "USD"], USDCAD: ["USD", "CAD"], EURJPY: ["EUR", "JPY"],
  GBPJPY: ["GBP", "JPY"], EURGBP: ["EUR", "GBP"], AUDJPY: ["AUD", "JPY"],
};

function generateOpportunities(strength: CurrencyStrength[], quotes: MarketQuote[]): PairOpportunity[] {
  const opportunities: PairOpportunity[] = [];
  const scoreMap: Record<string, number> = {};
  strength.forEach((s) => { scoreMap[s.currency] = s.score; });

  for (const [pair, [base, counter]] of Object.entries(PAIR_MAP)) {
    const baseScore = scoreMap[base] || 50;
    const counterScore = scoreMap[counter] || 50;
    const spread = Math.abs(baseScore - counterScore);
    if (spread < 3) continue;

    const isBullish = baseScore > counterScore;
    const quote = quotes.find((q) => q.symbol === pair);

    // Confidence: based on spread magnitude + change alignment
    let confidence = Math.min(95, Math.round(40 + spread * 3));
    if (quote) {
      const changeAligns = (isBullish && quote.changePercent > 0) || (!isBullish && quote.changePercent < 0);
      if (changeAligns) confidence = Math.min(95, confidence + 10);
      else confidence = Math.max(30, confidence - 15);
    }

    opportunities.push({
      pair: `${base}/${counter}`,
      strongCurrency: isBullish ? base : counter,
      weakCurrency: isBullish ? counter : base,
      spreadScore: Math.round(spread * 10) / 10,
      bias: isBullish ? "bullish" : "bearish",
      confidence,
      liveChange: quote?.changePercent,
    });
  }

  return opportunities.sort((a, b) => b.spreadScore - a.spreadScore);
}

function StrengthBar({ item, maxScore }: { item: CurrencyStrength; maxScore: number }) {
  const pct = (item.score / Math.max(maxScore, 1)) * 100;
  const color = item.score > 55 ? "from-bull to-bull-light" : item.score > 45 ? "from-accent to-accent-light" : "from-bear to-bear-light";
  const label = item.score > 60 ? "Strong" : item.score > 55 ? "Moderate" : item.score > 45 ? "Neutral" : item.score > 40 ? "Weak" : "Very Weak";
  const labelColor = item.score > 55 ? "text-bull-light" : item.score > 45 ? "text-muted-light" : "text-bear-light";

  return (
    <div className="glass-card p-4 flex items-center gap-4">
      <div className="w-14 h-14 rounded-xl bg-surface-3 flex items-center justify-center">
        <span className="text-lg font-black text-foreground">{item.currency}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">{item.currency}</span>
            <span className={cn("text-[10px] font-medium", labelColor)}>{label}</span>
          </div>
          <span className="text-sm font-black text-foreground">{item.score.toFixed(1)}</span>
        </div>
        <div className="h-3 rounded-full bg-surface-3 overflow-hidden">
          <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className={cn("text-xs font-bold w-6 text-center", item.rank <= 2 ? "text-bull-light" : item.rank >= 7 ? "text-bear-light" : "text-muted-light")}>
        #{item.rank}
      </div>
    </div>
  );
}

export function StrengthClient({ strength, quotes }: { strength: CurrencyStrength[]; quotes: MarketQuote[] }) {
  const [view, setView] = useState<"ranking" | "heatmap" | "opportunities">("ranking");
  const maxScore = Math.max(...strength.map((s) => s.score), 1);
  const strongest = strength[0];
  const weakest = strength[strength.length - 1];
  const opportunities = generateOpportunities(strength, quotes);
  const bestOpp = opportunities[0];

  // Heatmap data
  const currencies = strength.map((s) => s.currency);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">FX Strength Engine</h1>
        <p className="text-sm text-muted mt-1">Multi-timeframe currency strength ranking with pair bias, confidence scores, and opportunity detection</p>
      </div>

      {/* Top insights */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Strongest Currency</div>
          <div className="text-3xl font-black text-bull-light">{strongest?.currency || "—"}</div>
          <div className="text-xs text-muted mt-1">Score: {strongest?.score.toFixed(1)}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Weakest Currency</div>
          <div className="text-3xl font-black text-bear-light">{weakest?.currency || "—"}</div>
          <div className="text-xs text-muted mt-1">Score: {weakest?.score.toFixed(1)}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Best Opportunity</div>
          <div className="text-2xl font-black gradient-text-accent">{bestOpp?.pair || "—"}</div>
          <div className="text-xs text-muted mt-1">{bestOpp ? `${bestOpp.bias} • ${bestOpp.confidence}% conf` : "—"}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Strength Spread</div>
          <div className="text-2xl font-black text-foreground">{strongest && weakest ? (strongest.score - weakest.score).toFixed(1) : "—"}</div>
          <div className="text-xs text-muted mt-1">{strongest?.currency} vs {weakest?.currency}</div>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-2">
        {[
          { id: "ranking" as const, label: "Strength Ranking" },
          { id: "heatmap" as const, label: "Heatmap" },
          { id: "opportunities" as const, label: `Pair Opportunities (${opportunities.length})` },
        ].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth", view === v.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{v.label}</button>
        ))}
      </div>

      {/* RANKING VIEW */}
      {view === "ranking" && (
        <div className="space-y-3">
          {strength.map((item) => (
            <StrengthBar key={item.currency} item={item} maxScore={maxScore} />
          ))}
        </div>
      )}

      {/* HEATMAP VIEW */}
      {view === "heatmap" && (
        <div className="glass-card p-5 overflow-x-auto">
          <h3 className="text-sm font-semibold mb-4">Currency Strength Heatmap</h3>
          <div className="grid grid-cols-9 gap-1 min-w-[500px]">
            {/* Header row */}
            <div />
            {currencies.map((c) => <div key={c} className="text-center text-[10px] font-bold text-muted py-1">{c}</div>)}
            {/* Data rows */}
            {currencies.map((row) => {
              const rowScore = strength.find((s) => s.currency === row)?.score || 50;
              return (
                <div key={row} className="contents">
                  <div className="text-[10px] font-bold text-muted flex items-center justify-end pr-2">{row}</div>
                  {currencies.map((col) => {
                    const colScore = strength.find((s) => s.currency === col)?.score || 50;
                    if (row === col) return <div key={col} className="bg-surface-3 rounded text-center text-[9px] text-muted py-2">—</div>;
                    const diff = rowScore - colScore;
                    const bg = diff > 5 ? "bg-bull/30 text-bull-light" : diff > 2 ? "bg-bull/15 text-bull-light" : diff < -5 ? "bg-bear/30 text-bear-light" : diff < -2 ? "bg-bear/15 text-bear-light" : "bg-surface-2 text-muted";
                    return <div key={col} className={cn("rounded text-center text-[9px] font-mono py-2", bg)}>{diff > 0 ? "+" : ""}{diff.toFixed(1)}</div>;
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-4 mt-4 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-bull/30" />Base stronger</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-surface-2" />Neutral</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-bear/30" />Base weaker</span>
          </div>
        </div>
      )}

      {/* OPPORTUNITIES VIEW */}
      {view === "opportunities" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Pairs ranked by strength imbalance — strongest currency vs weakest currency = highest probability directional bias</p>
          {opportunities.map((opp) => (
            <div key={opp.pair} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold text-foreground">{opp.pair}</h3>
                  <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full capitalize", opp.bias === "bullish" ? "badge-bull" : "badge-bear")}>{opp.bias}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-muted">Confidence</div>
                    <div className={cn("text-sm font-black", opp.confidence >= 70 ? "text-bull-light" : opp.confidence >= 50 ? "text-accent-light" : "text-warn")}>{opp.confidence}%</div>
                  </div>
                  <div className="w-12 h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div className={cn("h-full rounded-full", opp.confidence >= 70 ? "bg-bull" : opp.confidence >= 50 ? "bg-accent" : "bg-warn")} style={{ width: `${opp.confidence}%` }} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div className="bg-surface-2 rounded-lg p-2.5"><span className="text-muted block mb-0.5">Strong</span><span className="text-bull-light font-bold text-sm">{opp.strongCurrency}</span></div>
                <div className="bg-surface-2 rounded-lg p-2.5"><span className="text-muted block mb-0.5">Weak</span><span className="text-bear-light font-bold text-sm">{opp.weakCurrency}</span></div>
                <div className="bg-surface-2 rounded-lg p-2.5"><span className="text-muted block mb-0.5">Spread</span><span className="text-foreground font-bold text-sm">{opp.spreadScore}</span></div>
                <div className="bg-surface-2 rounded-lg p-2.5"><span className="text-muted block mb-0.5">Live Δ</span>
                  {opp.liveChange !== undefined ? (
                    <span className={cn("font-bold text-sm", opp.liveChange >= 0 ? "text-bull-light" : "text-bear-light")}>{opp.liveChange >= 0 ? "+" : ""}{opp.liveChange.toFixed(2)}%</span>
                  ) : <span className="text-muted">—</span>}
                </div>
              </div>
              {/* Alignment check */}
              {opp.liveChange !== undefined && (
                <div className="mt-2 pt-2 border-t border-border/20 text-xs">
                  {(opp.bias === "bullish" && opp.liveChange > 0) || (opp.bias === "bearish" && opp.liveChange < 0) ? (
                    <span className="text-bull-light">✓ Strength bias and live price movement are aligned</span>
                  ) : (opp.bias === "bullish" && opp.liveChange < 0) || (opp.bias === "bearish" && opp.liveChange > 0) ? (
                    <span className="text-warn">⚠ Strength bias conflicts with current price movement — lower confidence</span>
                  ) : (
                    <span className="text-muted">Price is flat — waiting for direction confirmation</span>
                  )}
                </div>
              )}
            </div>
          ))}
          {opportunities.length === 0 && (
            <div className="glass-card p-12 text-center"><p className="text-muted">No strong opportunities detected. Currency strengths are too balanced right now.</p></div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How the FX Strength Engine Works</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Strength Calculation</p>
            <p>Each currency&apos;s strength is calculated from its performance across all related pairs. If EUR is rising against USD, GBP, JPY, and CHF simultaneously, EUR scores high. The score is normalized to a 0-100 scale.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Pair Opportunity Detection</p>
            <p>The engine pairs the strongest currency against the weakest to find the highest-probability directional trades. A large spread between two currencies = a cleaner opportunity with more conviction.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Confidence Scoring</p>
            <p>Confidence increases when: the strength spread is large, live price movement aligns with the bias, and multiple timeframes agree. Confidence decreases when price conflicts with the strength reading.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Integration</p>
            <p>Signal engines use strength bias as a filter before publishing setups. Bots can refuse trades where currency strength conflicts with the trade direction. Editor&apos;s Pick surfaces the cleanest strength-imbalance opportunities.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
