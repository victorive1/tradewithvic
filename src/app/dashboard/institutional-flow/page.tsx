"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { computeOneR } from "@/lib/setups/one-r";
import { LotSizeForCard } from "@/components/admin/AdminRiskTarget";

interface Signal {
  id: string;
  assetSymbol: string;
  direction: "long" | "short" | "neutral";
  classification: string;
  horizon: string;
  intentScore: number;
  confidenceGrade: string;
  flowQuality: number;
  derivativesScore: number;
  crossAssetScore: number;
  venueScore: number;
  catalystScore: number;
  persistenceScore: number;
  positioningScore: number;
  regimeScore: number;
  defendedLevel: number | null;
  invalidationLevel: number | null;
  persistenceProb: number | null;
  explanationJson: string;
  capturedAt: string;
}

function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function gradeClass(g: string): string {
  return g === "A+" ? "text-bull-light border-bull/40 bg-bull/10"
    : g === "A"   ? "text-accent-light border-accent/40 bg-accent/10"
    : g === "B"   ? "text-warn border-warn/40 bg-warn/10"
    : "text-muted border-border bg-surface-2";
}

export default function InstitutionalFlowPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [minScore, setMinScore] = useState(0);
  const [directionFilter, setDirectionFilter] = useState<"all" | "long" | "short">("all");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (minScore > 0) qs.set("minScore", String(minScore));
      if (directionFilter !== "all") qs.set("direction", directionFilter);
      qs.set("t", String(Date.now())); // cache-bust any edge layer
      const res = await fetch(`/api/iflow/signals/live?${qs.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals ?? []);
        setLastUpdated(Date.now());
      }
    } finally { setLoading(false); }
  }, [minScore, directionFilter]);

  useEffect(() => {
    load();
    const int = setInterval(load, 45_000);
    return () => clearInterval(int);
  }, [load]);

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;
  const freshnessLabel = ageSec == null ? null
    : ageSec < 60 ? `${ageSec}s ago`
    : `${Math.floor(ageSec / 60)}m ago`;

  return (
    <div className="page-container space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-fluid-3xl font-bold">Institutional Flow</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-bull/10 border border-bull/30 text-[10px] font-bold text-bull-light uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />
              Live
            </span>
            {freshnessLabel && (
              <span className="text-xs text-muted">Last updated {freshnessLabel} · refreshes every 45s</span>
            )}
          </div>
          <p className="text-fluid-sm text-muted-light max-w-2xl">
            Where large informed capital is most likely entering, defending, rotating, or distributing.
            Multi-layer inference from microstructure, cross-asset, catalyst, and regime evidence.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/institutional-flow/health" className="btn-ghost text-xs">⚕ Health</Link>
          <button onClick={load} className="btn-ghost text-xs">↻ Refresh</button>
        </div>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          {(["all", "long", "short"] as const).map((d) => (
            <button key={d} onClick={() => setDirectionFilter(d)}
              className={cn("px-3 py-1.5 rounded-full text-[11px] font-medium border transition-smooth",
                directionFilter === d ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light")}>
              {d === "all" ? "All" : d === "long" ? "Long" : "Short"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          {[0, 65, 75, 85].map((m) => (
            <button key={m} onClick={() => setMinScore(m)}
              className={cn("px-3 py-1.5 rounded-full text-[11px] font-mono font-semibold border transition-smooth",
                minScore === m ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light")}>
              {m === 0 ? "Any score" : `≥${m}`}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted ml-auto">{signals.length} active signals</span>
      </div>

      {loading && signals.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted">Loading signals…</div>
      ) : signals.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl opacity-40">👀</div>
          <p className="text-fluid-sm text-muted">No institutional signals right now at this threshold.</p>
          <p className="text-[11px] text-muted">The engine refreshes on every 2-min brain scan. Widen the score filter to see lower-conviction flows.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {signals.map((s) => <SignalCard key={s.id} signal={s} />)}
        </div>
      )}
    </div>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const isLong = signal.direction === "long";
  let drivers: string[] = [];
  try { drivers = JSON.parse(signal.explanationJson); } catch {}
  const components: Array<{ label: string; value: number; max: number }> = [
    { label: "Flow", value: signal.flowQuality, max: 20 },
    { label: "Derivs", value: signal.derivativesScore, max: 15 },
    { label: "Cross-asset", value: signal.crossAssetScore, max: 15 },
    { label: "Venue", value: signal.venueScore, max: 10 },
    { label: "Catalyst", value: signal.catalystScore, max: 10 },
    { label: "Persistence", value: signal.persistenceScore, max: 15 },
    { label: "Positioning", value: signal.positioningScore, max: 10 },
    { label: "Regime", value: signal.regimeScore, max: 5 },
  ];

  return (
    <section className="glass-card glass-card-hover overflow-hidden">
      <div className={cn("h-1", isLong ? "bg-bull" : signal.direction === "short" ? "bg-bear" : "bg-muted")} />
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-bold text-lg">{signal.assetSymbol}</span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-bold border",
                isLong ? "border-bull/40 bg-bull/10 text-bull-light"
                : signal.direction === "short" ? "border-bear/40 bg-bear/10 text-bear-light"
                : "border-border bg-surface-2 text-muted-light")}>
                {isLong ? "▲ LONG" : signal.direction === "short" ? "▼ SHORT" : "NEUTRAL"}
              </span>
              <span className="text-[10px] text-muted uppercase tracking-wider">{signal.classification}</span>
            </div>
            <div className="text-[11px] text-muted">{timeAgo(signal.capturedAt)} · horizon {signal.horizon}</div>
          </div>
          <div className="text-right shrink-0">
            <div className={cn("inline-flex items-baseline gap-1 text-3xl font-bold font-mono tabular-nums",
              signal.confidenceGrade === "A+" ? "text-bull-light"
              : signal.confidenceGrade === "A" ? "text-accent-light"
              : signal.confidenceGrade === "B" ? "text-warn"
              : "text-muted")}>
              {signal.intentScore.toFixed(0)}
            </div>
            <div className={cn("text-[10px] mt-0.5 px-1.5 py-0.5 rounded border font-bold inline-block",
              gradeClass(signal.confidenceGrade))}>
              {signal.confidenceGrade}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {components.map((c) => (
            <div key={c.label} className="bg-surface-2/50 border border-border/40 rounded-lg p-2">
              <div className="text-[9px] uppercase tracking-wider text-muted mb-1">{c.label}</div>
              <div className="flex items-baseline gap-1">
                <span className={cn("text-xs font-mono font-bold",
                  c.value / c.max >= 0.7 ? "text-bull-light"
                  : c.value / c.max >= 0.4 ? "text-accent-light"
                  : c.value === 0 ? "text-muted" : "text-warn")}>
                  {c.value.toFixed(0)}
                </span>
                <span className="text-[9px] text-muted">/{c.max}</span>
              </div>
              <div className="mt-1 h-0.5 rounded-full bg-surface-3/80 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all",
                  c.value / c.max >= 0.7 ? "bg-bull"
                  : c.value / c.max >= 0.4 ? "bg-accent-light"
                  : c.value === 0 ? "bg-muted/40" : "bg-warn")}
                  style={{ width: `${Math.max(3, (c.value / c.max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {drivers.length > 0 && (
          <ul className="space-y-1.5 text-xs text-muted-light">
            {drivers.slice(0, 3).map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-accent-light shrink-0 mt-0.5">·</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
          <div className="flex items-center gap-3 text-[11px] text-muted font-mono">
            {signal.defendedLevel != null && <span>Defended <span className="text-foreground">{signal.defendedLevel.toFixed(4)}</span></span>}
            {signal.invalidationLevel != null && <span>Invalid <span className="text-bear-light">{signal.invalidationLevel.toFixed(4)}</span></span>}
            {signal.persistenceProb != null && <span>Persist <span className="text-accent-light">{(signal.persistenceProb * 100).toFixed(0)}%</span></span>}
          </div>
        </div>

        <IflowTradeSetup signal={signal} />

        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/dashboard/institutional-flow/${signal.id}`}
            className="text-[11px] text-accent-light hover:text-accent transition-smooth px-3 py-2">
            Explain →
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Trade setup derived from the iflow signal itself. Entry anchored at the
 * defended level (where informed capital stepped in), stop just beyond the
 * invalidation level, targets stepped 1.5R / 2.5R off measured risk.
 * Only renders when the signal has concrete levels — we don't invent them.
 */
function IflowTradeSetup({ signal }: { signal: Signal }) {
  if (signal.direction === "neutral") return null;
  if (signal.defendedLevel == null || signal.invalidationLevel == null) return null;

  const isLong = signal.direction === "long";
  const defended = signal.defendedLevel;
  const invalidation = signal.invalidationLevel;

  // Direction sanity: invalidation should sit on the opposite side of
  // price relative to the bias. If the pair is malformed, skip the panel
  // rather than render a nonsensical setup.
  if (isLong && invalidation >= defended) return null;
  if (!isLong && invalidation <= defended) return null;

  const risk = Math.abs(defended - invalidation);
  if (risk <= 0) return null;

  const inst = ALL_INSTRUMENTS.find((i) => i.symbol === signal.assetSymbol);
  const decimals = inst?.decimals ?? 4;

  const entry = defended;
  const stopLoss = invalidation;
  const takeProfit1 = isLong ? entry + risk * 1.5 : entry - risk * 1.5;
  const takeProfit2 = isLong ? entry + risk * 2.5 : entry - risk * 2.5;
  const entryBand = risk * 0.10; // narrow band around defended
  const entryLow = Math.min(entry - entryBand, entry);
  const entryHigh = Math.max(entry + entryBand, entry);
  const rr = 2.5;
  const fmt = (n: number) => n.toFixed(decimals);

  return (
    <div className="rounded-xl border border-border/50 bg-surface-2/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Trade Setup</span>
          <span className={cn(
            "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border",
            isLong ? "bg-bull/10 text-bull-light border-bull/40" : "bg-bear/10 text-bear-light border-bear/40",
          )}>
            {isLong ? "▲ BUY" : "▼ SELL"}
          </span>
        </div>
        <span className="text-[11px] text-muted font-mono">
          RR {rr.toFixed(2)} · {signal.classification}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5 text-[10px] font-mono">
        <div className="rounded-lg bg-surface-3/40 border border-border/30 p-1.5 text-center">
          <div className="text-[9px] uppercase text-muted">Entry</div>
          <div className="text-foreground">{fmt(entry)}</div>
        </div>
        <div className="rounded-lg bg-bear/5 border border-bear/20 p-1.5 text-center">
          <div className="text-[9px] uppercase text-bear-light">Stop</div>
          <div className="text-bear-light">{fmt(stopLoss)}</div>
        </div>
        <div className="rounded-lg bg-accent/5 border border-accent/20 p-1.5 text-center">
          <div className="text-[9px] uppercase text-accent-light">1R</div>
          <div className="text-accent-light">{fmt(computeOneR(entry, stopLoss, isLong ? "long" : "short"))}</div>
        </div>
        <div className="rounded-lg bg-bull/5 border border-bull/20 p-1.5 text-center">
          <div className="text-[9px] uppercase text-bull-light">TP1</div>
          <div className="text-bull-light">{fmt(takeProfit1)}</div>
        </div>
        <div className="rounded-lg bg-bull/5 border border-bull/20 p-1.5 text-center">
          <div className="text-[9px] uppercase text-bull-light">TP2</div>
          <div className="text-bull-light">{fmt(takeProfit2)}</div>
        </div>
      </div>
      <LotSizeForCard symbol={signal.assetSymbol} entry={entry} stopLoss={stopLoss} />
      <p className="text-[10px] text-muted-light leading-relaxed">
        Entry at the defended level where informed capital appears to have stepped in. Stop just beyond the invalidation level; targets stepped 1.5R / 2.5R of measured risk.
      </p>
      <ExecuteTradeButton
        setup={{
          symbol: signal.assetSymbol,
          direction: isLong ? "buy" : "sell",
          entry,
          stopLoss,
          takeProfit: takeProfit1,
          takeProfit2,
          timeframe: signal.horizon,
          setupType: `iflow_${signal.classification}`,
          qualityGrade: signal.confidenceGrade,
          confidenceScore: Math.round(signal.intentScore),
          sourceType: "institutional_flow",
          sourceRef: signal.id,
        }}
        className="w-full"
      />
      <div className="text-[10px] text-muted-light sr-only" aria-hidden>
        {fmt(entryLow)}-{fmt(entryHigh)}
      </div>
    </div>
  );
}
