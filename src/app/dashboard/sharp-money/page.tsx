"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";

type RadarView = "dashboard" | "events" | "watchlist";
type ActivityLevel = "high" | "elevated" | "moderate" | "low";

interface RadarData {
  symbol: string;
  displayName: string;
  category: string;
  radarScore: number; // 0-100
  direction: "bullish" | "bearish" | "neutral";
  activity: ActivityLevel;
  // Factor breakdown
  volatilityShift: number;
  structureBehavior: number;
  reactionQuality: number;
  timingContext: number;
  pressurePersistence: number;
  // Derived
  signals: string[];
  explanation: string;
  confidence: number;
  warning: string | null;
  changePct: number;
  price: number;
  // Extra quote data carried through so the trade-setup panel can
  // compute entry / SL / TP from the same session range the radar saw.
  high: number;
  low: number;
  decimals: number;
}

const ACTIVITY_CONFIG: Record<ActivityLevel, { label: string; color: string; badge: string }> = {
  high: { label: "High Interest", color: "text-bull-light", badge: "bg-bull/10 text-bull-light border-bull/20" },
  elevated: { label: "Elevated", color: "text-accent-light", badge: "bg-accent/10 text-accent-light border-accent/20" },
  moderate: { label: "Moderate", color: "text-warn", badge: "bg-warn/10 text-warn border-warn/20" },
  low: { label: "Low", color: "text-muted", badge: "bg-surface-3 text-muted border-border" },
};

function deriveRadarData(quote: any): RadarData {
  const changePct = quote.changePercent;
  const absChange = Math.abs(changePct);
  const range = quote.high - quote.low;
  const rangePct = quote.price > 0 ? (range / quote.price) * 100 : 0;
  const pricePosition = range > 0 ? (quote.price - quote.low) / range : 0.5;
  const directional = absChange / Math.max(rangePct, 0.01);

  // Factor scores (0-20 each, total max 100)
  const volatilityShift = Math.min(20, Math.round(rangePct * 12 + absChange * 5));
  const structureBehavior = Math.min(20, Math.round(directional * 15 + (pricePosition > 0.7 || pricePosition < 0.3 ? 5 : 0)));
  const reactionQuality = Math.min(20, Math.round(absChange > 0.2 ? 10 + directional * 8 : directional * 10));

  // Timing — session-based
  const utcH = new Date().getUTCHours();
  const isActiveSession = (utcH >= 7 && utcH < 16) || (utcH >= 12 && utcH < 21);
  const timingContext = isActiveSession ? Math.min(20, 10 + Math.round(absChange * 8)) : Math.min(12, Math.round(absChange * 6));

  const pressurePersistence = Math.min(20, Math.round(
    (directional > 0.5 ? 10 : 5) +
    (absChange > 0.3 ? 5 : 0) +
    ((pricePosition > 0.8 && changePct > 0) || (pricePosition < 0.2 && changePct < 0) ? 5 : 0)
  ));

  const radarScore = Math.min(100, volatilityShift + structureBehavior + reactionQuality + timingContext + pressurePersistence);

  const direction: RadarData["direction"] = changePct > 0.05 ? "bullish" : changePct < -0.05 ? "bearish" : "neutral";

  let activity: ActivityLevel;
  if (radarScore >= 70) activity = "high";
  else if (radarScore >= 50) activity = "elevated";
  else if (radarScore >= 30) activity = "moderate";
  else activity = "low";

  // Confidence
  const factorAgreement = [volatilityShift, structureBehavior, reactionQuality, pressurePersistence].filter((f) => f >= 10).length;
  const confidence = Math.min(90, Math.round(30 + radarScore * 0.4 + factorAgreement * 8));

  // Signals
  const signals: string[] = [];
  if (absChange > 0.5 && directional > 0.5) signals.push(`Strong directional pressure ${direction === "bullish" ? "upward" : "downward"} with clean displacement`);
  if (absChange > 0.3 && isActiveSession) signals.push("Active session timing amplifies significance");
  if (rangePct > 0.5 && directional > 0.4) signals.push("Volatility expansion with follow-through — not just noise");
  if (pricePosition > 0.85 && changePct > 0.1) signals.push("Price at session highs with persistent buying pressure");
  if (pricePosition < 0.15 && changePct < -0.1) signals.push("Price at session lows with persistent selling pressure");
  if (rangePct > 0.3 && directional < 0.3) signals.push("High range but weak direction — possible manipulation or indecision");
  if (absChange > 0.2 && volatilityShift >= 15) signals.push("Volatility regime shifting — unusual market interest detected");
  if (reactionQuality >= 15) signals.push("Clean reaction quality suggests intentional positioning");
  if (signals.length === 0) signals.push("Normal market activity — no unusual patterns detected");

  // Warning
  let warning: string | null = null;
  if (rangePct > 0.5 && directional < 0.3) warning = "High volatility but low directional quality — possible fakeout or manipulation. Proceed with caution.";
  else if (radarScore >= 70 && !isActiveSession) warning = "High radar score outside active session — may be driven by thin liquidity.";

  // Explanation
  const explanation = generateExplanation(quote.displayName, direction, radarScore, activity, signals, confidence, isActiveSession);

  const inst = ALL_INSTRUMENTS.find((i) => i.symbol === quote.symbol);
  return {
    symbol: quote.symbol, displayName: quote.displayName, category: quote.category,
    radarScore, direction, activity, volatilityShift, structureBehavior, reactionQuality,
    timingContext, pressurePersistence, signals, explanation, confidence, warning,
    changePct, price: quote.price,
    high: quote.high ?? quote.price,
    low: quote.low ?? quote.price,
    decimals: inst?.decimals ?? 2,
  };
}

