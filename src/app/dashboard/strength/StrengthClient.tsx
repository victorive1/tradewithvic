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

interface TradeSetup {
  pair: string;
  symbol: string;
  bias: "bullish" | "bearish";
  direction: "LONG" | "SHORT";
  strongCurrency: string;
  weakCurrency: string;
  strongRank: number;
  weakRank: number;
  spread: number;
  conviction: number;
  tier: "A+" | "A" | "B" | "C";
  // Levels
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  pipSize: number;
  pipPrecision: number;
  riskPips: number;
  // Context
  liveChange?: number;
  postedAt: number; // epoch ms — when underlying quote was sampled
  reasons: string[];
  // Score breakdown for transparency
  breakdown: {
    spread: number;
    rankGap: number;
    alignment: number;
    momentum: number;
  };
}

const PAIR_MAP: Record<string, [string, string]> = {
  EURUSD: ["EUR", "USD"], GBPUSD: ["GBP", "USD"], USDJPY: ["USD", "JPY"], USDCHF: ["USD", "CHF"],
  AUDUSD: ["AUD", "USD"], NZDUSD: ["NZD", "USD"], USDCAD: ["USD", "CAD"], EURJPY: ["EUR", "JPY"],
  GBPJPY: ["GBP", "JPY"], EURGBP: ["EUR", "GBP"], AUDJPY: ["AUD", "JPY"],
};

function isJpyPair(symbol: string): boolean {
  return symbol.includes("JPY");
}

function pipMetricsFor(symbol: string): { pipSize: number; pipPrecision: number; priceDecimals: number } {
  if (isJpyPair(symbol)) return { pipSize: 0.01, pipPrecision: 0, priceDecimals: 3 };
  return { pipSize: 0.0001, pipPrecision: 0, priceDecimals: 5 };
}

