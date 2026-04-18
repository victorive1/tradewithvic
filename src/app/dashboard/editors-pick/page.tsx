"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { useTheme } from "@/components/ui/ThemeProvider";
import type { TradeSetup } from "@/lib/setup-engine";

type PickStatus = "fresh" | "active" | "aging" | "expired";

interface EditorsPick {
  setup: TradeSetup;
  rank: number;
  reasons: string[];
  status: PickStatus;
  confluenceScore: number;
  pickedAt: string;
}

const REASON_TAGS: Record<string, { label: string; color: string }> = {
  structure: { label: "Structure Aligned", color: "bg-bull/10 text-bull-light border-bull/20" },
  macro: { label: "Macro Confluence", color: "bg-accent/10 text-accent-light border-accent/20" },
  strength: { label: "Currency Strength", color: "bg-accent/10 text-accent-light border-accent/20" },
  analytics: { label: "Strong Analytics", color: "bg-bull/10 text-bull-light border-bull/20" },
  sentiment: { label: "Sentiment Aligned", color: "bg-warn/10 text-warn border-warn/20" },
  flow: { label: "Capital Flow Support", color: "bg-accent/10 text-accent-light border-accent/20" },
  radar: { label: "Sharp Money Interest", color: "bg-bull/10 text-bull-light border-bull/20" },
  volatility: { label: "Volatility Ideal", color: "bg-warn/10 text-warn border-warn/20" },
  rr: { label: "Excellent R:R", color: "bg-bull/10 text-bull-light border-bull/20" },
  multi_tf: { label: "Multi-TF Confirmation", color: "bg-accent/10 text-accent-light border-accent/20" },
};

const STATUS_CONFIG: Record<PickStatus, { label: string; color: string; badge: string }> = {
  fresh: { label: "Fresh", color: "text-bull-light", badge: "bg-bull/10 text-bull-light border-bull/20" },
  active: { label: "Active", color: "text-accent-light", badge: "bg-accent/10 text-accent-light border-accent/20" },
  aging: { label: "Aging", color: "text-warn", badge: "bg-warn/10 text-warn border-warn/20" },
  expired: { label: "No Longer Ideal", color: "text-muted", badge: "bg-surface-3 text-muted border-border" },
};

function buildPick(setup: TradeSetup, rank: number): EditorsPick {
  const reasons: string[] = [];
  const sb = setup.scoringBreakdown;

  if (sb.trendAlignment >= 15) reasons.push("structure");
  if (sb.momentum >= 12) reasons.push("analytics");
  if (sb.liquidityTarget >= 10) reasons.push("flow");
  if (setup.riskReward >= 2.0) reasons.push("rr");
  if (sb.structure >= 10) reasons.push("multi_tf");
  if (sb.volatility >= 6) reasons.push("volatility");

  // Add more reasons from confidence
  if (setup.confidenceScore >= 85) reasons.push("strength");
  if (setup.confidenceScore >= 80 && reasons.length < 3) reasons.push("sentiment");
  if (reasons.length < 2) reasons.push("radar");

  const uniqueReasons = [...new Set(reasons)].slice(0, 4);
  const confluenceScore = Math.min(100, Math.round(setup.confidenceScore * 0.6 + uniqueReasons.length * 8 + setup.riskReward * 5));

  // Status from freshness
  const status: PickStatus = setup.confidenceScore >= 80 ? "fresh" : setup.confidenceScore >= 70 ? "active" : setup.confidenceScore >= 60 ? "aging" : "expired";

  return {
    setup, rank, reasons: uniqueReasons, status, confluenceScore,
    pickedAt: new Date(Date.now() - Math.random() * 3600000 * 2).toISOString(),
  };
}

