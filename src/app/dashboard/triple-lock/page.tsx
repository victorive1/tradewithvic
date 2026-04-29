"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";
import { useStableSetups } from "@/lib/dashboard/use-stable-setups";

// Triple Lock (Power of 3) tab. Auto-detector lives at
// src/lib/brain/strategies/triple-lock.ts and runs on every 2-min
// brain scan. This page polls /api/market/triple-lock every 60s and
// pauses while the user is interacting with a card. Each signal card
// can be expanded to show the full 12-gate breakdown read-only —
// passed/failed, points, evidence, and whether the read was direct
// or a VP/OF heuristic stand-in.

interface GateBreakdown {
  id: string;
  num: number;
  engine: "PO3" | "VP/OF" | "CCTE" | "Universal";
  label: string;
  pts: number;
  passed: boolean;
  evidence: string;
  source: "direct" | "heuristic";
}

interface TripleLockMetadata {
  strategy: "triple_lock";
  tier: string;
  eps: number;
  score: number;
  maxScore: number;
  gatesPassed: number;
  gatesTotal: number;
  gates: GateBreakdown[];
}

interface TripleLockSignal {
  id: string;
  symbol: string;
  displayName: string;
  category: string;
  decimalPlaces: number;
  timeframe: string;
  direction: string;
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
  metadata: TripleLockMetadata | null;
}

const ENGINE_COLOR: Record<string, { text: string; bg: string; border: string }> = {
  PO3:         { text: "text-bull-light",   bg: "bg-bull/10",    border: "border-bull/30" },
  "VP/OF":     { text: "text-accent-light", bg: "bg-accent/10",  border: "border-accent/30" },
  CCTE:        { text: "text-blue-300",     bg: "bg-blue-500/10",border: "border-blue-500/30" },
  Universal:   { text: "text-warn-light",   bg: "bg-warn/10",    border: "border-warn/30" },
};

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

function tierColor(tier: string | undefined): string {
  if (!tier) return "text-muted";
  if (tier.includes("TIER 1")) return "text-bull-light";
  if (tier.includes("TIER 2")) return "text-accent-light";
  if (tier.includes("TIER 3")) return "text-warn-light";
  return "text-muted";
}

