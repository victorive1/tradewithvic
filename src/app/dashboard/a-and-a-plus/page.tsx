"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";
import { useStableSetups } from "@/lib/dashboard/use-stable-setups";
import { strategyMeta, FAMILY_STYLES } from "@/lib/strategy-registry";
import { isBullishDirection } from "@/lib/setups/direction";

// "A & A+ Only" — narrower sister of the Strategy Bible. Hardcoded to
// grade=A+,A so B/C/D never show up here, polls every 2 minutes (the
// brain's scan cadence — a fresh 60s poll would just see the same data
// the brain already had). Source-attributed: each card shows which
// strategy produced it, plus an "open in tab" link if a dedicated
// dashboard tab exists for that strategy.

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

const POLL_MS = 120_000; // every 2 minutes per spec

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

export default function AAndAplusPage() {
  // Filters — only timeframe and strategy. Grade is locked to A+,A.
  const [strategyFilter, setStrategyFilter] = useState<"all" | string>("all");
  const [timeframeFilter, setTimeframeFilter] = useState<"all" | string>("all");

  const [signals, setSignals] = useState<Signal[]>([]);
  const [facets, setFacets] = useState<Facets>({ strategies: [], timeframes: [], grades: [] });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSinceLastView, setNewSinceLastView] = useState<Set<string>>(new Set());
  const lastSignalIds = useRef<Set<string>>(new Set());
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (pausedRef.current) return;
      try {
        const params = new URLSearchParams({
          strategy: strategyFilter,
          timeframe: timeframeFilter,
          // Lock to A+ and A — that's the whole point of this tab.
          grade: "A+,A",
          t: String(Date.now()),
        });
        const res = await fetch(`/api/market/strategy-bible?${params}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          if (Array.isArray(data.signals)) {
            // Detect which signals are NEW since the last poll so the UI
            // can highlight them. First poll has no comparison baseline,
            // so nothing is "new".
            const incoming: Signal[] = data.signals;
            const incomingIds = new Set(incoming.map((s) => s.id));
            if (lastSignalIds.current.size > 0) {
              const fresh = new Set<string>();
              for (const s of incoming) {
                if (!lastSignalIds.current.has(s.id)) fresh.add(s.id);
              }
              if (fresh.size > 0) setNewSinceLastView(fresh);
              // Clear "new" markers after 8 seconds so the highlight isn't permanent.
              setTimeout(() => setNewSinceLastView(new Set()), 8000);
            }
            lastSignalIds.current = incomingIds;
            setSignals(incoming);
          }
          if (data.facets) setFacets(data.facets);
          setLastUpdated(data.timestamp ?? Date.now());
        }
      } catch (e) {
        console.error("Failed to load A & A+ signals:", e);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [strategyFilter, timeframeFilter]);

  const getId = useCallback((s: Signal) => s.id, []);
  const { items: stable, changedIds } = useStableSetups(signals, getId, paused);

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;

  // Per-grade tally for the banner. Only A+ and A are possible here.
  const counts = useMemo(() => {
    const aPlus = stable.filter((s) => s.qualityGrade === "A+").length;
    const a = stable.filter((s) => s.qualityGrade === "A").length;
    const byStrategy: Record<string, number> = {};
    for (const s of stable) byStrategy[s.setupType] = (byStrategy[s.setupType] ?? 0) + 1;
    return { aPlus, a, byStrategy };
  }, [stable]);

  return (
    <div
      className="space-y-6"
      onMouseEnter={() => { pausedRef.current = true; setPaused(true); }}
      onMouseLeave={() => { pausedRef.current = false; setPaused(false); }}
    >
      <AdminRiskTargetBar />

      {/* Banner — single grade tally, denser than Strategy Bible */}
      <div className="glass-card p-4 sm:p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">A &amp; A+ Only</h1>
            <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20 pulse-live">Live</span>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1 max-w-2xl">
            Every Tier 1 / Tier 2 signal across the entire brain — pooled from every strategy. Refreshes every 2 minutes; new signals pulse for a few seconds when they arrive.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-[10px] uppercase text-muted">A+</div>
            <div className="text-2xl font-bold text-bull-light">{counts.aPlus}</div>
          </div>
          <div className="w-px h-10 bg-border/50" />
          <div className="text-center">
            <div className="text-[10px] uppercase text-muted">A</div>
            <div className="text-2xl font-bold text-accent-light">{counts.a}</div>
          </div>
          <div className="w-px h-10 bg-border/50" />
          <div className="text-center">
            <div className="text-[10px] uppercase text-muted">Total</div>
            <div className="text-2xl font-bold text-foreground">{counts.aPlus + counts.a}</div>
          </div>
          {ageSec != null && (
            <span className="text-[11px] text-muted ml-2">
              {ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`}
            </span>
          )}
          {paused && (
            <span className="text-[10px] text-warn-light bg-warn/10 border border-warn/30 px-2 py-0.5 rounded-full">
              ⏸ paused
            </span>
          )}
        </div>
      </div>

      {/* Filter row — strategy + timeframe only. Grade is locked. */}
      <div className="space-y-2">
        <FilterRow
          label="Strategy"
          value={strategyFilter}
          options={facets.strategies}
          onChange={setStrategyFilter}
          renderOption={(opt) => {
            const m = strategyMeta(opt);
            const c = counts.byStrategy[opt] ?? 0;
            return (
              <span>
                {m.label}
                {c > 0 && <span className="ml-1.5 text-[10px] opacity-70">{c}</span>}
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
      </div>

      {/* Signal grid */}
      {loading ? (
        <div className="glass-card p-12 text-center text-sm text-muted">Loading top-grade signals…</div>
      ) : stable.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⚖</div>
          <p className="text-sm text-muted">No A or A+ signals match these filters right now.</p>
          <p className="text-[11px] text-muted-light max-w-md mx-auto">
            The brain&apos;s detectors only persist signals at Tier 2 (≥80) or Tier 1 (≥90). When markets are quiet, this list will be quiet too.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-3">
          {stable.map((s) => {
            const isBuy = isBullishDirection(s.direction);
            const justUpdated = changedIds.has(s.id) || newSinceLastView.has(s.id);
            const oneR = computeOneR(s.entry, s.stopLoss, s.direction);
            const meta = strategyMeta(s.setupType);
            const fam = FAMILY_STYLES[meta.family];
            const expanded = expandedId === s.id;
            const sourceHref = meta.dedicatedTab ?? `/dashboard/strategy-bible?strategy=${encodeURIComponent(s.setupType)}`;
            return (
              <div
                key={s.id}
                className={cn(
                  "glass-card overflow-hidden transition-all duration-300",
                  justUpdated && "ring-2 ring-accent/60 shadow-lg shadow-accent/15",
                )}
              >
                <div className={cn("h-1", isBuy ? "bg-bull" : "bg-bear")} />
                <div className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <h3 className="text-sm font-bold text-foreground truncate">{s.displayName}</h3>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border",
                        isBuy ? "bg-bull/15 text-bull-light border-bull/30" : "bg-bear/15 text-bear-light border-bear/30",
                      )}>
                        {isBuy ? "▲ Long" : "▼ Short"}
                      </span>
                      <a
                        href={sourceHref}
                        title={meta.dedicatedTab ? `Open ${meta.label} tab` : `View all ${meta.label} signals in Strategy Bible`}
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded uppercase border hover:opacity-80 transition-opacity",
                          fam.text, fam.bg, fam.border,
                        )}
                      >
                        {meta.label} ↗
                      </a>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded",
                        s.qualityGrade === "A+" ? "bg-bull/20 text-bull-light" : "bg-accent/20 text-accent-light",
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
                    <span className="font-mono">RR {s.riskReward.toFixed(2)}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 text-[11px] font-mono">
                    <Lvl label="Entry" value={fmt(s.entry, s.decimalPlaces)} tone="neutral" />
                    <Lvl label="Stop"  value={fmt(s.stopLoss, s.decimalPlaces)} tone="bear" />
                    <Lvl label="1R"    value={fmt(oneR, s.decimalPlaces)} tone="accent" />
                    <Lvl label="TP1"   value={fmt(s.takeProfit1, s.decimalPlaces)} tone="bull" />
                    {s.takeProfit2 != null && <Lvl label="TP2" value={fmt(s.takeProfit2, s.decimalPlaces)} tone="bull" />}
                  </div>

                  <AdminLotSizeForCard symbol={s.symbol} entry={s.entry} stopLoss={s.stopLoss} />

                  {s.explanation && (
                    <p className="text-[11px] text-muted-light leading-relaxed line-clamp-3">{s.explanation}</p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setExpandedId(expanded ? null : s.id)}
                        className="text-[11px] text-accent-light hover:text-accent transition-smooth"
                      >
                        {expanded ? "▲ less" : "▼ details"}
                      </button>
                      <a
                        href={sourceHref}
                        className="text-[11px] text-muted hover:text-foreground transition-smooth"
                      >
                        open in tab →
                      </a>
                    </div>
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

                  {expanded && (
                    <div className="pt-2 border-t border-border/30 space-y-2 text-[11px]">
                      {meta.blurb && <p className="text-muted italic">{meta.blurb}</p>}
                      {s.invalidation && (
                        <p className="text-warn-light bg-warn/5 border border-warn/20 rounded-lg p-2 leading-relaxed">
                          <span className="font-semibold">Invalidation:</span> {s.invalidation}
                        </p>
                      )}
                      {s.metadata != null && (
                        <details className="text-muted-light">
                          <summary className="cursor-pointer text-[11px] text-accent-light">Strategy gate breakdown</summary>
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
          "px-3 py-1 rounded-lg text-xs font-medium transition-smooth border",
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
            "px-3 py-1 rounded-lg text-xs font-medium transition-smooth border",
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
    <div className={cn("rounded border p-1.5 text-center", cls)}>
      <div className={cn("text-[9px] uppercase mb-0.5", labelCls)}>{label}</div>
      <div>{value}</div>
    </div>
  );
}
