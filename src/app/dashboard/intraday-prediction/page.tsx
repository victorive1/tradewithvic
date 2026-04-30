"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";
import { useStableSetups } from "@/lib/dashboard/use-stable-setups";

// Intraday Prediction tab — the front-end for the Market Prediction
// Mini engine. Polls /api/mini/signals every 60s. Top section is a
// live session/bias banner; main grid is filterable A+/A signal cards
// with per-card analysis modal.

interface ScoreBreakdown {
  biasAlignment: number;
  liquidityEvent: number;
  microStructure: number;
  entryZoneQuality: number;
  momentumDisplacement: number;
  volatilitySpread: number;
  riskReward: number;
  sessionTiming: number;
  total: number;
}

interface Signal {
  id: string;
  symbol: string;
  displayName: string;
  decimalPlaces: number;
  category: string;
  template: string;
  direction: string;
  biasTimeframe: string;
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

interface SessionState {
  phase: string;
  label: string;
  timingScore: number;
  newsLockout: boolean;
  hourUtc: number;
  minuteUtc: number;
  noTradeZone: boolean;
  noTradeReason?: string;
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

const SPEED_LABELS: Record<string, string> = {
  scalp_5m:      "Scalp 5m",
  intraday_15m:  "Intraday 15m",
  intraday_1h:   "Intraday 1h",
};

function fmt(n: number, dp: number): string {
  return dp > 0 ? n.toFixed(dp) : Math.round(n).toLocaleString();
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}
function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

export default function IntradayPredictionPage() {
  const [templateFilter, setTemplateFilter] = useState<"all" | string>("all");
  const [symbolFilter, setSymbolFilter] = useState<"all" | string>("all");
  const [gradeFilter, setGradeFilter] = useState<"A_PLUS_AND_A" | "A+" | "A">("A_PLUS_AND_A");

  const [signals, setSignals] = useState<Signal[]>([]);
  const [facets, setFacets] = useState<{ templates: string[]; symbols: string[]; grades: string[] }>({ templates: [], symbols: [], grades: [] });
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  const gradeQuery = useMemo(() => {
    switch (gradeFilter) {
      case "A+": return "A+";
      case "A": return "A";
      default: return "A+,A";
    }
  }, [gradeFilter]);

  useEffect(() => {
    let cancelled = false;
    async function load(viaInterval: boolean) {
      if (viaInterval && pausedRef.current) return;
      try {
        const params = new URLSearchParams({
          template: templateFilter,
          symbol: symbolFilter,
          grade: gradeQuery,
          t: String(Date.now()),
        });
        const [sigRes, sessRes] = await Promise.all([
          fetch(`/api/mini/signals?${params}`, { cache: "no-store" }),
          fetch(`/api/mini/session-state?t=${Date.now()}`, { cache: "no-store" }),
        ]);
        const sigData = await sigRes.json();
        const sessData = await sessRes.json();
        if (!cancelled) {
          if (Array.isArray(sigData.signals)) setSignals(sigData.signals);
          if (sigData.facets) setFacets(sigData.facets);
          if (sessData?.phase) setSession(sessData);
          setLastUpdated(sigData.timestamp ?? Date.now());
        }
      } catch (e) {
        console.error("Failed to load Intraday Prediction:", e);
      }
      if (!cancelled) setLoading(false);
    }
    load(false);
    const id = setInterval(() => load(true), 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [templateFilter, symbolFilter, gradeQuery]);

  const getId = useCallback((s: Signal) => s.id, []);
  const { items: stable, changedIds } = useStableSetups(signals, getId, paused);

  const counts = useMemo(() => {
    const aPlus = stable.filter((s) => s.grade === "A+").length;
    const a = stable.filter((s) => s.grade === "A").length;
    const byTemplate: Record<string, number> = {};
    for (const s of stable) byTemplate[s.template] = (byTemplate[s.template] ?? 0) + 1;
    return { aPlus, a, total: aPlus + a, byTemplate };
  }, [stable]);

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;
  const sessionPhaseClass = session?.noTradeZone
    ? "bg-bear/10 text-bear-light border-bear/30"
    : session?.timingScore && session.timingScore >= 4
      ? "bg-bull/10 text-bull-light border-bull/30"
      : "bg-warn/10 text-warn-light border-warn/30";

  return (
    <div
      className="space-y-6"
      onMouseEnter={() => { pausedRef.current = true; setPaused(true); }}
      onMouseLeave={() => { pausedRef.current = false; setPaused(false); }}
    >
      <AdminRiskTargetBar />

      {/* Header + session banner */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Intraday Prediction</h1>
          <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20 pulse-live">Live</span>
          {ageSec != null && (
            <span className="text-xs text-muted">
              Last updated {ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`} · refreshes every 60s
            </span>
          )}
          {paused && (
            <span className="text-[11px] text-warn-light bg-warn/10 border border-warn/30 px-2 py-0.5 rounded-full">
              ⏸ paused while interacting
            </span>
          )}
        </div>
        <p className="text-sm text-muted max-w-3xl">
          Fast intraday brain. Signals expire in 15-75 minutes — these are scalp-to-day-trade opportunities, not swings. Default surfaces only A+ and A grades; brain re-scans every 2 minutes.
        </p>
      </div>

      <div className={cn("glass-card p-4 flex items-center justify-between gap-4 flex-wrap border", sessionPhaseClass)}>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider opacity-70">Session</div>
            <div className="text-lg font-bold">{session?.label ?? "—"}</div>
          </div>
          <div className="w-px h-10 bg-current opacity-20" />
          <div>
            <div className="text-[10px] uppercase tracking-wider opacity-70">Timing Score</div>
            <div className="text-lg font-bold font-mono">{session?.timingScore ?? "-"}/5</div>
          </div>
          {session?.noTradeZone && (
            <span className="text-[11px] uppercase font-bold px-2 py-1 rounded bg-bear text-white">
              No-Trade Zone — {session.noTradeReason}
            </span>
          )}
          {session?.newsLockout && (
            <span className="text-[11px] uppercase font-bold px-2 py-1 rounded bg-warn text-foreground">
              News Lockout
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Tally label="A+" value={counts.aPlus} tone="bull" />
          <Tally label="A"  value={counts.a}     tone="accent" />
          <Tally label="Total" value={counts.total} tone="neutral" />
        </div>
      </div>

      {/* Filter row */}
      <div className="space-y-2">
        <FilterRow
          label="Template"
          value={templateFilter}
          options={facets.templates}
          onChange={setTemplateFilter}
          renderOption={(opt) => (
            <span>
              {TEMPLATE_LABELS[opt] ?? opt}
              {(counts.byTemplate[opt] ?? 0) > 0 && <span className="ml-1.5 text-[10px] opacity-70">{counts.byTemplate[opt]}</span>}
            </span>
          )}
        />
        <FilterRow
          label="Symbol"
          value={symbolFilter}
          options={facets.symbols}
          onChange={setSymbolFilter}
          renderOption={(opt) => <span className="font-mono">{opt}</span>}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-muted w-24 shrink-0">Grade</span>
          {(["A_PLUS_AND_A", "A+", "A"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGradeFilter(g)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
                gradeFilter === g ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50",
              )}
            >
              {g === "A_PLUS_AND_A" ? "A+ and A" : g === "A+" ? "A+ only" : "A only"}
            </button>
          ))}
        </div>
      </div>

      {/* Signal grid */}
      {loading ? (
        <div className="glass-card p-12 text-center text-sm text-muted">Scanning the intraday landscape…</div>
      ) : stable.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⚡</div>
          <p className="text-sm text-muted">No fast intraday opportunities right now.</p>
          <p className="text-[11px] text-muted-light max-w-md mx-auto">
            Mini suppresses anything below A grade — by design. Most of the day, the answer is "nothing&apos;s clean enough yet".
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {stable.map((s) => {
            const isBuy = s.direction === "bullish";
            const justUpdated = changedIds.has(s.id);
            const oneR = computeOneR((s.entryZoneLow + s.entryZoneHigh) / 2, s.stopLoss, s.direction);
            const expanded = expandedId === s.id;
            return (
              <div
                key={s.id}
                className={cn(
                  "glass-card overflow-hidden transition-all duration-300",
                  justUpdated && "ring-2 ring-accent/40 shadow-lg shadow-accent/10",
                )}
              >
                <div className={cn("h-1", isBuy ? "bg-bull" : "bg-bear")} />
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <h3 className="text-base font-bold text-foreground truncate">{s.displayName}</h3>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border",
                        isBuy ? "bg-bull/15 text-bull-light border-bull/30" : "bg-bear/15 text-bear-light border-bear/30")}>
                        {isBuy ? "▲ Long" : "▼ Short"}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase border bg-accent/10 text-accent-light border-accent/30">
                        {TEMPLATE_LABELS[s.template] ?? s.template}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded",
                        s.grade === "A+" ? "bg-bull/20 text-bull-light" : "bg-accent/20 text-accent-light")}>
                        {s.grade}
                      </span>
                      <span className="text-xs font-mono text-accent-light">{s.score}<span className="text-muted text-[10px]">/100</span></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted flex-wrap">
                    <span className="bg-surface-2 px-2 py-0.5 rounded font-mono">{s.entryTimeframe} entry</span>
                    <span className="bg-surface-2 px-2 py-0.5 rounded">{SPEED_LABELS[s.speedClass] ?? s.speedClass}</span>
                    <span className="bg-surface-2 px-2 py-0.5 rounded capitalize">{s.status.replace(/_/g, " ")}</span>
                    <span>{timeAgo(s.createdAt)}</span>
                    <span className="text-warn-light">expires in {expiresIn(s.expiresAt)}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px] font-mono">
                    <Lvl label="Entry"
                      value={`${fmt(s.entryZoneLow, s.decimalPlaces)} – ${fmt(s.entryZoneHigh, s.decimalPlaces)}`}
                      tone="neutral" />
                    <Lvl label="Stop" value={fmt(s.stopLoss, s.decimalPlaces)} tone="bear" />
                    <Lvl label="1R"   value={fmt(oneR, s.decimalPlaces)} tone="accent" />
                    <Lvl label="TP1"  value={fmt(s.takeProfit1, s.decimalPlaces)} tone="bull" />
                    {s.takeProfit2 != null && <Lvl label="TP2" value={fmt(s.takeProfit2, s.decimalPlaces)} tone="bull" />}
                  </div>

                  <AdminLotSizeForCard symbol={s.symbol} entry={(s.entryZoneLow + s.entryZoneHigh) / 2} stopLoss={s.stopLoss} />

                  {s.explanation && (
                    <p className="text-[11px] text-muted-light leading-relaxed">{s.explanation}</p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setExpandedId(expanded ? null : s.id)}
                      className="text-[11px] text-accent-light hover:text-accent transition-smooth"
                    >
                      {expanded ? "▲ less" : "▼ score breakdown + analysis"}
                    </button>
                    <ExecuteTradeButton
                      setup={{
                        symbol: s.symbol,
                        direction: isBuy ? "buy" : "sell",
                        entry: (s.entryZoneLow + s.entryZoneHigh) / 2,
                        stopLoss: s.stopLoss,
                        takeProfit: s.takeProfit1,
                        takeProfit2: s.takeProfit2,
                        timeframe: s.entryTimeframe,
                        setupType: `mini_${s.template}`,
                        qualityGrade: s.grade,
                        confidenceScore: s.score,
                        sourceType: "setup",
                        sourceRef: s.id,
                      }}
                    />
                  </div>

                  {expanded && (
                    <div className="pt-3 border-t border-border/30 space-y-3 text-[11px]">
                      {s.scoreBreakdown && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Score Breakdown</div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            <ScorePill label="Bias"      value={s.scoreBreakdown.biasAlignment}     max={15} />
                            <ScorePill label="Liquidity" value={s.scoreBreakdown.liquidityEvent}    max={15} />
                            <ScorePill label="Structure" value={s.scoreBreakdown.microStructure}    max={15} />
                            <ScorePill label="Zone"      value={s.scoreBreakdown.entryZoneQuality} max={15} />
                            <ScorePill label="Momentum"  value={s.scoreBreakdown.momentumDisplacement} max={15} />
                            <ScorePill label="Vol/Sprd"  value={s.scoreBreakdown.volatilitySpread} max={10} />
                            <ScorePill label="RR"        value={s.scoreBreakdown.riskReward}       max={10} />
                            <ScorePill label="Session"   value={s.scoreBreakdown.sessionTiming}    max={5} />
                          </div>
                        </div>
                      )}
                      {Array.isArray(s.metadata?.gates) && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Gates</div>
                          <div className="space-y-1">
                            {s.metadata.gates.map((g: any, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-[11px]">
                                <span className={cn("mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0",
                                  g.passed ? "bg-bull/30 text-bull-light" : "bg-bear/15 text-bear-light/70")}>
                                  <span className="text-[10px]">{g.passed ? "✓" : "✗"}</span>
                                </span>
                                <div className="min-w-0 flex-1">
                                  <span className={cn("font-semibold", g.hard && !g.passed ? "text-bear-light" : "text-foreground")}>{g.label}</span>
                                  {g.hard && <span className="ml-1 text-[9px] uppercase opacity-60">hard</span>}
                                  <div className="text-[10px] text-muted leading-snug">{g.evidence}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {s.invalidation && (
                        <p className="text-warn-light bg-warn/5 border border-warn/20 rounded-lg p-2 leading-relaxed">
                          <span className="font-semibold">Invalidation:</span> {s.invalidation}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────

function FilterRow({
  label, value, options, onChange, renderOption,
}: {
  label: string;
  value: "all" | string;
  options: string[];
  onChange: (v: "all" | string) => void;
  renderOption: (opt: string) => React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wider text-muted w-24 shrink-0">{label}</span>
      <button onClick={() => onChange("all")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
        value === "all" ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50")}>All</button>
      {options.map((opt) => (
        <button key={opt} onClick={() => onChange(opt)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
          value === opt ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50")}>{renderOption(opt)}</button>
      ))}
    </div>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: "bull" | "accent" | "neutral" }) {
  const cls = tone === "bull" ? "text-bull-light" : tone === "accent" ? "text-accent-light" : "text-foreground";
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase opacity-70">{label}</div>
      <div className={cn("text-2xl font-bold", cls)}>{value}</div>
    </div>
  );
}

function Lvl({ label, value, tone }: { label: string; value: string; tone: "bull" | "bear" | "accent" | "neutral" }) {
  const cls = tone === "bull" ? "bg-bull/5 border-bull/20 text-bull-light"
            : tone === "bear" ? "bg-bear/5 border-bear/20 text-bear-light"
            : tone === "accent" ? "bg-accent/5 border-accent/20 text-accent-light"
            : "bg-surface-3/40 border-border/30 text-foreground";
  const labelCls = tone === "bull" ? "text-bull-light"
                : tone === "bear" ? "text-bear-light"
                : tone === "accent" ? "text-accent-light"
                : "text-muted";
  return (
    <div className={cn("rounded-lg border p-2 text-center", cls)}>
      <div className={cn("text-[9px] uppercase mb-0.5", labelCls)}>{label}</div>
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
      <div className="text-[11px] font-mono font-bold">{value}<span className="opacity-50">/{max}</span></div>
    </div>
  );
}
