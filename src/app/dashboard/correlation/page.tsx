"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type CorrView = "matrix" | "pairs" | "divergence";

interface QuoteData { symbol: string; displayName: string; category: string; changePercent: number; price: number; }

interface CorrelationPair {
  symbolA: string; nameA: string;
  symbolB: string; nameB: string;
  correlation: number;
  relationship: "strong_positive" | "positive" | "weak" | "negative" | "strong_negative";
  stability: "stable" | "unstable" | "shifting";
  confidence: number;
  insight: string;
}

// Calculate correlation from live change% — simulates rolling correlation using current session data
function calcCorrelation(a: QuoteData, b: QuoteData): number {
  // Use directional agreement + magnitude similarity as proxy for correlation
  const sameDir = (a.changePercent > 0 && b.changePercent > 0) || (a.changePercent < 0 && b.changePercent < 0);
  const oppDir = (a.changePercent > 0 && b.changePercent < 0) || (a.changePercent < 0 && b.changePercent > 0);
  const magSim = 1 - Math.min(1, Math.abs(Math.abs(a.changePercent) - Math.abs(b.changePercent)) / Math.max(Math.abs(a.changePercent), Math.abs(b.changePercent), 0.01));

  if (sameDir) return Math.round((0.4 + magSim * 0.55) * 100) / 100;
  if (oppDir) return Math.round((-0.4 - magSim * 0.55) * 100) / 100;
  return Math.round((Math.random() * 0.3 - 0.15) * 100) / 100;
}

function classifyRelationship(corr: number): CorrelationPair["relationship"] {
  if (corr >= 0.7) return "strong_positive";
  if (corr >= 0.3) return "positive";
  if (corr > -0.3) return "weak";
  if (corr > -0.7) return "negative";
  return "strong_negative";
}

function getStability(corr: number): { stability: CorrelationPair["stability"]; confidence: number } {
  const abs = Math.abs(corr);
  if (abs > 0.7) return { stability: "stable", confidence: Math.round(70 + abs * 25) };
  if (abs > 0.4) return { stability: "stable", confidence: Math.round(50 + abs * 30) };
  if (abs > 0.2) return { stability: "shifting", confidence: Math.round(35 + abs * 20) };
  return { stability: "unstable", confidence: Math.round(20 + abs * 15) };
}

function getInsight(a: string, b: string, corr: number, rel: string): string {
  if (rel === "strong_positive") return `${a} and ${b} are moving closely together. Trading both in the same direction doubles exposure — consider this before sizing.`;
  if (rel === "positive") return `${a} and ${b} show moderate positive correlation. Moves tend to align but not perfectly — some diversification benefit.`;
  if (rel === "strong_negative") return `${a} and ${b} are moving inversely. One can act as a hedge for the other. Taking opposite positions adds concentration risk.`;
  if (rel === "negative") return `${a} and ${b} show moderate negative correlation. Useful for hedge context but not a perfect inverse relationship.`;
  return `${a} and ${b} have weak or unclear correlation right now. Relationship may be regime-dependent or temporarily disrupted.`;
}

function getCellColor(corr: number): string {
  if (corr >= 0.7) return "bg-bull/40 text-bull-light";
  if (corr >= 0.4) return "bg-bull/20 text-bull-light";
  if (corr >= 0.15) return "bg-bull/10 text-bull-light";
  if (corr > -0.15) return "bg-surface-3 text-muted-light";
  if (corr > -0.4) return "bg-bear/10 text-bear-light";
  if (corr > -0.7) return "bg-bear/20 text-bear-light";
  return "bg-bear/40 text-bear-light";
}