/**
 * Turn a strong radar signal into a tradeable setup. Returns null when the
 * signal isn't actionable — neutral direction, weak activity, or a warning
 * present. Entry / SL / TP are derived from the session range the radar
 * already scored, so the levels align with the activity being flagged.
 */
function radarToSetup(d: RadarData): {
  side: "buy" | "sell";
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  grade: "A+" | "A" | "B";
} | null {
  if (d.direction === "neutral") return null;
  if (d.activity !== "high" && d.activity !== "elevated") return null;
  if (d.warning) return null;

  const range = d.high - d.low;
  if (range <= 0 || d.price <= 0) return null;

  const isBuy = d.direction === "bullish";
  // Entry zone: inside the recent range, skewed toward the pullback side.
  const entryMid = isBuy ? d.low + range * 0.30 : d.high - range * 0.30;
  const entryFar = isBuy ? d.low + range * 0.50 : d.high - range * 0.50;
  const entryLow = Math.min(entryMid, entryFar);
  const entryHigh = Math.max(entryMid, entryFar);

  // Stop beyond the session extreme with a small buffer.
  const stopLoss = isBuy ? d.low - range * 0.18 : d.high + range * 0.18;

  // Targets scaled to measured risk.
  const anchor = (entryLow + entryHigh) / 2;
  const risk = Math.abs(anchor - stopLoss);
  const takeProfit1 = isBuy ? anchor + risk * 1.5 : anchor - risk * 1.5;
  const takeProfit2 = isBuy ? anchor + risk * 2.5 : anchor - risk * 2.5;
  const riskReward = risk > 0 ? Math.abs(takeProfit2 - anchor) / risk : 0;

  // Grade is a blend of radar score and confidence.
  const blended = (d.radarScore + d.confidence) / 2;
  const grade: "A+" | "A" | "B" =
    blended >= 80 && d.activity === "high" ? "A+" : blended >= 65 ? "A" : "B";

  return { side: isBuy ? "buy" : "sell", entryLow, entryHigh, stopLoss, takeProfit1, takeProfit2, riskReward, grade };
}

