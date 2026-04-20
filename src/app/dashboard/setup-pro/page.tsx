"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { useTheme } from "@/components/ui/ThemeProvider";
import type { TradeSetup } from "@/lib/setup-engine";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { TimeframeFilter, type TimeframeValue, matchesTimeframe, buildTimeframeCounts } from "@/components/dashboard/TimeframeFilter";

function ProSetupCard({ setup, onViewChart }: { setup: TradeSetup; onViewChart: (symbol: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = setup.direction === "buy";

  return (
    <div className="glass-card overflow-hidden">
      <div className={cn("h-1.5", isBuy ? "bg-bull" : "bg-bear")} />
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-foreground">{setup.displayName}</h3>
            <span className={cn("text-xs font-bold px-3 py-1 rounded-full uppercase", isBuy ? "badge-bull" : "badge-bear")}>{setup.direction}</span>
            <span className="text-xs bg-surface-2 px-2 py-1 rounded text-muted-light">{setup.timeframe}</span>
            <span className="text-xs bg-surface-2 px-2 py-1 rounded text-muted-light">{setup.setupType}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-sm font-bold px-3 py-1 rounded-lg", setup.qualityGrade.startsWith("A") ? "bg-bull/10 text-bull-light" : "bg-warn/10 text-warn")}>{setup.qualityGrade}</span>
            <span className="text-lg font-black text-accent-light">{setup.confidenceScore}%</span>
          </div>
        </div>

        {/* Real TradingView Chart */}
        <div className="h-64 rounded-xl overflow-hidden border border-border/30 mb-4 relative">
          <div className="absolute inset-0">
            <TradingViewWidget symbol={setup.symbol} interval={setup.timeframe === "4h" ? "240" : setup.timeframe === "1h" ? "60" : setup.timeframe === "15m" ? "15" : "5"} height={256} autosize={false} theme="dark" />
          </div>
          <button onClick={() => onViewChart(setup.symbol)}
            className="absolute bottom-3 right-3 z-10 px-3 py-1.5 bg-accent/90 backdrop-blur-sm border border-accent/30 rounded-lg text-xs text-white hover:bg-accent transition-smooth">
            Expand Chart
          </button>
        </div>

        {/* Trade levels */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-accent-light uppercase tracking-wider mb-1">Entry</div>
            <div className="text-sm font-bold text-foreground font-mono">{setup.entry}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-bear-light uppercase tracking-wider mb-1">Stop</div>
            <div className="text-sm font-bold text-bear-light font-mono">{setup.stopLoss}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-bull-light uppercase tracking-wider mb-1">TP1</div>
            <div className="text-sm font-bold text-bull-light font-mono">{setup.takeProfit1}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-bull-light uppercase tracking-wider mb-1">TP2</div>
            <div className="text-sm font-bold text-bull-light font-mono">{setup.takeProfit2 || "—"}</div>
          </div>
        </div>

        {/* RR and validity */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted">R:R <strong className="text-foreground">{setup.riskReward}:1</strong></span>
            <span className="text-xs capitalize bg-surface-2 px-2 py-0.5 rounded text-muted-light">{setup.category}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-bull pulse-live" />
            <span className="text-xs text-bull-light font-medium">Active</span>
          </div>
        </div>

        {/* Explanation */}
        <div className="bg-surface-2 rounded-xl p-4 mb-4">
          <p className="text-sm text-muted-light leading-relaxed">{setup.explanation}</p>
        </div>

        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <ExecuteTradeButton
            setup={{
              symbol: setup.symbol,
              direction: setup.direction,
              entry: setup.entry,
              stopLoss: setup.stopLoss,
              takeProfit: setup.takeProfit1,
              timeframe: setup.timeframe,
              setupType: setup.setupType,
              qualityGrade: setup.qualityGrade,
              confidenceScore: setup.confidenceScore,
              sourceType: "setup_pro",
              sourceRef: setup.id,
            }}
            size="md"
          />
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-accent-light hover:text-accent transition-smooth">
            {expanded ? "Hide scoring breakdown" : "View scoring breakdown"}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(setup.scoringBreakdown).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                  <span className="text-xs text-muted capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                  <span className={cn("text-xs font-bold font-mono", (value as number) >= 0 ? "text-bull-light" : "text-bear-light")}>
                    {(value as number) >= 0 ? "+" : ""}{value as number}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-bear/5 border border-bear/10 rounded-lg">
              <span className="text-xs text-bear-light font-medium">Invalidation: </span>
              <span className="text-xs text-muted">{setup.invalidation}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Full-screen chart modal
function ChartModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const { theme } = useTheme();
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <h3 className="text-lg font-bold text-foreground">{symbol} — Full Chart</h3>
        <button onClick={onClose} className="px-4 py-2 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm hover:border-border-light transition-smooth">Close</button>
      </div>
      <div className="flex-1">
        <TradingViewWidget symbol={symbol} interval="60" theme={theme} autosize={true} />
      </div>
    </div>
  );
}

export default function SetupProPage() {
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [timeframe, setTimeframe] = useState<TimeframeValue>("all");
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // cache: "no-store" + timestamp query keeps the setup feed truly live.
        const res = await fetch(`/api/market/setups?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data.setups) {
          // Only show A+ and A setups for Pro
          const pro = data.setups.filter((s: TradeSetup) => s.qualityGrade === "A+" || s.qualityGrade === "A");
          setSetups(pro);
          setLastUpdated(data.timestamp ?? Date.now());
        }
      } catch (e) { console.error("Failed to load setups:", e); }
      if (!cancelled) setLoading(false);
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;
  const freshnessLabel = ageSec == null ? null
    : ageSec < 60 ? `${ageSec}s ago`
    : `${Math.floor(ageSec / 60)}m ago`;

  const filteredByDirection = filter === "all" ? setups : setups.filter((s) => s.direction === filter);
  const timeframeCounts = buildTimeframeCounts(filteredByDirection, (s) => s.timeframe);
  const filtered = filteredByDirection.filter((s) => matchesTimeframe(s.timeframe, timeframe));
  const avgConf = filtered.length > 0 ? Math.round(filtered.reduce((a, b) => a + b.confidenceScore, 0) / filtered.length) : 0;
  const avgRR = filtered.length > 0 ? (filtered.reduce((a, b) => a + b.riskReward, 0) / filtered.length).toFixed(1) : "0";

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Trade Setup Pro</h1><p className="text-sm text-muted mt-1">Loading premium setups...</p></div>
        <div className="space-y-6">{[1, 2, 3].map((i) => (<div key={i} className="glass-card p-6 animate-pulse"><div className="h-4 bg-surface-3 rounded w-32 mb-4" /><div className="h-64 bg-surface-3 rounded-xl mb-4" /><div className="grid grid-cols-4 gap-3 mb-4">{[1,2,3,4].map((j) => <div key={j} className="h-16 bg-surface-3 rounded-lg" />)}</div></div>))}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {chartSymbol && <ChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />}

      <div>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Trade Setup Pro</h1>
          <span className="text-xs bg-accent/20 text-accent-light px-2 py-0.5 rounded-full border border-accent/30">Premium</span>
          <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Live</span>
          {freshnessLabel && (
            <span className="text-xs text-muted">Last updated {freshnessLabel} · refreshes every 60s</span>
          )}
        </div>
        <p className="text-sm text-muted">Curated A+ and A setups only. Real-time charts. Quality over quantity.</p>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Active Setups</div><div className="text-2xl font-bold text-foreground">{filtered.length}</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">A+ Grade</div><div className="text-2xl font-bold text-bull-light">{filtered.filter((s) => s.qualityGrade === "A+").length}</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Avg Confidence</div><div className="text-2xl font-bold text-accent-light">{avgConf}%</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Avg R:R</div><div className="text-2xl font-bold text-warn">{avgRR}</div></div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", "buy", "sell"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth capitalize",
              filter === f ? (f === "buy" ? "bg-bull text-white" : f === "sell" ? "bg-bear text-white" : "bg-accent text-white") : "bg-surface-2 text-muted-light border border-border/50")}>
            {f === "all" ? "All Setups" : f === "buy" ? "Bullish" : "Bearish"}
          </button>
        ))}
      </div>

      <TimeframeFilter value={timeframe} onChange={setTimeframe} counts={timeframeCounts} />

      {filtered.length > 0 ? (
        <div className="space-y-6">
          {filtered.map((setup) => (<ProSetupCard key={setup.id} setup={setup} onViewChart={(sym) => setChartSymbol(sym)} />))}
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No A+ or A setups right now</h3>
          <p className="text-sm text-muted max-w-md mx-auto">The engine continuously scans all markets and will surface premium opportunities when conditions align. Only the strongest setups appear here.</p>
        </div>
      )}
    </div>
  );
}