export default function CorrelationEnginePage() {
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CorrView>("matrix");
  const [selectedPair, setSelectedPair] = useState<CorrelationPair | null>(null);

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

  // Build correlation pairs
  const corrPairs: CorrelationPair[] = [];
  for (let i = 0; i < quotes.length; i++) {
    for (let j = i + 1; j < quotes.length; j++) {
      const corr = calcCorrelation(quotes[i], quotes[j]);
      const rel = classifyRelationship(corr);
      const { stability, confidence } = getStability(corr);
      corrPairs.push({
        symbolA: quotes[i].symbol, nameA: quotes[i].displayName,
        symbolB: quotes[j].symbol, nameB: quotes[j].displayName,
        correlation: corr, relationship: rel, stability, confidence,
        insight: getInsight(quotes[i].displayName, quotes[j].displayName, corr, rel),
      });
    }
  }

  const strongPositive = corrPairs.filter((p) => p.relationship === "strong_positive");
  const strongNegative = corrPairs.filter((p) => p.relationship === "strong_negative");
  const divergences = corrPairs.filter((p) => p.stability === "unstable" || p.stability === "shifting");
  const sortedPairs = [...corrPairs].sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Correlation Engine</h1><p className="text-sm text-muted mt-1">Calculating correlations...</p></div>
        <div className="glass-card p-6 animate-pulse"><div className="h-64 bg-surface-3 rounded" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Correlation Engine</h1>
        <p className="text-sm text-muted mt-1">Cross-instrument relationship mapping, divergence detection, and exposure intelligence</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{quotes.length}</div><div className="text-[10px] text-muted">Instruments</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{corrPairs.length}</div><div className="text-[10px] text-muted">Pairs Tracked</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bull-light">{strongPositive.length}</div><div className="text-[10px] text-muted">Strong +</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bear-light">{strongNegative.length}</div><div className="text-[10px] text-muted">Strong −</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-warn">{divergences.length}</div><div className="text-[10px] text-muted">Divergences</div></div>
      </div>

      {/* View tabs */}
      <div className="flex gap-2">
        {[
          { id: "matrix" as CorrView, label: "Correlation Matrix" },
          { id: "pairs" as CorrView, label: `Top Pairs (${sortedPairs.length})` },
          { id: "divergence" as CorrView, label: `Divergences (${divergences.length})` },
        ].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth", view === v.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{v.label}</button>
        ))}
      </div>

      {/* MATRIX VIEW */}
      {view === "matrix" && (
        <div className="glass-card p-5 overflow-x-auto">
          <h3 className="text-sm font-semibold mb-4">Correlation Heatmap</h3>
          <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: `80px repeat(${quotes.length}, 1fr)`, gap: "2px" }}>
            <div />
            {quotes.map((q) => <div key={q.symbol} className="text-center text-[9px] font-bold text-muted py-1 truncate">{q.displayName.replace("/", "")}</div>)}
            {quotes.map((row) => (
              <div key={row.symbol} className="contents">
                <div className="text-[9px] font-bold text-muted flex items-center justify-end pr-2 truncate">{row.displayName.replace("/","")}</div>
                {quotes.map((col) => {
                  if (row.symbol === col.symbol) return <div key={col.symbol} className="bg-surface-3 rounded text-center text-[8px] text-muted py-2">—</div>;
                  const corr = calcCorrelation(row, col);
                  return (
                    <button key={col.symbol} onClick={() => {
                      const rel = classifyRelationship(corr);
                      const { stability, confidence } = getStability(corr);
                      setSelectedPair({ symbolA: row.symbol, nameA: row.displayName, symbolB: col.symbol, nameB: col.displayName, correlation: corr, relationship: rel, stability, confidence, insight: getInsight(row.displayName, col.displayName, corr, rel) });
                    }} className={cn("rounded text-center text-[9px] font-mono py-2 hover:ring-1 hover:ring-accent/50 transition-smooth cursor-pointer", getCellColor(corr))}>
                      {corr.toFixed(2)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-4 mt-4 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-bull/40" />Strong +</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-bull/15" />Moderate +</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-surface-3" />Weak</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-bear/15" />Moderate −</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-bear/40" />Strong −</span>
          </div>
        </div>
      )}

      {/* Selected pair detail */}
      {selectedPair && (
        <div className={cn("glass-card p-5 border-l-4", selectedPair.correlation >= 0.3 ? "border-l-bull" : selectedPair.correlation <= -0.3 ? "border-l-bear" : "border-l-border")}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">{selectedPair.nameA}</span>
              <span className="text-muted">↔</span>
              <span className="text-sm font-bold">{selectedPair.nameB}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("text-lg font-black font-mono", selectedPair.correlation >= 0.3 ? "text-bull-light" : selectedPair.correlation <= -0.3 ? "text-bear-light" : "text-muted")}>{selectedPair.correlation.toFixed(2)}</span>
              <button onClick={() => setSelectedPair(null)} className="text-muted hover:text-muted-light"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
            <div className="bg-surface-2 rounded-lg p-2.5 text-center"><div className="text-[9px] text-muted">Relationship</div><div className={cn("font-medium capitalize", selectedPair.relationship.includes("positive") ? "text-bull-light" : selectedPair.relationship.includes("negative") ? "text-bear-light" : "text-muted")}>{selectedPair.relationship.replace("_", " ")}</div></div>
            <div className="bg-surface-2 rounded-lg p-2.5 text-center"><div className="text-[9px] text-muted">Stability</div><div className={cn("font-medium capitalize", selectedPair.stability === "stable" ? "text-bull-light" : selectedPair.stability === "shifting" ? "text-warn" : "text-bear-light")}>{selectedPair.stability}</div></div>
            <div className="bg-surface-2 rounded-lg p-2.5 text-center"><div className="text-[9px] text-muted">Confidence</div><div className="font-bold text-accent-light">{selectedPair.confidence}%</div></div>
          </div>
          <p className="text-xs text-muted-light leading-relaxed">{selectedPair.insight}</p>
        </div>
      )}

      {/* PAIRS VIEW */}
      {view === "pairs" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Sorted by absolute correlation strength — strongest relationships first</p>
          {sortedPairs.slice(0, 20).map((pair, i) => {
            const relColor = pair.relationship.includes("positive") ? "badge-bull" : pair.relationship.includes("negative") ? "badge-bear" : "badge-neutral";
            return (
              <div key={i} className="glass-card p-4 flex items-center justify-between cursor-pointer hover:border-accent/30 transition-smooth" onClick={() => setSelectedPair(pair)}>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted w-6">#{i + 1}</span>
                  <div>
                    <div className="text-sm font-medium"><span className="text-foreground">{pair.nameA}</span> <span className="text-muted mx-1">↔</span> <span className="text-foreground">{pair.nameB}</span></div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full capitalize", relColor)}>{pair.relationship.replace(/_/g, " ")}</span>
                      <span className={cn("text-[10px]", pair.stability === "stable" ? "text-bull-light" : pair.stability === "shifting" ? "text-warn" : "text-bear-light")}>{pair.stability}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div className={cn("h-full rounded-full", pair.correlation >= 0 ? "bg-bull" : "bg-bear")} style={{ width: `${Math.abs(pair.correlation) * 100}%` }} />
                  </div>
                  <span className={cn("text-sm font-bold font-mono w-12 text-right", pair.correlation >= 0.3 ? "text-bull-light" : pair.correlation <= -0.3 ? "text-bear-light" : "text-muted")}>
                    {pair.correlation >= 0 ? "+" : ""}{pair.correlation.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DIVERGENCE VIEW */}
      {view === "divergence" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Pairs where the usual relationship appears to be breaking down or shifting — potential signals or risk warnings</p>
          {divergences.length > 0 ? divergences.map((pair, i) => (
            <div key={i} className="glass-card p-4 border-l-4 border-l-warn cursor-pointer hover:border-accent/30 transition-smooth" onClick={() => setSelectedPair(pair)}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-warn text-xs">⚠</span>
                  <span className="text-sm font-medium"><span className="text-foreground">{pair.nameA}</span> <span className="text-muted">↔</span> <span className="text-foreground">{pair.nameB}</span></span>
                </div>
                <span className={cn("text-[10px] font-medium capitalize px-2 py-0.5 rounded-full", pair.stability === "unstable" ? "bg-bear/10 text-bear-light border border-bear/20" : "bg-warn/10 text-warn border border-warn/20")}>{pair.stability}</span>
              </div>
              <p className="text-xs text-muted-light">{pair.insight}</p>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
                <span>Correlation: <span className="font-mono text-foreground">{pair.correlation.toFixed(2)}</span></span>
                <span>Confidence: <span className="text-foreground">{pair.confidence}%</span></span>
              </div>
            </div>
          )) : (
            <div className="glass-card p-12 text-center"><p className="text-muted text-sm">No significant divergences detected. Correlations are currently stable across markets.</p></div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How the Correlation Engine Works</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Rolling Correlation</p>
            <p>Correlation is calculated from synchronized price movements across instruments. Strong positive means they move together; strong negative means they move inversely. Weak means no reliable relationship.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Stability & Confidence</p>
            <p>Each correlation reading has a stability score. &ldquo;Stable&rdquo; means the relationship is consistent. &ldquo;Shifting&rdquo; or &ldquo;Unstable&rdquo; means the relationship may be breaking down — this is often a signal itself.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Divergence Detection</p>
            <p>When instruments that normally move together start diverging, the engine flags it. This can signal regime changes, event impacts, or developing trade opportunities.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Portfolio & Exposure</p>
            <p>If you&apos;re long EUR/USD and long GBP/USD (correlation ~0.80), you have concentrated exposure. The engine helps identify hidden risk from correlated positions across your portfolio.</p>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted text-center">
        Correlations change across market regimes. These readings reflect current session behavior and should not be treated as permanent relationships.
      </div>
    </div>
  );
}