export default function TripleLockPage() {
  const [signals, setSignals] = useState<TripleLockSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [tierFilter, setTierFilter] = useState<"all" | "TIER 1" | "TIER 2" | "TIER 3">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (pausedRef.current) return;
      try {
        const res = await fetch(`/api/market/triple-lock?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && Array.isArray(data.signals)) {
          setSignals(data.signals);
          setLastUpdated(data.timestamp ?? Date.now());
        }
      } catch (e) {
        console.error("Failed to load Triple Lock signals:", e);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const getId = useCallback((s: TripleLockSignal) => s.id, []);
  const { items: stable, changedIds } = useStableSetups(signals, getId, paused);

  let filtered = stable;
  if (tierFilter !== "all") {
    filtered = filtered.filter((s) => s.metadata?.tier?.startsWith(tierFilter));
  }

  const tier1 = stable.filter((s) => s.metadata?.tier?.startsWith("TIER 1")).length;
  const tier2 = stable.filter((s) => s.metadata?.tier?.startsWith("TIER 2")).length;
  const tier3 = stable.filter((s) => s.metadata?.tier?.startsWith("TIER 3")).length;
  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;

  return (
    <div
      className="space-y-6"
      onMouseEnter={() => { pausedRef.current = true; setPaused(true); }}
      onMouseLeave={() => { pausedRef.current = false; setPaused(false); }}
    >
      <AdminRiskTargetBar />

      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Power of 3 (Triple Lock)</h1>
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
          Triple Lock combines Power of 3 (HTF bias + Asian accumulation + manipulation sweep with CHoCH), Volume Profile / Order Flow confluence, and CCTE precision execution. The brain auto-evaluates 12 gates (max 120 pts) every 2 minutes; signals scoring ≥72 pts surface here. <span className="text-muted-light">VP/OF gates 4–6 use brain heuristics — they&apos;re labeled <code className="font-mono">~heuristic</code> on each card so you can apply your own footprint judgment.</span>
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Active signals</div>
          <div className="text-xl font-bold">{stable.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Tier 1 — Fire</div>
          <div className="text-xl font-bold text-bull-light">{tier1}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Tier 2 — Armed</div>
          <div className="text-xl font-bold text-accent-light">{tier2}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Tier 3 — Monitor</div>
          <div className="text-xl font-bold text-warn-light">{tier3}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "TIER 1", "TIER 2", "TIER 3"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTierFilter(t)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth",
              tierFilter === t ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50",
            )}
          >
            {t === "all" ? "All tiers" : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-sm text-muted">
          Scanning the market for Triple Lock setups…
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⏸</div>
          <p className="text-sm text-muted">
            No Triple Lock signals matching your filter right now.
          </p>
          <p className="text-[11px] text-muted-light max-w-md mx-auto">
            All 12 gates rarely align simultaneously — that&apos;s by design. The brain re-scans every 2 minutes during London (07–10 UTC) and NY (13–16 UTC) sessions; off-session hours rarely produce setups.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {filtered.map((s) => {
            const isBuy = s.direction === "bullish" || s.direction === "buy" || s.direction === "long";
            const justUpdated = changedIds.has(s.id);
            const oneR = computeOneR(s.entry, s.stopLoss, isBuy ? "buy" : "sell");
            const expanded = expandedId === s.id;
            const meta = s.metadata;
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
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-base font-bold text-foreground truncate">{s.displayName}</h3>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border",
                        isBuy ? "bg-bull/15 text-bull-light border-bull/30" : "bg-bear/15 text-bear-light border-bear/30",
                      )}>
                        {isBuy ? "▲ Long" : "▼ Short"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                        tierColor(meta?.tier),
                        meta?.tier?.includes("TIER 1") && "bg-bull/15",
                        meta?.tier?.includes("TIER 2") && "bg-accent/15",
                        meta?.tier?.includes("TIER 3") && "bg-warn/15",
                      )}>
                        {meta?.tier ?? s.qualityGrade}
                      </span>
                      <span className="text-xs font-mono text-accent-light">
                        {meta?.eps ?? s.confidenceScore}<span className="text-muted text-[10px]">/100</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted">
                    <span className="bg-surface-2 px-2 py-0.5 rounded">{s.timeframe}</span>
                    <span className="bg-surface-2 px-2 py-0.5 rounded">triple_lock</span>
                    {meta && <span className="bg-surface-2 px-2 py-0.5 rounded">{meta.gatesPassed}/{meta.gatesTotal} gates</span>}
                    <span>{timeAgo(s.createdAt)}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px] font-mono">
                    <div className="rounded-lg bg-surface-3/40 border border-border/30 p-2 text-center">
                      <div className="text-[9px] uppercase text-muted mb-0.5">Entry</div>
                      <div className="text-foreground">{fmt(s.entry, s.decimalPlaces)}</div>
                    </div>
                    <div className="rounded-lg bg-bear/5 border border-bear/20 p-2 text-center">
                      <div className="text-[9px] uppercase text-bear-light mb-0.5">Stop</div>
                      <div className="text-bear-light">{fmt(s.stopLoss, s.decimalPlaces)}</div>
                    </div>
                    <div className="rounded-lg bg-accent/5 border border-accent/20 p-2 text-center">
                      <div className="text-[9px] uppercase text-accent-light mb-0.5">1R</div>
                      <div className="text-accent-light">{fmt(oneR, s.decimalPlaces)}</div>
                    </div>
                    <div className="rounded-lg bg-bull/5 border border-bull/20 p-2 text-center">
                      <div className="text-[9px] uppercase text-bull-light mb-0.5">TP1</div>
                      <div className="text-bull-light">{fmt(s.takeProfit1, s.decimalPlaces)}</div>
                    </div>
                    {s.takeProfit2 != null && (
                      <div className="rounded-lg bg-bull/5 border border-bull/20 p-2 text-center">
                        <div className="text-[9px] uppercase text-bull-light mb-0.5">TP2</div>
                        <div className="text-bull-light">{fmt(s.takeProfit2, s.decimalPlaces)}</div>
                      </div>
                    )}
                  </div>

                  <AdminLotSizeForCard symbol={s.symbol} entry={s.entry} stopLoss={s.stopLoss} />

                  {s.explanation && (
                    <p className="text-[11px] text-muted-light leading-relaxed">{s.explanation}</p>
                  )}

                  {/* 12-gate breakdown — read-only checklist as it stood at detection. */}
                  {meta?.gates && (
                    <div className="pt-2">
                      <button
                        onClick={() => setExpandedId(expanded ? null : s.id)}
                        className="text-[11px] text-accent-light hover:text-accent transition-smooth"
                      >
                        {expanded ? "▲ hide gate breakdown" : "▼ show 12-gate breakdown"}
                      </button>
                      {expanded && (
                        <div className="mt-3 space-y-3">
                          {(["PO3", "VP/OF", "CCTE", "Universal"] as const).map((engine) => {
                            const engineGates = meta.gates.filter((g) => g.engine === engine);
                            if (engineGates.length === 0) return null;
                            const cfg = ENGINE_COLOR[engine];
                            const passed = engineGates.filter((g) => g.passed).length;
                            return (
                              <div key={engine} className={cn("rounded-lg border", cfg.bg, cfg.border)}>
                                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                                  <span className={cn("text-[10px] font-bold uppercase tracking-wider", cfg.text)}>{engine}</span>
                                  <span className={cn("text-[11px] font-mono", cfg.text)}>{passed}/{engineGates.length}</span>
                                </div>
                                <div className="divide-y divide-border/20">
                                  {engineGates.map((g) => (
                                    <div key={g.id} className="px-3 py-2 flex items-start gap-3">
                                      <div className={cn(
                                        "mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0",
                                        g.passed ? "bg-bull/30 text-bull-light" : "bg-bear/15 text-bear-light/70",
                                      )}>
                                        <span className="text-[10px]">{g.passed ? "✓" : "✗"}</span>
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[11px] font-semibold text-foreground">G{g.num}</span>
                                          <span className="text-[11px] text-muted-light">{g.label}</span>
                                          {g.source === "heuristic" && (
                                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-warn/10 text-warn border border-warn/20">~heuristic</span>
                                          )}
                                          <span className={cn("ml-auto text-[10px] font-mono", g.passed ? "text-bull-light" : "text-muted")}>+{g.pts}</span>
                                        </div>
                                        <div className="text-[10px] text-muted mt-1 leading-relaxed">{g.evidence}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {s.invalidation && (
                    <p className="text-[10px] text-warn-light bg-warn/5 border border-warn/20 rounded-lg p-2 leading-relaxed">
                      <span className="font-semibold">Invalidation:</span> {s.invalidation}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted font-mono">RR {s.riskReward.toFixed(2)}</span>
                    <ExecuteTradeButton
                      setup={{
                        symbol: s.symbol,
                        direction: isBuy ? "buy" : "sell",
                        entry: s.entry,
                        stopLoss: s.stopLoss,
                        takeProfit: s.takeProfit1,
                        takeProfit2: s.takeProfit2,
                        timeframe: s.timeframe,
                        setupType: "triple_lock",
                        qualityGrade: s.qualityGrade,
                        confidenceScore: s.confidenceScore,
                        sourceType: "setup",
                        sourceRef: s.id,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