function generateTradeSetups(strength: CurrencyStrength[], quotes: MarketQuote[], postedAt: number): TradeSetup[] {
  const scoreMap: Record<string, number> = {};
  const rankMap: Record<string, number> = {};
  strength.forEach((s) => { scoreMap[s.currency] = s.score; rankMap[s.currency] = s.rank; });

  const setups: TradeSetup[] = [];

  for (const [symbol, [base, counter]] of Object.entries(PAIR_MAP)) {
    const baseScore = scoreMap[base];
    const counterScore = scoreMap[counter];
    const baseRank = rankMap[base];
    const counterRank = rankMap[counter];
    if (baseScore === undefined || counterScore === undefined) continue;

    const spread = Math.abs(baseScore - counterScore);
    if (spread < 4) continue; // need a meaningful imbalance

    const isBullish = baseScore > counterScore;
    const direction: "LONG" | "SHORT" = isBullish ? "LONG" : "SHORT";
    const quote = quotes.find((q) => q.symbol === symbol);
    if (!quote || !quote.price) continue; // setup requires a tradable price

    const { pipSize, priceDecimals } = pipMetricsFor(symbol);

    // Volatility proxy: today's range. Fall back to 50 pips for FX, 80 for JPY.
    const dailyRange = Math.max(0, (quote.high || 0) - (quote.low || 0));
    const fallbackRange = isJpyPair(symbol) ? 0.8 : 0.005; // ~80 pips JPY, ~50 pips others
    const atr = dailyRange > 0 ? dailyRange : fallbackRange;

    // Risk = 0.6 ATR; targets at 1R, 2R, 3.3R (TP3 stretches a bit further than 3:1)
    const risk = atr * 0.6;
    const entry = quote.price;
    const stop = isBullish ? entry - risk : entry + risk;
    const tp1 = isBullish ? entry + risk : entry - risk;
    const tp2 = isBullish ? entry + risk * 2 : entry - risk * 2;
    const tp3 = isBullish ? entry + risk * 3.3 : entry - risk * 3.3;
    const riskPips = risk / pipSize;

    // ── Conviction breakdown ──
    // Spread (0–35): each strength point above 4 contributes ~1.4 pts, capped at 35.
    const spreadPts = Math.min(35, Math.round((spread - 4) * 1.4 + 5));
    // Rank gap (0–25): max 7 (rank 1 vs 8) → 25
    const rankDist = Math.abs(baseRank - counterRank);
    const rankPts = Math.min(25, Math.round((rankDist / 7) * 25));
    // Live alignment (-15 to +25)
    const change = quote.changePercent ?? 0;
    let alignPts = 0;
    if (Math.abs(change) < 0.03) {
      alignPts = 5; // flat — neutral
    } else if ((isBullish && change > 0) || (!isBullish && change < 0)) {
      // Aligned: more aligned movement = more points (cap at 25)
      alignPts = Math.min(25, 10 + Math.round(Math.abs(change) * 15));
    } else {
      // Conflicting price action — penalize
      alignPts = Math.max(-15, -Math.round(Math.abs(change) * 12));
    }
    // Momentum (0–15): strength of move (regardless of direction, since alignment handles direction)
    const momPts = Math.min(15, Math.round(Math.abs(change) * 8));

    const rawConviction = spreadPts + rankPts + alignPts + momPts;
    const conviction = Math.max(0, Math.min(100, rawConviction));

    if (conviction < 35) continue; // not worth showing

    const tier: TradeSetup["tier"] =
      conviction >= 80 ? "A+" : conviction >= 65 ? "A" : conviction >= 50 ? "B" : "C";

    // ── Reason tags ──
    const reasons: string[] = [];
    reasons.push(`Strength spread: ${spread.toFixed(1)} pts`);
    reasons.push(`Rank: #${baseRank} ${base} vs #${counterRank} ${counter}`);
    if (rankMap[base] === 1 && rankMap[counter] === strength.length) reasons.push("Strongest vs weakest on the board");
    if (alignPts > 15) reasons.push(`Price aligned with bias (${change >= 0 ? "+" : ""}${change.toFixed(2)}%)`);
    else if (alignPts < 0) reasons.push(`Price conflicts with bias (${change >= 0 ? "+" : ""}${change.toFixed(2)}%)`);
    if (Math.abs(change) > 0.5) reasons.push(`Strong intraday momentum`);
    if (dailyRange === 0) reasons.push("No range yet — using fallback volatility");

    setups.push({
      pair: `${base}/${counter}`,
      symbol,
      bias: isBullish ? "bullish" : "bearish",
      direction,
      strongCurrency: isBullish ? base : counter,
      weakCurrency: isBullish ? counter : base,
      strongRank: isBullish ? baseRank : counterRank,
      weakRank: isBullish ? counterRank : baseRank,
      spread: Math.round(spread * 10) / 10,
      conviction,
      tier,
      entry: Number(entry.toFixed(priceDecimals)),
      stop: Number(stop.toFixed(priceDecimals)),
      tp1: Number(tp1.toFixed(priceDecimals)),
      tp2: Number(tp2.toFixed(priceDecimals)),
      tp3: Number(tp3.toFixed(priceDecimals)),
      pipSize,
      pipPrecision: priceDecimals,
      riskPips: Math.round(riskPips),
      liveChange: change,
      postedAt,
      reasons,
      breakdown: { spread: spreadPts, rankGap: rankPts, alignment: alignPts, momentum: momPts },
    });
  }

  return setups.sort((a, b) => b.conviction - a.conviction);
}

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

function TierBadge({ tier }: { tier: TradeSetup["tier"] }) {
  const map: Record<TradeSetup["tier"], string> = {
    "A+": "bg-bull/20 text-bull-light border-bull/40",
    "A": "bg-bull/10 text-bull-light border-bull/30",
    "B": "bg-accent/10 text-accent-light border-accent/30",
    "C": "bg-surface-3 text-muted-light border-border/40",
  };
  return <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-md border", map[tier])}>{tier}</span>;
}

