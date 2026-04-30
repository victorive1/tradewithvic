"use client";

import { cn } from "@/lib/utils";

// Per-symbol Analysis modal for the Retail vs Institution tab.
// Shows the same data as the inline expansion but in a focused
// presentation with bigger panels + a 24h history sparkline (sparkline
// hook deferred — Phase 4 v1 ships the static modal).

interface Snapshot {
  id: string;
  symbol: string;
  displayName: string;
  decimalPlaces: number;
  retailLongPct: number | null;
  retailShortPct: number | null;
  retailCrowding: string | null;
  retailDataSource: string | null;
  institutionalBuyScore: number;
  institutionalSellScore: number;
  syntheticCvd: number | null;
  vwapPosition: number | null;
  vwapSlope: number | null;
  volumeZScore: number | null;
  oiChange: number | null;
  cotNet: number | null;
  trapScore: number;
  trapType: string | null;
  finalBias: string;
  confidence: number;
  invalidation: number | null;
  targetLiquidity: number | null;
  expectedHoldMinutes: number;
  narrative: string | null;
  reasons: Array<{ component: string; weight: number; evidence: string }> | null;
  metadata: any;
  createdAt: string;
}

function fmt(n: number, dp: number): string {
  return dp > 0 ? n.toFixed(dp) : Math.round(n).toLocaleString();
}

