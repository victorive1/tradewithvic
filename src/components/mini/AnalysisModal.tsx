"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Per-signal Analysis Modal — Mini blueprint § 9, § 10.
//
// Renders the full breakdown of a Mini signal: bias snapshot, score
// components, every gate's evidence, lifecycle timeline (every state
// transition with timestamp + price + score at that moment), and any
// open smart-exit alerts. Used by the Intraday Prediction tab.

interface ScoreBreakdown {
  biasAlignment: number; liquidityEvent: number; microStructure: number;
  entryZoneQuality: number; momentumDisplacement: number;
  volatilitySpread: number; riskReward: number; sessionTiming: number; total: number;
}

interface Signal {
  id: string;
  symbol: string;
  displayName: string;
  decimalPlaces: number;
  template: string;
  direction: string;
  entryTimeframe: string;
  speedClass: string;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  entryType: string;
  score: number;
  grade: string;
  biasState: string | null;
  session: string | null;
  expectedHoldMinutes: number;
  riskReward: number;
  explanation: string | null;
  invalidation: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  scoreBreakdown: ScoreBreakdown | null;
  metadata: any;
}

interface LifecycleEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  evidence: string;
  priceAtEvent: number | null;
  scoreAtEvent: number | null;
  occurredAt: string;
}

interface SmartExitAlert {
  id: string;
  alertType: string;
  severity: string;
  evidence: string;
  raisedAt: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  liquidity_sweep_reversal:    "Liquidity Sweep Reversal",
  intraday_trend_continuation: "Intraday Trend Continuation",
  breakout_retest:             "Breakout Retest",
  vwap_reclaim:                "VWAP Reclaim",
  news_cooldown_continuation:  "News Cooldown Continuation",
  compression_breakout:        "Compression Breakout",
  inverse_fvg_flip:            "Inverse FVG Flip",
};

const ALERT_LABELS: Record<string, string> = {
  opposite_choch:       "Opposite CHoCH",
  momentum_death:       "Momentum Death",
  time_stall:           "Time Stall",
  spread_spike:         "Spread Spike",
  news_approaching:     "News Approaching",
  opposing_close:       "Opposing Close",
  rejected_before_tp1:  "Rejected Before TP1",
};