function fmtPrice(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

function formatPostedAt(rawTs: number): { label: string; title: string } {
  // MarketQuote.timestamp is stored as Unix seconds; Date expects ms.
  // Anything < 1e12 is seconds (year 2001+ in ms is > 1e12).
  const ts = rawTs < 1e12 ? rawTs * 1000 : rawTs;
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - ts) / 1000));
  let rel: string;
  if (diffSec < 60) rel = "just now";
  else if (diffSec < 3600) rel = `${Math.round(diffSec / 60)}m ago`;
  else if (diffSec < 86400) rel = `${Math.round(diffSec / 3600)}h ago`;
  else rel = `${Math.round(diffSec / 86400)}d ago`;
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const full = d.toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });
  return { label: `Posted ${time} · ${rel}`, title: full };
}

function TradeSetupCard({ setup }: { setup: TradeSetup }) {
  const isLong = setup.direction === "LONG";
  const tpDeltas = [
    Math.round(Math.abs(setup.tp1 - setup.entry) / setup.pipSize),
    Math.round(Math.abs(setup.tp2 - setup.entry) / setup.pipSize),
    Math.round(Math.abs(setup.tp3 - setup.entry) / setup.pipSize),
  ];
  const convColor = setup.conviction >= 80 ? "text-bull-light" : setup.conviction >= 65 ? "text-bull" : setup.conviction >= 50 ? "text-accent-light" : "text-muted-light";
  const convBar = setup.conviction >= 80 ? "bg-bull" : setup.conviction >= 65 ? "bg-bull/80" : setup.conviction >= 50 ? "bg-accent" : "bg-surface-3";
  const dec = setup.pipPrecision;
  const posted = formatPostedAt(setup.postedAt);

  return (
    <div className="glass-card p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-black text-foreground tracking-tight">{setup.pair}</h3>
            <span className={cn("text-[11px] font-black px-2.5 py-1 rounded-md", isLong ? "badge-bull" : "badge-bear")}>{setup.direction}</span>
            <TierBadge tier={setup.tier} />
            <span className="text-[10px] text-muted">
              #{setup.strongRank} {setup.strongCurrency} → #{setup.weakRank} {setup.weakCurrency}
            </span>
          </div>
          <div className="text-[10px] text-muted" title={posted.title}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-bull mr-1.5 align-middle" />
            {posted.label}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted">Conviction</div>
          <div className={cn("text-2xl font-black leading-none", convColor)}>{setup.conviction}</div>
          <div className="w-24 h-1 rounded-full bg-surface-3 overflow-hidden mt-1">
            <div className={cn("h-full rounded-full", convBar)} style={{ width: `${setup.conviction}%` }} />
          </div>
        </div>
      </div>

      {/* Levels grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        <div className="bg-surface-2 rounded-lg p-2.5">
          <div className="text-[10px] text-muted mb-0.5">Entry</div>
          <div className="font-mono text-sm font-bold text-foreground">{fmtPrice(setup.entry, dec)}</div>
          <div className="text-[10px] text-muted mt-0.5">market</div>
        </div>
        <div className="bg-bear/5 border border-bear/20 rounded-lg p-2.5">
          <div className="text-[10px] text-bear-light mb-0.5">Stop</div>
          <div className="font-mono text-sm font-bold text-bear-light">{fmtPrice(setup.stop, dec)}</div>
          <div className="text-[10px] text-muted mt-0.5">−{setup.riskPips} pips</div>
        </div>
        <div className="bg-bull/5 border border-bull/20 rounded-lg p-2.5">
          <div className="text-[10px] text-bull-light mb-0.5">TP1 · 1R</div>
          <div className="font-mono text-sm font-bold text-bull-light">{fmtPrice(setup.tp1, dec)}</div>
          <div className="text-[10px] text-muted mt-0.5">+{tpDeltas[0]} pips</div>
        </div>
        <div className="bg-bull/5 border border-bull/20 rounded-lg p-2.5">
          <div className="text-[10px] text-bull-light mb-0.5">TP2 · 2R</div>
          <div className="font-mono text-sm font-bold text-bull-light">{fmtPrice(setup.tp2, dec)}</div>
          <div className="text-[10px] text-muted mt-0.5">+{tpDeltas[1]} pips</div>
        </div>
        <div className="bg-bull/10 border border-bull/30 rounded-lg p-2.5">
          <div className="text-[10px] text-bull-light mb-0.5">TP3 · 3.3R</div>
          <div className="font-mono text-sm font-bold text-bull-light">{fmtPrice(setup.tp3, dec)}</div>
          <div className="text-[10px] text-muted mt-0.5">+{tpDeltas[2]} pips</div>
        </div>
      </div>

      {/* Reasons */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {setup.reasons.map((r, i) => (
          <span key={i} className="text-[10px] text-muted-light bg-surface-2 border border-border/30 rounded-full px-2 py-0.5">{r}</span>
        ))}
      </div>

      {/* Conviction breakdown */}
      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border/20 text-[10px]">
        <div className="text-center">
          <div className="text-muted">Spread</div>
          <div className="font-bold text-foreground">{setup.breakdown.spread}/35</div>
        </div>
        <div className="text-center">
          <div className="text-muted">Rank Gap</div>
          <div className="font-bold text-foreground">{setup.breakdown.rankGap}/25</div>
        </div>
        <div className="text-center">
          <div className="text-muted">Alignment</div>
          <div className={cn("font-bold", setup.breakdown.alignment >= 0 ? "text-foreground" : "text-bear-light")}>{setup.breakdown.alignment >= 0 ? "+" : ""}{setup.breakdown.alignment}/25</div>
        </div>
        <div className="text-center">
          <div className="text-muted">Momentum</div>
          <div className="font-bold text-foreground">{setup.breakdown.momentum}/15</div>
        </div>
      </div>
    </div>
  );
}

export function StrengthClient({ strength, quotes, capturedAt }: { strength: CurrencyStrength[]; quotes: MarketQuote[]; capturedAt?: number | null }) {
  const [view, setView] = useState<"ranking" | "heatmap" | "opportunities" | "setups">("ranking");
  const maxScore = Math.max(...strength.map((s) => s.score), 1);
  const strongest = strength[0];
  const weakest = strength[strength.length - 1];
  const opportunities = generateOpportunities(strength, quotes);
  const postedAt = capturedAt || Date.now();
  const setups = generateTradeSetups(strength, quotes, postedAt);
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
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "ranking" as const, label: "Strength Ranking" },
          { id: "heatmap" as const, label: "Heatmap" },
          { id: "opportunities" as const, label: `Pair Opportunities (${opportunities.length})` },
          { id: "setups" as const, label: `Trade Setups (${setups.length})` },
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

      {/* TRADE SETUPS VIEW */}
      {view === "setups" && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted">
              Concrete trade plans built from the strength ranking. Levels use the day&apos;s range as a volatility proxy. Conviction blends strength spread, rank gap, live-price alignment, and momentum.
            </p>
            <div className="flex items-center gap-3 text-[10px] text-muted">
              <span className="flex items-center gap-1"><TierBadge tier="A+" /> 80+</span>
              <span className="flex items-center gap-1"><TierBadge tier="A" /> 65–79</span>
              <span className="flex items-center gap-1"><TierBadge tier="B" /> 50–64</span>
              <span className="flex items-center gap-1"><TierBadge tier="C" /> 35–49</span>
            </div>
          </div>
          {setups.map((s) => <TradeSetupCard key={s.symbol} setup={s} />)}
          {setups.length === 0 && (
            <div className="glass-card p-12 text-center">
              <p className="text-muted">No tradable setups right now. The currency board is too balanced or live quotes are missing.</p>
            </div>
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