function fmt(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

function RadarTradeSetup({ d }: { d: RadarData }) {
  const setup = radarToSetup(d);
  if (!setup) return null;
  const isBuy = setup.side === "buy";
  const gradeClass =
    setup.grade === "A+" ? "bg-purple-500/15 text-purple-300 border-purple-500/40" :
    setup.grade === "A" ? "bg-bull/15 text-bull-light border-bull/40" :
    "bg-accent/15 text-accent-light border-accent/40";
  return (
    <div className="rounded-xl border border-border/50 bg-surface-2/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Trade Setup</span>
          <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border", gradeClass)}>
            {setup.grade}
          </span>
          <span className={cn(
            "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border",
            isBuy ? "bg-bull/10 text-bull-light border-bull/40" : "bg-bear/10 text-bear-light border-bear/40",
          )}>
            {isBuy ? "▲ BUY" : "▼ SELL"}
          </span>
        </div>
        <span className="text-[11px] text-muted font-mono">
          RR {setup.riskReward.toFixed(2)} · Score {d.radarScore} · Conf {d.confidence}%
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono">
        <div className="rounded-lg bg-surface-3/40 border border-border/30 p-2 text-center">
          <div className="text-[9px] uppercase text-muted mb-0.5">Entry</div>
          <div className="text-foreground">{fmt(setup.entryLow, d.decimals)} – {fmt(setup.entryHigh, d.decimals)}</div>
        </div>
        <div className="rounded-lg bg-bear/5 border border-bear/20 p-2 text-center">
          <div className="text-[9px] uppercase text-bear-light mb-0.5">Stop</div>
          <div className="text-bear-light">{fmt(setup.stopLoss, d.decimals)}</div>
        </div>
        <div className="rounded-lg bg-accent/5 border border-accent/20 p-2 text-center">
          <div className="text-[9px] uppercase text-accent-light mb-0.5">1R</div>
          <div className="text-accent-light">{fmt(computeOneR((setup.entryLow + setup.entryHigh) / 2, setup.stopLoss, setup.side), d.decimals)}</div>
        </div>
        <div className="rounded-lg bg-bull/5 border border-bull/20 p-2 text-center">
          <div className="text-[9px] uppercase text-bull-light mb-0.5">TP1</div>
          <div className="text-bull-light">{fmt(setup.takeProfit1, d.decimals)}</div>
        </div>
        <div className="rounded-lg bg-bull/5 border border-bull/20 p-2 text-center">
          <div className="text-[9px] uppercase text-bull-light mb-0.5">TP2</div>
          <div className="text-bull-light">{fmt(setup.takeProfit2, d.decimals)}</div>
        </div>
      </div>
      <AdminLotSizeForCard
        symbol={d.symbol}
        entry={(setup.entryLow + setup.entryHigh) / 2}
        stopLoss={setup.stopLoss}
      />
      <p className="text-[10px] text-muted-light">
        Aligned with the radar read: {d.direction} pressure at {d.activity === "high" ? "high" : "elevated"} interest on the {d.category} side.
        Stop sits just beyond the session {isBuy ? "low" : "high"}; targets scale 1.5R / 2.5R off the measured risk.
      </p>
      <ExecuteTradeButton
        setup={{
          symbol: d.symbol,
          direction: setup.side,
          entry: (setup.entryLow + setup.entryHigh) / 2,
          stopLoss: setup.stopLoss,
          takeProfit: setup.takeProfit1,
          takeProfit2: setup.takeProfit2,
          timeframe: "1h",
          setupType: "sharp_money_radar",
          qualityGrade: setup.grade,
          confidenceScore: d.confidence,
          sourceType: "sharp_money_radar",
          sourceRef: d.symbol,
        }}
        size="md"
        className="w-full"
      />
    </div>
  );
}

function generateExplanation(name: string, dir: string, score: number, activity: ActivityLevel, signals: string[], conf: number, activeSession: boolean): string {
  if (activity === "high") return `${name} is showing high unusual activity (score: ${score}/100). Multiple radar factors are elevated — volatility shift, structure behavior, and reaction quality all suggest this market deserves serious attention. ${activeSession ? "Active session timing adds weight." : "Note: occurring outside peak session hours."} ${dir !== "neutral" ? `Directional pressure leans ${dir}.` : "Direction is not yet clear."} Confidence: ${conf}%.`;
  if (activity === "elevated") return `${name} has elevated radar readings (score: ${score}/100). Some unusual behavior detected — ${signals[0]?.toLowerCase() || "monitoring for confirmation"}. ${dir !== "neutral" ? `Current lean is ${dir}.` : "No strong directional bias yet."} Worth watching closely for developing smart-money patterns.`;
  if (activity === "moderate") return `${name} shows moderate radar activity (score: ${score}/100). Market behavior is within normal ranges but some factors are slightly elevated. Not enough evidence for a high-conviction unusual activity read.`;
  return `${name} is quiet on the radar (score: ${score}/100). Normal market conditions with no unusual pressure, timing, or behavioral clues detected. Check back during active sessions for better readings.`;
}

export default function SharpMoneyPage() {
  const [data, setData] = useState<RadarData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<RadarView>("dashboard");
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/market/quotes?t=${Date.now()}`, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json.quotes) {
          setData(json.quotes.map((q: any) => deriveRadarData(q)));
          setLastUpdated(json.timestamp ?? Date.now());
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;
  const freshnessLabel = ageSec == null ? null
    : ageSec < 60 ? `${ageSec}s ago`
    : `${Math.floor(ageSec / 60)}m ago`;

  let filtered = data;
  if (activityFilter !== "all") filtered = filtered.filter((d) => d.activity === activityFilter);
  if (categoryFilter !== "all") filtered = filtered.filter((d) => d.category === categoryFilter);
  const sorted = [...filtered].sort((a, b) => b.radarScore - a.radarScore);

  const highCount = data.filter((d) => d.activity === "high").length;
  const elevatedCount = data.filter((d) => d.activity === "elevated").length;
  const avgScore = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.radarScore, 0) / data.length) : 0;
  const topRadar = sorted[0];

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Sharp Money Radar</h1><p className="text-sm text-muted mt-1">Scanning for unusual activity...</p></div>
        <div className="space-y-3">{[1,2,3,4].map((i) => <div key={i} className="glass-card p-5 animate-pulse"><div className="h-16 bg-surface-3 rounded" /></div>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminRiskTargetBar />
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Sharp Money Radar</h1>
          <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20 pulse-live">Live</span>
          {freshnessLabel && (
            <span className="text-xs text-muted">Last updated {freshnessLabel} · refreshes every 60s</span>
          )}
        </div>
        <p className="text-sm text-muted mt-1">Inferred unusual market activity — where does the market deserve more attention?</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{data.length}</div><div className="text-[10px] text-muted">Scanned</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bull-light">{highCount}</div><div className="text-[10px] text-muted">High Interest</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-accent-light">{elevatedCount}</div><div className="text-[10px] text-muted">Elevated</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{avgScore}</div><div className="text-[10px] text-muted">Avg Score</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-warn">{topRadar?.displayName || "—"}</div><div className="text-[10px] text-muted">Top Radar</div></div>
      </div>

      {/* View tabs + filters */}
      <div className="flex flex-wrap items-center gap-2">
        {[{ id: "dashboard" as RadarView, l: "Radar" }, { id: "events" as RadarView, l: "Signal Details" }, { id: "watchlist" as RadarView, l: "High Interest Watchlist" }].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", view === v.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{v.l}</button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        {(Object.entries(ACTIVITY_CONFIG) as [ActivityLevel, typeof ACTIVITY_CONFIG[ActivityLevel]][]).map(([key, cfg]) => (
          <button key={key} onClick={() => setActivityFilter(activityFilter === key ? "all" : key)} className={cn("px-2.5 py-1 rounded-lg text-[10px] transition-smooth border", activityFilter === key ? cfg.badge : "bg-surface-2 text-muted border-border/50")}>
            {cfg.label} ({data.filter((d) => d.activity === key).length})
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        {["all", "forex", "metals", "crypto"].map((c) => (
          <button key={c} onClick={() => setCategoryFilter(c)} className={cn("px-2.5 py-1 rounded-lg text-[10px] capitalize transition-smooth", categoryFilter === c ? "bg-surface-3 text-foreground border border-border-light" : "text-muted")}>{c === "all" ? "All" : c}</button>
        ))}
      </div>

      {/* DASHBOARD VIEW */}
      {view === "dashboard" && (
        <div className="space-y-3">
          {sorted.map((d) => {
            const ac = ACTIVITY_CONFIG[d.activity];
            const isExpanded = expandedSymbol === d.symbol;
            return (
              <div key={d.symbol} className={cn("glass-card overflow-hidden", d.activity === "high" ? "border-l-4 border-l-bull" : d.activity === "elevated" ? "border-l-4 border-l-accent" : "")}>
                <div className="p-4 cursor-pointer" onClick={() => setExpandedSymbol(isExpanded ? null : d.symbol)}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold">{d.displayName}</span>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full capitalize", d.direction === "bullish" ? "badge-bull" : d.direction === "bearish" ? "badge-bear" : "badge-neutral")}>{d.direction}</span>
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", ac.badge)}>{ac.label}</span>
                      {d.warning && <span className="text-warn text-[10px]">⚠</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-2.5 rounded-full bg-surface-3 overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", d.radarScore >= 70 ? "bg-bull" : d.radarScore >= 50 ? "bg-accent" : d.radarScore >= 30 ? "bg-warn" : "bg-muted")} style={{ width: `${d.radarScore}%` }} />
                      </div>
                      <span className="text-sm font-black font-mono text-foreground w-8 text-right">{d.radarScore}</span>
                      <span className={cn("text-xs font-mono", d.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>{d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%</span>
                    </div>
                  </div>
                  {/* Top signal */}
                  <p className="text-xs text-muted-light">{d.signals[0]}</p>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-border/30 space-y-3">
                    <p className="text-xs text-muted-light leading-relaxed">{d.explanation}</p>
                    {d.warning && <div className="bg-warn/5 border border-warn/10 rounded-lg p-2.5"><span className="text-xs text-warn">⚠ {d.warning}</span></div>}

                    {/* All signals */}
                    {d.signals.length > 1 && (
                      <div>
                        <div className="text-[10px] text-muted font-medium mb-1.5">Detected Signals</div>
                        <div className="space-y-1">
                          {d.signals.map((sig, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", d.direction === "bullish" ? "bg-bull" : d.direction === "bearish" ? "bg-bear" : "bg-muted")} />
                              <span className="text-xs text-muted-light">{sig}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Factor breakdown */}
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { label: "Vol Shift", value: d.volatilityShift, max: 20 },
                        { label: "Structure", value: d.structureBehavior, max: 20 },
                        { label: "Reaction", value: d.reactionQuality, max: 20 },
                        { label: "Timing", value: d.timingContext, max: 20 },
                        { label: "Pressure", value: d.pressurePersistence, max: 20 },
                      ].map((f) => (
                        <div key={f.label} className="bg-surface-2 rounded-lg p-2 text-center">
                          <div className="text-[9px] text-muted mb-1">{f.label}</div>
                          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mb-1">
                            <div className={cn("h-full rounded-full", f.value >= 15 ? "bg-bull" : f.value >= 10 ? "bg-accent" : "bg-muted")} style={{ width: `${(f.value / f.max) * 100}%` }} />
                          </div>
                          <div className="text-[10px] font-mono text-foreground">{f.value}/{f.max}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted">Confidence: <span className="text-foreground font-medium">{d.confidence}%</span> • Freshness: <span className="text-foreground capitalize">{Math.abs(d.changePct) > 0.3 ? "Fresh" : Math.abs(d.changePct) > 0.1 ? "Recent" : "Aging"}</span></div>

                    <RadarTradeSetup d={d} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* EVENTS VIEW */}
      {view === "events" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Full signal details for all detected unusual activity</p>
          {sorted.filter((d) => d.signals.length > 1 || d.activity !== "low").map((d) => (
            <div key={d.symbol} className={cn("glass-card p-5 border-l-4", d.activity === "high" ? "border-l-bull" : d.activity === "elevated" ? "border-l-accent" : "border-l-border")}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{d.displayName}</span>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", ACTIVITY_CONFIG[d.activity].badge)}>{ACTIVITY_CONFIG[d.activity].label}</span>
                  <span className="text-xs font-mono text-foreground">{d.radarScore}/100</span>
                </div>
                <span className={cn("text-xs font-mono", d.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>{d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%</span>
              </div>
              <div className="space-y-1.5 mb-3">
                {d.signals.map((sig, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", d.direction === "bullish" ? "bg-bull" : d.direction === "bearish" ? "bg-bear" : "bg-muted")} />
                    <span className="text-xs text-muted-light">{sig}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted leading-relaxed">{d.explanation}</p>
              <div className="mt-3">
                <RadarTradeSetup d={d} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* WATCHLIST VIEW */}
      {view === "watchlist" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Instruments with elevated or high radar interest — these markets deserve more attention</p>
          {data.filter((d) => d.activity === "high" || d.activity === "elevated").length > 0 ? (
            <div className="glass-card overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-border/50">
                  <th className="text-left text-[10px] text-muted font-medium px-4 py-3">Instrument</th>
                  <th className="text-center text-[10px] text-muted font-medium px-3 py-3">Score</th>
                  <th className="text-center text-[10px] text-muted font-medium px-3 py-3">Direction</th>
                  <th className="text-center text-[10px] text-muted font-medium px-3 py-3">Activity</th>
                  <th className="text-center text-[10px] text-muted font-medium px-3 py-3">Change</th>
                  <th className="text-center text-[10px] text-muted font-medium px-3 py-3">Confidence</th>
                  <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Top Signal</th>
                </tr></thead>
                <tbody>
                  {data.filter((d) => d.activity === "high" || d.activity === "elevated").sort((a, b) => b.radarScore - a.radarScore).map((d) => (
                    <tr key={d.symbol} className="border-b border-border/20 hover:bg-surface-2/50 transition-smooth">
                      <td className="px-4 py-3"><div className="text-xs font-semibold">{d.displayName}</div><div className="text-[10px] text-muted capitalize">{d.category}</div></td>
                      <td className="px-3 py-3 text-center"><span className="text-sm font-black text-foreground">{d.radarScore}</span></td>
                      <td className="px-3 py-3 text-center"><span className={cn("text-[10px] px-2 py-0.5 rounded-full capitalize", d.direction === "bullish" ? "badge-bull" : d.direction === "bearish" ? "badge-bear" : "badge-neutral")}>{d.direction}</span></td>
                      <td className="px-3 py-3 text-center"><span className={cn("text-[10px] px-2 py-0.5 rounded-full border", ACTIVITY_CONFIG[d.activity].badge)}>{ACTIVITY_CONFIG[d.activity].label}</span></td>
                      <td className="px-3 py-3 text-center"><span className={cn("text-xs font-mono", d.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>{d.changePct >= 0 ? "+" : ""}{d.changePct.toFixed(2)}%</span></td>
                      <td className="px-3 py-3 text-center text-xs text-muted">{d.confidence}%</td>
                      <td className="px-3 py-3 text-[10px] text-muted-light max-w-[200px]">{d.signals[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="glass-card p-12 text-center"><p className="text-muted text-sm">No instruments currently showing elevated radar interest. Markets appear to be in normal activity mode.</p></div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How Sharp Money Radar Works</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">5 Radar Factors (100 total)</p>
            <p><strong>Volatility Shift</strong> (/20) — is the market moving more than usual? <strong>Structure Behavior</strong> (/20) — is the move clean and directional? <strong>Reaction Quality</strong> (/20) — how strong are reactions at levels? <strong>Timing Context</strong> (/20) — is this happening during active sessions? <strong>Pressure Persistence</strong> (/20) — is the pressure sustained or fading?</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Responsible Framing</p>
            <p>This radar infers unusual market interest from observable behavior — it does not claim direct visibility into institutional orders. High scores mean the market is behaving in a way that deserves more attention, caution, or focus. Mixed conditions reduce confidence.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Fakeout Protection</p>
            <p>High range with weak directional quality triggers warnings. A violent spike that immediately fails scores lower than a clean breakout with follow-through. The radar distinguishes real pressure from noise.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Integration</p>
            <p>Signal engines use the radar as extra confluence for A+ setups. Bots can require minimum radar scores before acting on breakout strategies. Editor&apos;s Pick favors setups where structure, volatility, and radar interest align.</p>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted text-center">
        Sharp Money Radar surfaces inferred unusual activity based on observable market behavior. It is an attention layer, not a guarantee of institutional presence.
      </div>
    </div>
  );
}
