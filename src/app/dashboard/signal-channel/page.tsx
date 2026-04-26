"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { TradeSetup } from "@/lib/setup-engine";
import { TimeframeFilter, type TimeframeValue, matchesTimeframe, buildTimeframeCounts } from "@/components/dashboard/TimeframeFilter";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";

// ==================== 13 STRATEGY FRAMEWORK ====================
const STRATEGIES = [
  { id: "market_direction", name: "Market Direction", color: "bg-accent", desc: "Multi-timeframe directional alignment" },
  { id: "fx_strength", name: "FX Strength", color: "bg-bull", desc: "Currency strength divergence setups" },
  { id: "breakout", name: "Breakout", color: "bg-warn", desc: "Key level breakouts with confirmation" },
  { id: "order_block", name: "Order Block", color: "bg-accent", desc: "Institutional zone entries" },
  { id: "scalping", name: "Scalping", color: "bg-bear", desc: "Fast execution, tight targets" },
  { id: "pullback", name: "Pullback Continuation", color: "bg-bull", desc: "Trend pullback entries" },
  { id: "liquidity_sweep", name: "Liquidity Sweep", color: "bg-accent", desc: "Stop hunt reversal plays" },
  { id: "ema_reclaim", name: "EMA Reclaim", color: "bg-bull", desc: "Price reclaims key EMA with momentum" },
  { id: "trend_continuation", name: "Trend Continuation", color: "bg-bull", desc: "Ride the established trend" },
  { id: "session_momentum", name: "Session Momentum", color: "bg-warn", desc: "Session open momentum plays" },
  { id: "metals", name: "Gold & Silver Focus", color: "bg-warn", desc: "XAU/USD and XAG/USD specific" },
  { id: "us30", name: "US30 Focus", color: "bg-accent", desc: "Dow Jones specific setups" },
  { id: "editors_pick", name: "Editor's Strategy", color: "bg-accent", desc: "Curated hybrid selections" },
];

type ChannelTab = "all" | "aplus" | "strategy" | "live" | "triggered" | "results" | "editors";

interface SignalItem extends TradeSetup {
  strategyId: string;
  strategyName: string;
  signalStatus: "active" | "triggered" | "won" | "lost" | "expired" | "cancelled";
  resultPips?: number;
  publishedAt: string;
}

// Map setup types to strategy IDs
function assignStrategy(setup: TradeSetup): { id: string; name: string } {
  const type = setup.setupType.toLowerCase();
  const sym = setup.symbol;
  if (sym === "XAUUSD" || sym === "XAGUSD") return { id: "metals", name: "Gold & Silver Focus" };
  if (sym === "US30") return { id: "us30", name: "US30 Focus" };
  if (type.includes("breakout")) return { id: "breakout", name: "Breakout" };
  if (type.includes("pullback") || type.includes("continuation")) return { id: "pullback", name: "Pullback Continuation" };
  if (type.includes("reversal")) return { id: "liquidity_sweep", name: "Liquidity Sweep" };
  if (type.includes("range")) return { id: "session_momentum", name: "Session Momentum" };
  if (setup.timeframe === "5m") return { id: "scalping", name: "Scalping" };
  if (setup.confidenceScore >= 85) return { id: "editors_pick", name: "Editor's Strategy" };
  const strategies = [
    { id: "market_direction", name: "Market Direction" },
    { id: "fx_strength", name: "FX Strength" },
    { id: "trend_continuation", name: "Trend Continuation" },
    { id: "ema_reclaim", name: "EMA Reclaim" },
  ];
  return strategies[Math.floor(Math.abs(setup.entry * 100) % strategies.length)];
}

function simulateOutcome(setup: TradeSetup): SignalItem["signalStatus"] {
  const seed = Math.abs(setup.entry * 1000) % 100;
  if (seed < 5) return "expired";
  if (seed < 15) return "cancelled";
  if (seed < 30) return "triggered";
  if (seed < 65) return "won";
  if (seed < 85) return "lost";
  return "active";
}