function fmt(n: number, dp: number): string {
  return dp > 0 ? n.toFixed(dp) : Math.round(n).toLocaleString();
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCHours().toString().padStart(2,"0")}:${d.getUTCMinutes().toString().padStart(2,"0")}:${d.getUTCSeconds().toString().padStart(2,"0")} UTC`;
}

export function AnalysisModal({ signal, open, onClose }: { signal: Signal | null; open: boolean; onClose: () => void }) {
  const [lifecycle, setLifecycle] = useState<LifecycleEvent[]>([]);
  const [alerts, setAlerts] = useState<SmartExitAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !signal) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/mini/signals/${signal.id}/lifecycle?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/mini/signals/${signal.id}/smart-exit?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()),
    ]).then(([lc, se]) => {
      if (cancelled) return;
      setLifecycle(Array.isArray(lc.events) ? lc.events : []);
      setAlerts(Array.isArray(se.alerts) ? se.alerts : []);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, signal?.id]);

  if (!open || !signal) return null;
  const isBuy = signal.direction === "bullish";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className={cn("h-1.5", isBuy ? "bg-bull" : "bg-bear")} />
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">{signal.displayName}</h2>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border",
                  isBuy ? "bg-bull/15 text-bull-light border-bull/30" : "bg-bear/15 text-bear-light border-bear/30")}>
                  {isBuy ? "▲ Long" : "▼ Short"}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase border bg-accent/10 text-accent-light border-accent/30">
                  {TEMPLATE_LABELS[signal.template] ?? signal.template}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {signal.entryTimeframe} entry · {signal.session ?? "—"} · status: <span className="text-foreground font-mono">{signal.status.replace(/_/g, " ")}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className={cn("text-2xl font-bold", signal.grade === "A+" ? "text-bull-light" : "text-accent-light")}>{signal.score}</div>
                <div className="text-[10px] text-muted">/100 · {signal.grade}</div>
              </div>
              <button onClick={onClose} className="text-muted hover:text-foreground transition-smooth text-2xl px-2 leading-none" aria-label="Close">×</button>
            </div>
          </div>

          {/* Open alerts pill row */}
          {alerts.length > 0 && (
            <div className="space-y-1.5">
              {alerts.map((a) => (
                <div key={a.id} className={cn(
                  "rounded-lg border p-2 text-[12px] flex items-start gap-2",
                  a.severity === "critical" ? "bg-bear/10 border-bear/30 text-bear-light" : "bg-warn/10 border-warn/30 text-warn-light",
                )}>
                  <span className="font-bold uppercase shrink-0">{ALERT_LABELS[a.alertType] ?? a.alertType}</span>
                  <span className="opacity-90">{a.evidence}</span>
                  <span className="ml-auto text-[10px] opacity-70 shrink-0">{fmtTime(a.raisedAt)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Levels block */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px] font-mono">
            <Lvl label="Entry zone" value={`${fmt(signal.entryZoneLow, signal.decimalPlaces)} – ${fmt(signal.entryZoneHigh, signal.decimalPlaces)}`} tone="neutral" />
            <Lvl label="Stop"  value={fmt(signal.stopLoss, signal.decimalPlaces)} tone="bear" />
            <Lvl label="TP1"   value={fmt(signal.takeProfit1, signal.decimalPlaces)} tone="bull" />
            {signal.takeProfit2 != null && <Lvl label="TP2" value={fmt(signal.takeProfit2, signal.decimalPlaces)} tone="bull" />}
            {signal.takeProfit3 != null && <Lvl label="TP3" value={fmt(signal.takeProfit3, signal.decimalPlaces)} tone="bull" />}
          </div>

          {/* Why */}
          {signal.explanation && (
            <div className="text-[12px] text-foreground bg-surface-2/50 border border-border/30 rounded-lg p-3 leading-relaxed">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Why this setup exists</div>
              {signal.explanation}
            </div>
          )}

          {/* Score breakdown */}
          {signal.scoreBreakdown && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Score Breakdown — 100-pt formula</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <ScorePill label="Bias"      value={signal.scoreBreakdown.biasAlignment}     max={15} />
                <ScorePill label="Liquidity" value={signal.scoreBreakdown.liquidityEvent}    max={15} />
                <ScorePill label="Structure" value={signal.scoreBreakdown.microStructure}    max={15} />
                <ScorePill label="Zone"      value={signal.scoreBreakdown.entryZoneQuality} max={15} />
                <ScorePill label="Momentum"  value={signal.scoreBreakdown.momentumDisplacement} max={15} />
                <ScorePill label="Vol/Sprd"  value={signal.scoreBreakdown.volatilitySpread} max={10} />
                <ScorePill label="RR"        value={signal.scoreBreakdown.riskReward}       max={10} />
                <ScorePill label="Session"   value={signal.scoreBreakdown.sessionTiming}    max={5} />
              </div>
            </div>
          )}

          {/* Gates */}
          {Array.isArray(signal.metadata?.gates) && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Gates</div>
              <div className="space-y-1">
                {signal.metadata.gates.map((g: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span className={cn("mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0",
                      g.passed ? "bg-bull/30 text-bull-light" : "bg-bear/15 text-bear-light/70")}>
                      <span className="text-[10px]">{g.passed ? "✓" : "✗"}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className={cn("font-semibold", g.hard && !g.passed ? "text-bear-light" : "text-foreground")}>{g.label}</span>
                      {g.hard && <span className="ml-1 text-[9px] uppercase opacity-60">hard</span>}
                      <div className="text-[11px] text-muted leading-snug">{g.evidence}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lifecycle timeline */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Lifecycle Timeline</div>
            {loading ? (
              <div className="text-[11px] text-muted">Loading…</div>
            ) : lifecycle.length === 0 ? (
              <div className="text-[11px] text-muted italic">No transitions recorded yet.</div>
            ) : (
              <ol className="space-y-2">
                {lifecycle.map((e, i) => (
                  <li key={e.id} className="flex items-start gap-3 text-[12px]">
                    <span className="mt-1 w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.fromStatus && <span className="text-muted text-[10px] font-mono">{e.fromStatus}</span>}
                        {e.fromStatus && <span className="text-muted">→</span>}
                        <span className="font-semibold text-foreground">{e.toStatus.replace(/_/g, " ")}</span>
                        <span className="ml-auto text-[10px] text-muted font-mono">{fmtTime(e.occurredAt)}</span>
                      </div>
                      <div className="text-[11px] text-muted-light leading-snug mt-0.5">
                        {e.evidence}
                        {e.priceAtEvent != null && <span className="ml-2 font-mono text-muted">@{fmt(e.priceAtEvent, signal.decimalPlaces)}</span>}
                      </div>
                    </div>
                    {void i}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Invalidation */}
          {signal.invalidation && (
            <p className="text-[12px] text-warn-light bg-warn/5 border border-warn/20 rounded-lg p-2 leading-relaxed">
              <span className="font-semibold">Invalidation:</span> {signal.invalidation}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Lvl({ label, value, tone }: { label: string; value: string; tone: "bull" | "bear" | "accent" | "neutral" }) {
  const cls = tone === "bull" ? "bg-bull/5 border-bull/20 text-bull-light"
            : tone === "bear" ? "bg-bear/5 border-bear/20 text-bear-light"
            : tone === "accent" ? "bg-accent/5 border-accent/20 text-accent-light"
            : "bg-surface-3/40 border-border/30 text-foreground";
  return (
    <div className={cn("rounded-lg border p-2 text-center", cls)}>
      <div className="text-[9px] uppercase opacity-70 mb-0.5">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function ScorePill({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? value / max : 0;
  const tone = pct >= 0.8 ? "text-bull-light bg-bull/10" : pct >= 0.5 ? "text-accent-light bg-accent/10" : "text-muted bg-surface-2";
  return (
    <div className={cn("rounded p-1.5 text-center border border-border/20", tone)}>
      <div className="text-[9px] uppercase opacity-70">{label}</div>
      <div className="text-[12px] font-mono font-bold">{value}<span className="opacity-50">/{max}</span></div>
    </div>
  );
}