export function FlowAnalysisModal({ snap, open, onClose }: { snap: Snapshot | null; open: boolean; onClose: () => void }) {
  if (!open || !snap) return null;
  const isBull = snap.finalBias === "bullish";
  const isBear = snap.finalBias === "bearish";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className={cn("h-1.5", isBull ? "bg-bull" : isBear ? "bg-bear" : "bg-muted")} />
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">{snap.displayName}</h2>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border",
                  isBull ? "bg-bull/15 text-bull-light border-bull/30"
                  : isBear ? "bg-bear/15 text-bear-light border-bear/30"
                  : "bg-muted/15 text-muted border-muted/30",
                )}>
                  {isBull ? "▲ bullish" : isBear ? "▼ bearish" : "neutral"}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted">
                Confidence: {snap.confidence}/100 · Expected hold ~{Math.round(snap.expectedHoldMinutes / 60 * 10) / 10}h
              </div>
            </div>
            <button onClick={onClose} className="text-muted hover:text-foreground transition-smooth text-2xl px-2 leading-none" aria-label="Close">×</button>
          </div>

          {/* Narrative */}
          {snap.narrative && (
            <div className="text-[12px] text-foreground bg-surface-2/50 border border-border/30 rounded-lg p-3 leading-relaxed">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Engine Read</div>
              {snap.narrative}
            </div>
          )}

          {/* Two-column big layout */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-warn/30 bg-warn/5 p-3">
              <div className="text-[10px] uppercase tracking-wider text-warn-light mb-2">Retail Flow</div>
              {snap.retailCrowding === "unavailable" ? (
                <div className="text-muted-light italic text-[12px]">Data source unavailable for this instrument.</div>
              ) : (
                <div className="space-y-1.5">
                  <BigStat label={`Long ${snap.retailDataSource === "myfxbook" ? "(myfxbook)" : ""}`} value={`${snap.retailLongPct?.toFixed(0) ?? "—"}%`} />
                  <BigStat label="Short" value={`${snap.retailShortPct?.toFixed(0) ?? "—"}%`} />
                  <div className="text-[11px] uppercase font-bold mt-2">{snap.retailCrowding?.replace(/_/g, " ")}</div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
              <div className="text-[10px] uppercase tracking-wider text-accent-light mb-2">Institutional Flow (estimated)</div>
              <div className="space-y-1.5">
                <BigStat label="Buy pressure"  value={`${snap.institutionalBuyScore}/100`}  tone={snap.institutionalBuyScore  >= 60 ? "bull" : "neutral"} />
                <BigStat label="Sell pressure" value={`${snap.institutionalSellScore}/100`} tone={snap.institutionalSellScore >= 60 ? "bear" : "neutral"} />
                <div className="text-[11px] text-muted-light mt-2">
                  {snap.metadata?.cvdSource === "real_aggressor" ? (
                    <>
                      <span className="text-bull-light font-bold">Real CVD</span> {snap.syntheticCvd?.toFixed(0) ?? "—"}
                      <span className="text-muted"> ({snap.metadata.cvdTradeCount ?? "?"} trades · 30m window)</span>
                    </>
                  ) : (
                    <>
                      <span className="text-warn-light">Synthetic CVD</span> {snap.syntheticCvd?.toFixed(0) ?? "—"}
                    </>
                  )} · VWAP {snap.vwapPosition?.toFixed(2) ?? "—"} ATR · Vol z {snap.volumeZScore?.toFixed(2) ?? "—"}
                </div>
                {snap.oiChange != null && <div className="text-[11px] text-muted-light">Binance OI 1h: {snap.oiChange.toFixed(2)}%</div>}
                {snap.cotNet != null && <div className="text-[11px] text-muted-light">CFTC commercial net: {snap.cotNet.toFixed(0)}</div>}
              </div>
            </div>

            <div className={cn("rounded-lg border p-3", snap.trapScore >= 65 ? "border-bear/30 bg-bear/5" : "border-border/40 bg-surface-2/30")}>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Trap Detector</div>
              <div className="space-y-1.5">
                <BigStat label="Risk" value={`${snap.trapScore}/100`} tone={snap.trapScore >= 65 ? "bear" : "neutral"} />
                <div className={cn("text-[11px] uppercase font-bold mt-2",
                  snap.trapScore >= 65 && snap.trapType === "bull_trap" ? "text-bear-light"
                  : snap.trapScore >= 65 && snap.trapType === "bear_trap" ? "text-bull-light"
                  : "text-muted")}>
                  {snap.trapType?.replace(/_/g, " ") ?? "—"}
                </div>
                {Array.isArray(snap.metadata?.trapReasons) && (
                  <ul className="text-[10px] text-muted-light list-disc list-inside mt-2 space-y-0.5">
                    {snap.metadata.trapReasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </div>
            </div>

            <div className={cn("rounded-lg border p-3",
              isBull ? "border-bull/30 bg-bull/5" : isBear ? "border-bear/30 bg-bear/5" : "border-border/40 bg-surface-2/30")}>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Prediction</div>
              <div className="space-y-1.5">
                <BigStat label="Target" value={snap.targetLiquidity != null ? fmt(snap.targetLiquidity, snap.decimalPlaces) : "—"} tone="bull" />
                <BigStat label="Invalidation" value={snap.invalidation != null ? fmt(snap.invalidation, snap.decimalPlaces) : "—"} tone="bear" />
                <div className="text-[11px] text-muted-light mt-2">
                  {snap.metadata?.liquidity?.zoneCount ?? 0} liquidity zones tracked
                </div>
              </div>
            </div>
          </div>

          {/* Bias contributors */}
          {Array.isArray(snap.reasons) && snap.reasons.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Bias Contributors</div>
              <div className="space-y-1">
                {snap.reasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="bg-surface-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold shrink-0">{r.component}</span>
                    <span className="text-muted-light flex-1">{r.evidence}</span>
                    <span className="text-accent-light font-mono shrink-0">+{r.weight.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Institutional reasons (full evidence list) */}
          {Array.isArray(snap.metadata?.instReasons) && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Institutional Evidence</div>
              <ul className="text-[11px] text-muted-light list-disc list-inside space-y-0.5">
                {snap.metadata.instReasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-muted italic border-t border-border/30 pt-2">
            All institutional figures are <strong>estimated</strong> from price action, volume, and free derivatives data.
            This is not exact order flow. The product&apos;s honesty about that is its strength.
          </p>
        </div>
      </div>
    </div>
  );
}

function BigStat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "neutral" }) {
  const cls = tone === "bull" ? "text-bull-light" : tone === "bear" ? "text-bear-light" : "text-foreground";
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted">{label}</span>
      <span className={cn("font-mono font-bold text-base", cls)}>{value}</span>
    </div>
  );
}
