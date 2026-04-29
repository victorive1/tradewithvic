"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";
import { useStableSetups } from "@/lib/dashboard/use-stable-setups";
import { strategyMeta, FAMILY_STYLES } from "@/lib/strategy-registry";
import { isBullishDirection } from "@/lib/setups/direction";

// Strategy Bible — single unified view over every brain-detected setup.
// Filterable by strategy / timeframe / grade. Default filters surface
// the highest-conviction signals across the whole brain: any strategy,
// any timeframe, A+ only.
//
// Source: /api/market/strategy-bible reads the TradeSetup table. New
// detectors auto-appear in the chip list — no frontend changes needed
// when a new strategy ships in the brain.

interface Signal {
  id: string;
  symbol: string;
  displayName: string;
  category: string;
  decimalPlaces: number;
  timeframe: string;
  direction: string;
  setupType: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  riskReward: number;
  confidenceScore: number;
  qualityGrade: string;
  explanation: string | null;
  invalidation: string | null;
  validUntil: string | null;
  createdAt: string;
  metadata: unknown;
}

interface Facets {
  strategies: string[];
  timeframes: string[];
  grades: string[];
}

type GradeFilter = "all" | "A+" | "A" | "A_AND_APLUS";

function fmt(n: number, dp: number): string {
  return dp > 0 ? n.toFixed(dp) : Math.round(n).toLocaleString();
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export default function StrategyBiblePage() {
  // Filters. Defaults: every strategy + every timeframe, A+ only.
  const [strategyFilter, setStrategyFilter] = useState<"all" | string>("all");
  const [timeframeFilter, setTimeframeFilter] = useState<"all" | string>("all");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("A+");

  const [signals, setSignals] = useState<Signal[]>([]);
  const [facets, setFacets] = useState<Facets>({ strategies: [], timeframes: [], grades: [] });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  // Convert the grade-filter UI value into a server query param.
  const gradeQuery = useMemo(() => {
    switch (gradeFilter) {
      case "A+": return "A+";
      case "A": return "A";
      case "A_AND_APLUS": return "A+,A";
      default: return "all";
    }
  }, [gradeFilter]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (pausedRef.current) return;
      try {
        const params = new URLSearchParams({
          strategy: strategyFilter,
          timeframe: timeframeFilter,
          grade: gradeQuery,
          t: String(Date.now()),
        });
        const res = await fetch(`/api/market/strategy-bible?${params}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          if (Array.isArray(data.signals)) setSignals(data.signals);
          if (data.facets) setFacets(data.facets);
          setLastUpdated(data.timestamp ?? Date.now());
        }
      } catch (e) {
        console.error("Failed to load Strategy Bible signals:", e);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [strategyFilter, timeframeFilter, gradeQuery]);

  const getId = useCallback((s: Signal) => s.id, []);
  const { items: stable, changedIds } = useStableSetups(signals, getId, paused);

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;

  // Per-grade and per-strategy counts for the badge tally above the filter row.
  const counts = useMemo(() => {
    const byGrade: Record<string, number> = {};
    const byStrategy: Record<string, number> = {};
    for (const s of stable) {
      byGrade[s.qualityGrade] = (byGrade[s.qualityGrade] ?? 0) + 1;
      byStrategy[s.setupType] = (byStrategy[s.setupType] ?? 0) + 1;
    }
    return { byGrade, byStrategy };
  }, [stable]);

  return (
    <div
      className="space-y-6"
      onMouseEnter={() => { pausedRef.current = true; setPaused(true); }}
      onMouseLeave={() => { pausedRef.current = false; setPaused(false); }}
    >
      <AdminRiskTargetBar />

      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Strategy Bible</h1>
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
        <p className="text-sm text-muted mt-1 max-w-3xl">
          Unified view over every signal the Market Core Brain is producing right now — across every strategy and every timeframe. Filter to focus on one strategy at a time, drill down by timeframe, or flip between grades. Default surfaces only A+ Tier 1 across the whole brain.
        </p>
      </div>

      {/* Filter row — three groups of chips */}
      <div className="space-y-3">
        <FilterRow
          label="Strategy"
          value={strategyFilter}
          options={facets.strategies}
          onChange={setStrategyFilter}
          renderOption={(opt) => {
            const m = strategyMeta(opt);
            const count = counts.byStrategy[opt] ?? 0;
            return (
              <span>
                {m.label}
                {count > 0 && <span className="ml-1.5 text-[10px] opacity-70">{count}</span>}
              </span>
            );
          }}
        />
        <FilterRow
          label="Timeframe"
          value={timeframeFilter}
          options={facets.timeframes}
          onChange={setTimeframeFilter}
          renderOption={(opt) => <span className="font-mono">{opt}</span>}
        />
        {/* Grade filter is hand-built — uses A_AND_APLUS sentinel for combined option */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-muted w-24 shrink-0">Grade</span>
          {(["all", "A+", "A_AND_APLUS", "A"] as const).map((g) => {
            const active = gradeFilter === g;
            const label = g === "all" ? "All" : g === "A+" ? "A+ only" : g === "A_AND_APLUS" ? "A+ and A" : "A only";
            return (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
                  active ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Signal grid */}
      {loading ? (
        <div className="glass-card p-12 text-center text-sm text-muted">Loading the Strategy Bible…</div>
      ) : stable.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⚖</div>
          <p className="text-sm text-muted">No signals match these filters right now.</p>
          <p className="text-[11px] text-muted-light max-w-md mx-auto">
            Try widening to <strong>All</strong> grades or <strong>A+ and A</strong>. The brain re-scans every 2 minutes — if the market is quiet, the Bible will be too.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {stable.map((s) => {
            const isBuy = isBullishDirection(s.direction);
            const justUpdated = changedIds.has(s.id);
            const oneR = computeOneR(s.entry, s.stopLoss, s.direction);
            const meta = strategyMeta(s.setupType);
            const fam = FAMILY_STYLES[meta.family];
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
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border",
                        isBuy ? "bg-bull/15 text-bull-light border-bull/30" : "bg-bear/15 text-bear-light border-bear/30",
                      )}>
                        {isBuy ? "▲ Long" : "▼ Short"}
                      </span>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase border", fam.text, fam.bg, fam.border)}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded",
                        s.qualityGrade === "A+" ? "bg-bull/15 text-bull-light" :
                        s.qualityGrade === "A" ? "bg-bull/10 text-bull-light" :
                        s.qualityGrade === "B" ? "bg-warn/10 text-warn" :
                        "bg-muted/10 text-muted-light",
                      )}>
                        {s.qualityGrade}
                      </span>
                      <span className="text-xs font-mono text-accent-light">{s.confidenceScore}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted">
                    <span className="bg-surface-2 px-2 py-0.5 rounded font-mono">{s.timeframe}</span>
                    <span className="bg-surface-2 px-2 py-0.5 rounded">{meta.family}</span>
                    <span>{timeAgo(s.createdAt)}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px] font-mono">
                    <Lvl label="Entry" value={fmt(s.entry, s.decimalPlaces)} tone="neutral" />
                    <Lvl label="Stop"  value={fmt(s.stopLoss, s.decimalPlaces)} tone="bear" />
                    <Lvl label="1R"    value={fmt(oneR, s.decimalPlaces)} tone="accent" />
                    <Lvl label="TP1"   value={fmt(s.takeProfit1, s.decimalPlaces)} tone="bull" />
                    {s.takeProfit2 != null && <Lvl label="TP2" value={fmt(s.takeProfit2, s.decimalPlaces)} tone="bull" />}
                  </div>

                  <AdminLotSizeForCard symbol={s.symbol} entry={s.entry} stopLoss={s.stopLoss} />

                  {s.explanation && (
                    <p className="text-[11px] text-muted-light leading-relaxed">{s.explanation}</p>
                  )}

                  {meta.blurb && (
                    <p className="text-[10px] text-muted italic">{meta.blurb}</p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted font-mono">RR {s.riskReward.toFixed(2)}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedId(expanded ? null : s.id)}
                        className="text-[11px] text-accent-light hover:text-accent transition-smooth"
                      >
                        {expanded ? "▲ less" : "▼ details"}
                      </button>
                      <ExecuteTradeButton
                        setup={{
                          symbol: s.symbol,
                          direction: isBuy ? "buy" : "sell",
                          entry: s.entry,
                          stopLoss: s.stopLoss,
                          takeProfit: s.takeProfit1,
                          takeProfit2: s.takeProfit2,
                          timeframe: s.timeframe,
                          setupType: s.setupType,
                          qualityGrade: s.qualityGrade,
                          confidenceScore: s.confidenceScore,
                          sourceType: "setup",
                          sourceRef: s.id,
                        }}
                      />
                    </div>
                  </div>

                  {expanded && (
                    <div className="pt-3 border-t border-border/30 space-y-2 text-[11px]">
                      {s.invalidation && (
                        <p className="text-warn-light bg-warn/5 border border-warn/20 rounded-lg p-2 leading-relaxed">
                          <span className="font-semibold">Invalidation:</span> {s.invalidation}
                        </p>
                      )}
                      {s.metadata != null && (
                        <details className="text-muted-light">
                          <summary className="cursor-pointer text-[11px] text-accent-light">Strategy metadata</summary>
                          <pre className="mt-2 overflow-x-auto bg-surface-2 border border-border/30 rounded p-2 text-[10px] leading-snug font-mono whitespace-pre-wrap break-words">{JSON.stringify(s.metadata, null, 2)}</pre>
                        </details>
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

// ── Sub-components ────────────────────────────────────────────────────────

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
      <button
        onClick={() => onChange("all")}
        className={cn(
          "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
          value === "all" ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50",
        )}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
            value === opt ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50",
          )}
        >
          {renderOption(opt)}
        </button>
      ))}
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