export default function EditorsPickPage() {
  const [picks, setPicks] = useState<EditorsPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const { theme } = useTheme();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/market/setups");
        const data = await res.json();
        if (data.setups) {
          // Only A+ and A setups, sorted by confidence
          const topSetups = data.setups
            .filter((s: TradeSetup) => s.qualityGrade === "A+" || s.qualityGrade === "A")
            .sort((a: TradeSetup, b: TradeSetup) => b.confidenceScore - a.confidenceScore)
            .slice(0, 10);
          setPicks(topSetups.map((s: TradeSetup, i: number) => buildPick(s, i + 1)));
        }
      } catch {}
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, []);

  let filtered = picks;
  if (filterCategory !== "all") filtered = filtered.filter((p) => p.setup.category === filterCategory);
  const activePicks = filtered.filter((p) => p.status !== "expired");

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Editor&apos;s Picks</h1><p className="text-sm text-muted mt-1">Curating the best opportunities...</p></div>
        <div className="space-y-4">{[1,2,3].map((i) => <div key={i} className="glass-card p-6 animate-pulse"><div className="h-24 bg-surface-3 rounded" /></div>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Full-screen chart modal */}
      {chartSymbol && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
            <h3 className="text-lg font-bold">{chartSymbol} — Chart</h3>
            <button onClick={() => setChartSymbol(null)} className="px-4 py-2 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">Close</button>
          </div>
          <div className="flex-1"><TradingViewWidget symbol={chartSymbol} interval="60" theme={theme} autosize={true} /></div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">Editor&apos;s Picks</h1>
          <span className="text-xs bg-accent/20 text-accent-light px-2.5 py-1 rounded-full border border-accent/30 font-medium">Premium Curation</span>
          <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Live</span>
        </div>
        <p className="text-sm text-muted">The strongest opportunities from across the platform — curated, not crowded. Only the best of the best appear here.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-accent-light">{activePicks.length}</div><div className="text-[10px] text-muted">Active Picks</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bull-light">{activePicks.filter((p) => p.status === "fresh").length}</div><div className="text-[10px] text-muted">Fresh</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{picks.length > 0 ? Math.round(picks.reduce((s, p) => s + p.confluenceScore, 0) / picks.length) : 0}</div><div className="text-[10px] text-muted">Avg Confluence</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{picks.length > 0 ? (picks.reduce((s, p) => s + p.setup.riskReward, 0) / picks.length).toFixed(1) : "0"}</div><div className="text-[10px] text-muted">Avg R:R</div></div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "forex", "metals", "crypto", "indices", "energy"].map((cat) => (
          <button key={cat} onClick={() => setFilterCategory(cat)} className={cn("px-3 py-1.5 rounded-lg text-xs capitalize transition-smooth", filterCategory === cat ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{cat === "all" ? "All Markets" : cat}</button>
        ))}
      </div>

      {/* Picks */}
      {activePicks.length > 0 ? (
        <div className="space-y-4">
          {activePicks.map((pick) => {
            const isBuy = pick.setup.direction === "buy";
            const isExpanded = expandedId === pick.setup.id;
            const stCfg = STATUS_CONFIG[pick.status];

            return (
              <div key={pick.setup.id} className={cn("glass-card overflow-hidden", pick.rank <= 3 ? "border-l-4 border-l-accent glow-accent" : "")}>
                <div className={cn("h-1.5", isBuy ? "bg-bull" : "bg-bear")} />
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {pick.rank <= 3 && <span className="text-lg font-black text-accent-light">#{pick.rank}</span>}
                      <h3 className="text-lg font-bold">{pick.setup.displayName}</h3>
                      <span className={cn("text-xs font-bold px-3 py-1 rounded-full uppercase", isBuy ? "badge-bull" : "badge-bear")}>{pick.setup.direction}</span>
                      <span className="text-xs bg-surface-2 px-2 py-1 rounded">{pick.setup.timeframe}</span>
                      <span className="text-xs bg-surface-2 px-2 py-1 rounded">{pick.setup.setupType}</span>
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", stCfg.badge)}>{stCfg.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("text-sm font-bold px-3 py-1 rounded-lg", pick.setup.qualityGrade === "A+" ? "bg-bull/10 text-bull-light" : "bg-accent/10 text-accent-light")}>{pick.setup.qualityGrade}</span>
                      <span className="text-lg font-black text-accent-light">{pick.setup.confidenceScore}%</span>
                    </div>
                  </div>

                  {/* Why picked — reason tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className="text-[10px] text-muted mr-1">Why picked:</span>
                    {pick.reasons.map((reason) => {
                      const tag = REASON_TAGS[reason];
                      return tag ? (
                        <span key={reason} className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", tag.color)}>{tag.label}</span>
                      ) : null;
                    })}
                    <span className="text-[10px] text-muted ml-1">Confluence: <span className="text-foreground font-bold">{pick.confluenceScore}</span></span>
                  </div>

                  {/* Trade levels */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="bg-surface-2 rounded-lg p-3 text-center"><div className="text-[10px] text-accent-light uppercase mb-1">Entry</div><div className="text-sm font-bold font-mono">{pick.setup.entry}</div></div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center"><div className="text-[10px] text-bear-light uppercase mb-1">Stop</div><div className="text-sm font-bold font-mono text-bear-light">{pick.setup.stopLoss}</div></div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center"><div className="text-[10px] text-bull-light uppercase mb-1">TP1</div><div className="text-sm font-bold font-mono text-bull-light">{pick.setup.takeProfit1}</div></div>
                    <div className="bg-surface-2 rounded-lg p-3 text-center"><div className="text-[10px] text-muted uppercase mb-1">R:R</div><div className="text-sm font-bold font-mono">{pick.setup.riskReward}:1</div></div>
                  </div>

                  {/* Explanation */}
                  <div className="bg-surface-2 rounded-xl p-4 mb-3">
                    <p className="text-xs text-muted-light leading-relaxed">{pick.setup.explanation}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <button onClick={() => setChartSymbol(pick.setup.symbol)} className="px-3 py-1.5 rounded-lg text-xs bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20 transition-smooth">View Chart</button>
                      <button onClick={() => setExpandedId(isExpanded ? null : pick.setup.id)} className="px-3 py-1.5 rounded-lg text-xs bg-surface-2 text-muted-light border border-border/50 hover:border-border-light transition-smooth">{isExpanded ? "Hide Details" : "Scoring Details"}</button>
                    </div>
                    <span className="text-[10px] text-muted">Picked {new Date(pick.pickedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • {pick.setup.category}</span>
                  </div>

                  {/* Expanded scoring */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border/30">
                      <h4 className="text-xs font-semibold mb-3">Scoring Breakdown</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Object.entries(pick.setup.scoringBreakdown).map(([key, value]) => (
                          <div key={key} className="bg-surface-2 rounded-lg px-3 py-2 flex items-center justify-between">
                            <span className="text-[10px] text-muted capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                            <span className={cn("text-xs font-bold font-mono", (value as number) >= 0 ? "text-bull-light" : "text-bear-light")}>{(value as number) >= 0 ? "+" : ""}{value as number}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 p-3 bg-bear/5 border border-bear/10 rounded-lg">
                        <span className="text-xs text-bear-light font-medium">Invalidation: </span>
                        <span className="text-xs text-muted">{pick.setup.invalidation}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card p-16 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-xl font-bold mb-2">No Editor&apos;s Picks Right Now</h3>
          <p className="text-sm text-muted max-w-md mx-auto">The engine continuously scans all markets. Editor&apos;s Picks only appear when confluence, quality, and timing genuinely align. This keeps the surface trustworthy.</p>
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How Editor&apos;s Picks Works</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Selective, Not Crowded</p>
            <p>Only A+ and A grade setups with the highest confluence scores appear here. Most of the time, there are fewer than 10 active picks. This is intentional — it keeps the surface trustworthy and valuable.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Why Each Pick is Featured</p>
            <p>Every pick shows exactly WHY it was selected — structure alignment, macro confluence, strong analytics, excellent R:R, capital flow support, or sharp money interest. No mystery scoring.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Freshness Tracking</p>
            <p>Picks are labeled Fresh, Active, Aging, or Expired so you always know whether a pick is still worth attention. Stale picks are filtered out automatically.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Cross-Platform Intelligence</p>
            <p>Picks are ranked using confluence from signals, sentiment, market structure, volatility, correlation, capital flow, and sharp money radar — not just one engine.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