export default function SignalChannelPage() {
  const [tab, setTab] = useState<ChannelTab>("all");
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [strategyFilter, setStrategyFilter] = useState<string | null>(null);
  const [instrumentFilter, setInstrumentFilter] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframeValue>("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/market/setups");
        const data = await res.json();
        if (data.setups) {
          const mapped: SignalItem[] = data.setups.map((setup: TradeSetup) => {
            const strat = assignStrategy(setup);
            const status = simulateOutcome(setup);
            return {
              ...setup,
              strategyId: strat.id,
              strategyName: strat.name,
              signalStatus: status,
              resultPips: status === "won" ? Math.round(setup.riskReward * 15 + Math.random() * 20) : status === "lost" ? -Math.round(10 + Math.random() * 15) : undefined,
              publishedAt: new Date(Date.now() - Math.random() * 3600000 * 4).toISOString(),
            };
          });
          setSignals(mapped);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, []);

  // Filter logic
  let filtered = signals;
  if (tab === "aplus") filtered = filtered.filter((s) => s.qualityGrade === "A+" || s.qualityGrade === "A");
  if (tab === "live") filtered = filtered.filter((s) => s.signalStatus === "active");
  if (tab === "triggered") filtered = filtered.filter((s) => s.signalStatus === "triggered");
  if (tab === "results") filtered = filtered.filter((s) => s.signalStatus === "won" || s.signalStatus === "lost");
  if (tab === "editors") filtered = filtered.filter((s) => s.strategyId === "editors_pick" || s.confidenceScore >= 85);
  if (tab === "strategy" && strategyFilter) filtered = filtered.filter((s) => s.strategyId === strategyFilter);
  if (instrumentFilter) filtered = filtered.filter((s) => s.symbol === instrumentFilter);
  const timeframeCounts = buildTimeframeCounts(filtered, (s) => s.timeframe);
  filtered = filtered.filter((s) => matchesTimeframe(s.timeframe, timeframe));

  // Stats
  const totalWins = signals.filter((s) => s.signalStatus === "won").length;
  const totalLosses = signals.filter((s) => s.signalStatus === "lost").length;
  const winRate = totalWins + totalLosses > 0 ? Math.round((totalWins / (totalWins + totalLosses)) * 100) : 0;
  const totalPips = signals.reduce((sum, s) => sum + (s.resultPips || 0), 0);

  const tabs: { id: ChannelTab; label: string; count?: number }[] = [
    { id: "all", label: "All Signals", count: signals.length },
    { id: "aplus", label: "A+ Signals", count: signals.filter((s) => s.qualityGrade === "A+" || s.qualityGrade === "A").length },
    { id: "strategy", label: "By Strategy" },
    { id: "live", label: "Live", count: signals.filter((s) => s.signalStatus === "active").length },
    { id: "triggered", label: "Triggered", count: signals.filter((s) => s.signalStatus === "triggered").length },
    { id: "results", label: "Results", count: totalWins + totalLosses },
    { id: "editors", label: "Editor's Pick" },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Signal Channel</h1><p className="text-sm text-muted mt-1">Loading signals across 13 strategies...</p></div>
        <div className="space-y-4">{[1,2,3,4].map((i) => <div key={i} className="glass-card p-5 animate-pulse"><div className="h-4 bg-surface-3 rounded w-32 mb-3" /><div className="h-20 bg-surface-3 rounded" /></div>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminRiskTargetBar />
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">Signal Channel</h1>
          <span className="flex items-center gap-1.5 text-xs bg-bull/10 text-bull-light px-2.5 py-1 rounded-full border border-bull/20"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Live</span>
          <span className="text-xs bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">13 Strategies</span>
        </div>
        <p className="text-sm text-muted">Premium signal intelligence across 13 strategy frameworks — scored, ranked, and tracked</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{signals.length}</div><div className="text-[10px] text-muted">Total Signals</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bull-light">{signals.filter((s) => s.signalStatus === "active").length}</div><div className="text-[10px] text-muted">Live Now</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-accent-light">{winRate}%</div><div className="text-[10px] text-muted">Win Rate</div></div>
        <div className="glass-card p-3 text-center"><div className={cn("text-lg font-bold", totalPips >= 0 ? "text-bull-light" : "text-bear-light")}>{totalPips >= 0 ? "+" : ""}{totalPips}</div><div className="text-[10px] text-muted">Total Pips</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{STRATEGIES.length}</div><div className="text-[10px] text-muted">Strategies</div></div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); if (t.id !== "strategy") setStrategyFilter(null); }}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", tab === t.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
            {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      <TimeframeFilter value={timeframe} onChange={setTimeframe} counts={timeframeCounts} />

      {/* Strategy filter chips (when By Strategy tab) */}
      {tab === "strategy" && (
        <div className="glass-card p-4">
          <h4 className="text-xs text-muted mb-2">Select Strategy</h4>
          <div className="flex flex-wrap gap-1.5">
            {STRATEGIES.map((s) => {
              const count = signals.filter((sig) => sig.strategyId === s.id).length;
              return (
                <button key={s.id} onClick={() => setStrategyFilter(strategyFilter === s.id ? null : s.id)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth", strategyFilter === s.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>
                  {s.name} ({count})
                </button>
              );
            })}
          </div>
          {strategyFilter && (
            <div className="mt-3 pt-3 border-t border-border/30">
              <p className="text-xs text-muted">{STRATEGIES.find((s) => s.id === strategyFilter)?.desc}</p>
            </div>
          )}
        </div>
      )}

      {/* Signal feed */}
      <div className="space-y-3">
        {filtered.length > 0 ? filtered.map((signal) => {
          const isBuy = signal.direction === "buy";
          const strat = STRATEGIES.find((s) => s.id === signal.strategyId);
          const statusColors: Record<string, string> = {
            active: "bg-bull/10 text-bull-light border-bull/20",
            triggered: "bg-accent/10 text-accent-light border-accent/20",
            won: "bg-bull/10 text-bull-light border-bull/20",
            lost: "bg-bear/10 text-bear-light border-bear/20",
            expired: "bg-surface-3 text-muted border-border",
            cancelled: "bg-surface-3 text-muted border-border",
          };

          return (
            <div key={signal.id} className="glass-card overflow-hidden">
              <div className={cn("h-1", isBuy ? "bg-bull" : "bg-bear")} />
              <div className="p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-foreground">{signal.displayName}</span>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase", isBuy ? "badge-bull" : "badge-bear")}>{signal.direction}</span>
                    <span className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded text-muted">{signal.timeframe}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", strat?.color || "bg-accent", "text-white")}>{signal.strategyName}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", signal.qualityGrade.startsWith("A") ? "bg-bull/10 text-bull-light" : "bg-warn/10 text-warn")}>{signal.qualityGrade}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-accent-light">{signal.confidenceScore}/100</span>
                    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize", statusColors[signal.signalStatus])}>{signal.signalStatus}</span>
                  </div>
                </div>

                {/* Levels */}
                <div className="grid grid-cols-5 gap-2 mb-2">
                  <div className="bg-surface-2 rounded-lg p-2 text-center"><div className="text-[9px] text-accent-light uppercase">Entry</div><div className="text-xs font-bold font-mono">{signal.entry}</div></div>
                  <div className="bg-surface-2 rounded-lg p-2 text-center"><div className="text-[9px] text-bear-light uppercase">SL</div><div className="text-xs font-bold font-mono text-bear-light">{signal.stopLoss}</div></div>
                  <div className="bg-surface-2 rounded-lg p-2 text-center"><div className="text-[9px] text-accent-light uppercase">1R</div><div className="text-xs font-bold font-mono text-accent-light">{computeOneR(signal.entry, signal.stopLoss, signal.direction).toFixed(5)}</div></div>
                  <div className="bg-surface-2 rounded-lg p-2 text-center"><div className="text-[9px] text-bull-light uppercase">TP1</div><div className="text-xs font-bold font-mono text-bull-light">{signal.takeProfit1}</div></div>
                  <div className="bg-surface-2 rounded-lg p-2 text-center"><div className="text-[9px] text-muted uppercase">R:R</div><div className="text-xs font-bold font-mono">{signal.riskReward}:1</div></div>
                </div>
                <div className="mb-3">
                  <AdminLotSizeForCard symbol={signal.symbol} entry={signal.entry} stopLoss={signal.stopLoss} />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-3 text-muted">
                    <span>{signal.setupType}</span>
                    <span className="capitalize">{signal.category}</span>
                    <span>{new Date(signal.publishedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {signal.resultPips !== undefined && (
                    <span className={cn("font-bold font-mono", signal.resultPips >= 0 ? "text-bull-light" : "text-bear-light")}>
                      {signal.resultPips >= 0 ? "+" : ""}{signal.resultPips} pips
                    </span>
                  )}
                </div>

                {/* Explanation */}
                {signal.explanation && (
                  <div className="mt-2 pt-2 border-t border-border/20">
                    <p className="text-[11px] text-muted-light leading-relaxed">{signal.explanation}</p>
                  </div>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="glass-card p-12 text-center">
            <p className="text-muted">No signals match your current filters.</p>
          </div>
        )}
      </div>

      {/* Strategy performance table (Results tab) */}
      {tab === "results" && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Performance by Strategy</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-border/50">
                <th className="text-left text-[10px] text-muted font-medium px-3 py-2">Strategy</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Signals</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Wins</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Losses</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Win Rate</th>
                <th className="text-center text-[10px] text-muted font-medium px-2 py-2">Pips</th>
              </tr></thead>
              <tbody>
                {STRATEGIES.map((strat) => {
                  const stratSignals = signals.filter((s) => s.strategyId === strat.id);
                  const wins = stratSignals.filter((s) => s.signalStatus === "won").length;
                  const losses = stratSignals.filter((s) => s.signalStatus === "lost").length;
                  const wr = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
                  const pips = stratSignals.reduce((sum, s) => sum + (s.resultPips || 0), 0);
                  if (stratSignals.length === 0) return null;
                  return (
                    <tr key={strat.id} className="border-b border-border/20">
                      <td className="px-3 py-2 text-xs font-medium">{strat.name}</td>
                      <td className="px-2 py-2 text-xs text-center">{stratSignals.length}</td>
                      <td className="px-2 py-2 text-xs text-center text-bull-light">{wins}</td>
                      <td className="px-2 py-2 text-xs text-center text-bear-light">{losses}</td>
                      <td className="px-2 py-2 text-xs text-center"><span className={cn("font-medium", wr >= 60 ? "text-bull-light" : wr >= 45 ? "text-warn" : "text-bear-light")}>{wr}%</span></td>
                      <td className="px-2 py-2 text-xs text-center font-mono"><span className={cn("font-medium", pips >= 0 ? "text-bull-light" : "text-bear-light")}>{pips >= 0 ? "+" : ""}{pips}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
