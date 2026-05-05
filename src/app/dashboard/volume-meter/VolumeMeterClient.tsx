"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { LiquidityLabel, PairLiquidityScore } from "@/lib/volume-meter/types";

type View = "scanner" | "detail" | "alerts";

const LABEL_COLORS: Record<LiquidityLabel, string> = {
  Extreme: "bg-warn/15 text-warn border-warn/30",
  Heavy:   "bg-bull/20 text-bull-light border-bull/40",
  Active:  "bg-bull/10 text-bull-light border-bull/30",
  Normal:  "bg-accent/10 text-accent-light border-accent/30",
  Thin:    "bg-bear/10 text-bear-light border-bear/30",
  Dead:    "bg-surface-3 text-muted-light border-border/40",
};

function meatColor(score: number): { text: string; bar: string } {
  if (score >= 76) return { text: "text-bull-light", bar: "bg-bull" };
  if (score >= 61) return { text: "text-bull", bar: "bg-bull/80" };
  if (score >= 41) return { text: "text-accent-light", bar: "bg-accent" };
  if (score >= 21) return { text: "text-bear-light", bar: "bg-bear/70" };
  return { text: "text-muted-light", bar: "bg-surface-3" };
}

function formatPostedAt(rawTs: number): string {
  const ts = rawTs < 1e12 ? rawTs * 1000 : rawTs;
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

function ComponentBar({ label, value, weight, max = 100 }: { label: string; value: number; weight: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = value >= 70 ? "bg-bull" : value >= 50 ? "bg-accent" : value >= 30 ? "bg-warn" : "bg-bear/70";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-muted-light">{label}</span>
        <span className="text-[10px] text-muted">×{weight.toFixed(2)} · <span className="text-foreground font-bold">{value}</span>/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScannerRow({ s, onSelect }: { s: PairLiquidityScore; onSelect: (sym: string) => void }) {
  const c = meatColor(s.meatScore);
  return (
    <button
      onClick={() => onSelect(s.symbol)}
      className="glass-card glass-card-hover w-full p-4 text-left transition-smooth"
    >
      <div className="flex items-center gap-4">
        {/* Pair + score */}
        <div className="flex flex-col items-center justify-center w-20 shrink-0">
          <div className={cn("text-3xl font-black leading-none", c.text)}>{s.warming ? "—" : s.meatScore}</div>
          <div className="text-[10px] text-muted mt-0.5">/100</div>
        </div>
        {/* Pair label + label badge */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-base font-black text-foreground">{s.pair}</span>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border", LABEL_COLORS[s.label])}>{s.label}</span>
            {s.warming && <span className="text-[10px] text-muted-light bg-surface-2 px-2 py-0.5 rounded-md border border-border/30">Warming up</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            <span className="text-muted">Vol: <span className="text-foreground font-semibold">{s.volumeState}</span></span>
            <span className="text-muted">·</span>
            <span className="text-muted">Session: <span className="text-foreground font-semibold">{s.session}</span></span>
            <span className="text-muted">·</span>
            <span className="text-muted">Spread: <span className="text-foreground font-semibold">{s.spreadQuality}</span></span>
          </div>
        </div>
        {/* Trade condition */}
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted">Trade</div>
          <div className={cn("text-xs font-black", s.tradeCondition === "Strong" || s.tradeCondition === "Strong but volatile" ? "text-bull-light" : s.tradeCondition === "Tradable" ? "text-bull" : s.tradeCondition === "Caution" ? "text-warn" : "text-bear-light")}>
            {s.tradeCondition}
          </div>
          {/* Score bar */}
          <div className="w-24 h-1 rounded-full bg-surface-3 overflow-hidden mt-1.5">
            <div className={cn("h-full rounded-full", c.bar)} style={{ width: `${s.warming ? 0 : s.meatScore}%` }} />
          </div>
        </div>
      </div>
    </button>
  );
}

function PairDetailPanel({ s }: { s: PairLiquidityScore }) {
  const c = meatColor(s.meatScore);
  const d = s.diagnostics;
  return (
    <div className="space-y-4">
      <div className="glass-card p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-black text-foreground">{s.pair}</h2>
              <span className={cn("text-xs font-black px-2.5 py-1 rounded-md border", LABEL_COLORS[s.label])}>{s.label}</span>
            </div>
            <div className="text-xs text-muted mt-1">
              Session: {s.session} · Volume State: {s.volumeState} · Updated {formatPostedAt(s.postedAt)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted">Market Meat Score</div>
            <div className={cn("text-5xl font-black leading-none", c.text)}>{s.warming ? "—" : s.meatScore}</div>
            <div className="w-32 h-1.5 rounded-full bg-surface-3 overflow-hidden mt-2">
              <div className={cn("h-full rounded-full", c.bar)} style={{ width: `${s.warming ? 0 : s.meatScore}%` }} />
            </div>
            <div className={cn("text-xs font-black mt-2", s.tradeCondition === "Strong" || s.tradeCondition === "Strong but volatile" ? "text-bull-light" : s.tradeCondition === "Tradable" ? "text-bull" : s.tradeCondition === "Caution" ? "text-warn" : "text-bear-light")}>
              {s.tradeCondition}
            </div>
          </div>
        </div>

        {/* Components */}
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-4 pt-4 border-t border-border/20">
          <ComponentBar label="Tick Activity (volume vs baseline)" value={s.components.tickActivity} weight={0.30} />
          <ComponentBar label="Candle Participation" value={s.components.candleParticipation} weight={0.25} />
          <ComponentBar label="ATR Expansion" value={s.components.atrExpansion} weight={0.20} />
          <ComponentBar label="Session Strength" value={s.components.sessionStrength} weight={0.15} />
          <ComponentBar label="Range Quality" value={s.components.rangeQuality} weight={0.10} />
        </div>

        {/* Reasons */}
        {s.reasons.length > 0 && (
          <div className="pt-4 border-t border-border/20">
            <div className="text-xs font-semibold text-foreground mb-2">Why this score</div>
            <div className="flex flex-wrap gap-1.5">
              {s.reasons.map((r, i) => (
                <span key={i} className="text-[11px] text-muted-light bg-surface-2 border border-border/30 rounded-full px-2.5 py-1">{r}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Diagnostics */}
      <div className="glass-card p-5">
        <div className="text-xs font-semibold text-foreground mb-3">Underlying numbers ({d.timeframe})</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Diag label="Current vol" value={d.currentVolume?.toLocaleString() ?? "—"} />
          <Diag label="Baseline vol" value={d.baselineVolume?.toLocaleString() ?? "—"} />
          <Diag label="Vol ratio" value={d.volumeRatio !== null ? `${d.volumeRatio.toFixed(2)}×` : "—"} />
          <Diag label="ATR(14)" value={d.atr14 !== null ? d.atr14.toFixed(5) : "—"} />
          <Diag label="Range" value={d.candleRange !== null ? d.candleRange.toFixed(5) : "—"} />
          <Diag label="Range ÷ ATR" value={d.atrExpansionRatio !== null ? `${d.atrExpansionRatio.toFixed(2)}×` : "—"} />
          <Diag label="Body strength" value={d.bodyStrength !== null ? `${Math.round(d.bodyStrength * 100)}%` : "—"} />
          <Diag label="Candles loaded" value={`${d.candleCount}`} />
        </div>
      </div>
    </div>
  );
}

function Diag({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-lg p-2.5">
      <div className="text-[10px] text-muted mb-0.5">{label}</div>
      <div className="font-mono text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}

export function VolumeMeterClient({ scores, capturedAt }: { scores: PairLiquidityScore[]; capturedAt: number | null }) {
  const [view, setView] = useState<View>("scanner");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const tradable = useMemo(() => scores.filter((s) => !s.warming && s.meatScore >= 61).length, [scores]);
  const warming = useMemo(() => scores.filter((s) => s.warming).length, [scores]);
  const dead = useMemo(() => scores.filter((s) => !s.warming && s.meatScore < 21).length, [scores]);
  const top = scores.find((s) => !s.warming) ?? null;

  const detail = useMemo(() => {
    const sym = selectedSymbol ?? top?.symbol;
    return scores.find((s) => s.symbol === sym) ?? null;
  }, [scores, selectedSymbol, top]);

  function selectPair(sym: string) {
    setSelectedSymbol(sym);
    setView("detail");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">FX Wonders Market Meat Engine</h1>
        <p className="text-sm text-muted mt-1">
          Real-time liquidity & participation score per pair. Answers: <span className="text-foreground">is this pair alive right now, or thin and dangerous?</span>
        </p>
        {capturedAt && <p className="text-[10px] text-muted mt-1">Data sampled {formatPostedAt(capturedAt)}</p>}
      </div>

      {/* Top stats */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Best Pair Right Now</div>
          <div className="text-2xl font-black gradient-text-accent">{top?.pair ?? "—"}</div>
          <div className="text-xs text-muted mt-1">{top ? `${top.meatScore}/100 · ${top.label}` : "—"}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Tradable Pairs (≥ 61)</div>
          <div className="text-3xl font-black text-bull-light">{tradable}</div>
          <div className="text-xs text-muted mt-1">of {scores.length}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Dead / Avoid</div>
          <div className="text-3xl font-black text-bear-light">{dead}</div>
          <div className="text-xs text-muted mt-1">below 21</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Warming Up</div>
          <div className="text-3xl font-black text-muted-light">{warming}</div>
          <div className="text-xs text-muted mt-1">candle data populating</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "scanner" as const, label: `Pair Scanner (${scores.length})` },
          { id: "detail" as const, label: detail ? `Pair Detail · ${detail.pair}` : "Pair Detail" },
          { id: "alerts" as const, label: "Alerts" },
        ].map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
              view === v.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* SCANNER VIEW */}
      {view === "scanner" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Pairs ranked by Market Meat Score. Click a row to see the breakdown.</p>
          {scores.map((s) => <ScannerRow key={s.symbol} s={s} onSelect={selectPair} />)}
          {scores.length === 0 && (
            <div className="glass-card p-12 text-center">
              <p className="text-muted">No score data available yet — the scanner is warming up.</p>
            </div>
          )}
        </div>
      )}

      {/* DETAIL VIEW */}
      {view === "detail" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {scores.map((s) => (
              <button
                key={s.symbol}
                onClick={() => setSelectedSymbol(s.symbol)}
                className={cn(
                  "text-[11px] font-bold px-2.5 py-1 rounded-md border transition-smooth",
                  detail?.symbol === s.symbol
                    ? "bg-accent text-white border-accent"
                    : "bg-surface-2 text-muted-light border-border/50 hover:bg-surface-3",
                )}
              >
                {s.pair} · {s.warming ? "—" : s.meatScore}
              </button>
            ))}
          </div>
          {detail ? <PairDetailPanel s={detail} /> : (
            <div className="glass-card p-12 text-center">
              <p className="text-muted">Select a pair from the list above to see its full breakdown.</p>
            </div>
          )}
        </div>
      )}

      {/* ALERTS VIEW (V1 placeholder) */}
      {view === "alerts" && (
        <div className="glass-card p-8 text-center">
          <h3 className="text-lg font-bold text-foreground mb-2">Liquidity Alerts</h3>
          <p className="text-sm text-muted max-w-xl mx-auto leading-relaxed">
            V1 ships the score engine and scanner. Real-time alerts — dry-up warnings, fake-move detection,
            best-pair-right-now pings — are scheduled for V2 once we have a few days of score history to
            anchor baselines.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-5 text-[11px] text-muted-light">
            <span className="bg-surface-2 border border-border/40 rounded-full px-3 py-1">Volume dry-up</span>
            <span className="bg-surface-2 border border-border/40 rounded-full px-3 py-1">Liquidity expansion</span>
            <span className="bg-surface-2 border border-border/40 rounded-full px-3 py-1">Fake move warning</span>
            <span className="bg-surface-2 border border-border/40 rounded-full px-3 py-1">Best pair right now</span>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How the Market Meat Score works</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">What it measures</p>
            <p>A 0–100 score combining tick activity (volume vs the pair&apos;s rolling baseline), candle participation (body vs wick), ATR expansion (current bar vs typical bar), session strength (time-of-day liquidity for that pair), and range quality (recent bars consistent vs choppy).</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Honest about FX volume</p>
            <p>Spot FX has no global volume feed. The score uses broker tick-volume + candle structure — strong proxies, but proxies. Spread quality is shown as &quot;Unknown&quot; in V1 because we don&apos;t have a live bid/ask stream yet.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">When pairs are warming up</p>
            <p>The 16 newly-added cross-pairs need a few candle-rotation cycles before they have enough history. They appear at the bottom of the scanner with a &quot;warming up&quot; badge until the candle pipeline catches them.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">How to use it</p>
            <p>Above 76 = best environment for A/A+ setups. 61–75 = clean intraday-tradable. 41–60 = trade only with strong agreement from other engines. Below 41 = thin / avoid new entries.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
