"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FlowAnalysisModal } from "@/components/flow/FlowAnalysisModal";

// Retail vs Institution — front-end for the FlowVision engine. Five
// panels per the blueprint § 4: Retail Flow / Institutional Flow /
// Liquidity Map / Trap Detector / Prediction Feed. One row per
// MVP symbol; expanding a row reveals the analysis modal data.

interface Snapshot {
  id: string;
  symbol: string;
  displayName: string;
  decimalPlaces: number;
  timeframe: string;
  retailLongPct: number | null;
  retailShortPct: number | null;
  retailCrowding: string | null;
  retailDataSource: string | null;
  retailBuyScore: number;
  retailSellScore: number;
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
  session: string | null;
  metadata: any;
  createdAt: string;
}

interface Zone {
  id: string;
  symbol: string;
  timeframe: string;
  zoneType: string;
  direction: string | null;
  priceLow: number;
  priceHigh: number;
  strengthScore: number;
  formedAt: string;
  isFilled: boolean;
  isViolated: boolean;
}

function fmt(n: number, dp: number): string {
  return dp > 0 ? n.toFixed(dp) : Math.round(n).toLocaleString();
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export default function RetailVsInstitutionPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [zonesBySymbol, setZonesBySymbol] = useState<Record<string, Zone[]>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [modalSnap, setModalSnap] = useState<Snapshot | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(viaInterval: boolean) {
      if (viaInterval && pausedRef.current) return;
      try {
        const res = await fetch(`/api/flow/snapshots?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && Array.isArray(data.snapshots)) {
          setSnapshots(data.snapshots);
          setLastUpdated(data.timestamp ?? Date.now());

          // Pull zones for each symbol in parallel.
          const zoneEntries = await Promise.all(
            data.snapshots.map(async (s: Snapshot) => {
              try {
                const zr = await fetch(`/api/flow/zones?symbol=${encodeURIComponent(s.symbol)}&t=${Date.now()}`, { cache: "no-store" });
                const zd = await zr.json();
                return [s.symbol, Array.isArray(zd.zones) ? zd.zones : []] as const;
              } catch { return [s.symbol, []] as const; }
            }),
          );
          if (!cancelled) {
            const map: Record<string, Zone[]> = {};
            for (const [sym, zs] of zoneEntries) map[sym] = zs;
            setZonesBySymbol(map);
          }
        }
      } catch (e) {
        console.error("Failed to load FlowVision:", e);
      }
      if (!cancelled) setLoading(false);
    }
    load(false);
    const id = setInterval(() => load(true), 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;

  return (
    <div
      className="space-y-6"
      onMouseEnter={() => { pausedRef.current = true; setPaused(true); }}
      onMouseLeave={() => { pausedRef.current = false; setPaused(false); }}
    >
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Retail vs Institution</h1>
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
          FlowVision — probabilistic estimate of who is buying, who is selling, where liquidity sits, and whether the move is real or trapped. <span className="text-muted-light">Brain re-scans every 2 min. All institutional figures are <em>estimated</em>, not exact order flow.</span>
        </p>
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-sm text-muted">Building flow snapshots…</div>
      ) : snapshots.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⏸</div>
          <p className="text-sm text-muted">No flow snapshots yet — the brain&apos;s next 2-min cycle will populate this view.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {snapshots.map((s) => (
            <FlowRow
              key={s.symbol}
              snap={s}
              zones={zonesBySymbol[s.symbol] ?? []}
              expanded={expandedSymbol === s.symbol}
              onToggle={() => setExpandedSymbol(expandedSymbol === s.symbol ? null : s.symbol)}
              onOpenModal={() => setModalSnap(s)}
            />
          ))}
        </div>
      )}

      <FlowAnalysisModal snap={modalSnap} open={modalSnap !== null} onClose={() => setModalSnap(null)} />
    </div>
  );
}

function FlowRow({ snap, zones, expanded, onToggle, onOpenModal }: { snap: Snapshot; zones: Zone[]; expanded: boolean; onToggle: () => void; onOpenModal: () => void }) {
  const isBull = snap.finalBias === "bullish";
  const isBear = snap.finalBias === "bearish";
  const trapClass = snap.trapScore >= 65 ? (snap.trapType === "bull_trap" ? "text-bear-light" : "text-bull-light") : "text-muted";

  return (
    <div className="glass-card overflow-hidden">
      <div className={cn("h-1", isBull ? "bg-bull" : isBear ? "bg-bear" : "bg-muted")} />
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-base font-bold">{snap.displayName}</h3>
            <span className="text-[10px] text-muted bg-surface-2 px-2 py-0.5 rounded font-mono">{snap.timeframe}</span>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border",
              isBull ? "bg-bull/15 text-bull-light border-bull/30"
              : isBear ? "bg-bear/15 text-bear-light border-bear/30"
              : "bg-muted/15 text-muted border-muted/30",
            )}>
              {isBull ? "▲ bullish" : isBear ? "▼ bearish" : "neutral"}
            </span>
            {snap.session && <span className="text-[10px] text-muted">{snap.session}</span>}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-muted uppercase">Confidence</div>
              <div className={cn("text-xl font-bold font-mono", isBull ? "text-bull-light" : isBear ? "text-bear-light" : "text-muted")}>
                {snap.confidence}<span className="text-[10px] text-muted">/100</span>
              </div>
            </div>
            <span className="text-[10px] text-muted">{timeAgo(snap.createdAt)}</span>
          </div>
        </div>

        {/* 5 panels grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 text-[11px]">
          {/* Retail Flow */}
          <Panel title="Retail Flow" tone="warn">
            {snap.retailCrowding === "unavailable" ? (
              <div className="text-muted-light italic text-[10px]">Wire Myfxbook in Phase 2 — placeholder for now</div>
            ) : (
              <>
                <Stat label="Long" value={`${snap.retailLongPct?.toFixed(0) ?? "—"}%`} />
                <Stat label="Short" value={`${snap.retailShortPct?.toFixed(0) ?? "—"}%`} />
                <div className="text-[10px] mt-1 capitalize">{snap.retailCrowding?.replace(/_/g, " ")}</div>
              </>
            )}
          </Panel>

          {/* Institutional Flow */}
          <Panel title="Institutional Flow" tone="accent">
            <Stat label="Buy" value={`${snap.institutionalBuyScore}/100`} tone={snap.institutionalBuyScore >= 60 ? "bull" : "neutral"} />
            <Stat label="Sell" value={`${snap.institutionalSellScore}/100`} tone={snap.institutionalSellScore >= 60 ? "bear" : "neutral"} />
            <div className="text-[10px] mt-1 text-muted">~{snap.vwapPosition != null ? (snap.vwapPosition >= 0 ? "above" : "below") : "—"} VWAP</div>
            {snap.metadata?.cvdSource === "real_aggressor" && (
              <div className="mt-1.5 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-bull/15 text-bull-light border border-bull/30 inline-block">
                ✓ Real CVD · {snap.metadata.cvdTradeCount ?? "?"} trades
              </div>
            )}
          </Panel>

          {/* Liquidity Map */}
          <Panel title="Liquidity Map" tone="bull">
            <div className="text-[10px]">{zones.length} active zones</div>
            <div className="text-[10px] text-muted-light mt-0.5">{zones.filter((z) => z.zoneType === "fvg").length} FVGs</div>
            <div className="text-[10px] text-muted-light">{zones.filter((z) => z.zoneType === "order_block").length} OBs</div>
          </Panel>

          {/* Trap Detector */}
          <Panel title="Trap Detector" tone={snap.trapScore >= 65 ? "bear" : "neutral"}>
            <Stat label="Risk" value={`${snap.trapScore}/100`} tone={snap.trapScore >= 65 ? "bear" : "neutral"} />
            <div className={cn("text-[10px] mt-1 uppercase font-bold", trapClass)}>
              {snap.trapType?.replace(/_/g, " ") ?? "—"}
            </div>
          </Panel>

          {/* Prediction */}
          <Panel title="Prediction" tone={isBull ? "bull" : isBear ? "bear" : "neutral"}>
            <div className="text-[10px] text-foreground">
              Target: {snap.targetLiquidity != null ? fmt(snap.targetLiquidity, snap.decimalPlaces) : "—"}
            </div>
            <div className="text-[10px] text-warn-light">
              Invalid: {snap.invalidation != null ? fmt(snap.invalidation, snap.decimalPlaces) : "—"}
            </div>
            <div className="text-[10px] text-muted mt-1">~{Math.round(snap.expectedHoldMinutes / 60 * 10) / 10}h hold</div>
          </Panel>
        </div>

        {/* Narrative */}
        {snap.narrative && (
          <p className="text-[12px] text-foreground bg-surface-2/50 border border-border/30 rounded-lg p-3 leading-relaxed">
            <span className="text-[10px] uppercase tracking-wider text-muted block mb-1">Engine Read</span>
            {snap.narrative}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button onClick={onToggle} className="text-[11px] text-accent-light hover:text-accent transition-smooth">
            {expanded ? "▲ less" : "▼ full breakdown"}
          </button>
          <button onClick={onOpenModal} className="text-[11px] text-muted hover:text-foreground transition-smooth">
            full analysis →
          </button>
        </div>

        {expanded && (
          <div className="pt-3 border-t border-border/30 space-y-3">
            {/* Score components */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Score Components</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                <Numeric label="syntheticCVD"   value={snap.syntheticCvd?.toFixed(0) ?? "—"} />
                <Numeric label="VWAP position"  value={snap.vwapPosition?.toFixed(2) ?? "—"} />
                <Numeric label="VWAP slope"     value={snap.vwapSlope?.toFixed(6) ?? "—"} />
                <Numeric label="Volume zscore"  value={snap.volumeZScore?.toFixed(2) ?? "—"} />
                <Numeric label="OI change"      value={snap.oiChange?.toFixed(2) ?? "wire Phase 3"} />
                <Numeric label="COT net"        value={snap.cotNet?.toFixed(0) ?? "wire Phase 3"} />
              </div>
            </div>

            {/* Reasons */}
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

            {/* Liquidity zone list */}
            {zones.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Liquidity Zones (top {Math.min(10, zones.length)})</div>
                <div className="space-y-1">
                  {zones.slice(0, 10).map((z) => (
                    <div key={z.id} className="flex items-center gap-2 text-[11px]">
                      <span className={cn(
                        "text-[9px] uppercase font-bold px-1.5 py-0.5 rounded shrink-0",
                        z.direction === "bullish" ? "bg-bull/15 text-bull-light"
                        : z.direction === "bearish" ? "bg-bear/15 text-bear-light"
                        : "bg-surface-2 text-muted",
                      )}>
                        {z.zoneType.replace(/_/g, " ")}
                      </span>
                      <span className="font-mono text-muted-light">{fmt(z.priceLow, snap.decimalPlaces)} – {fmt(z.priceHigh, snap.decimalPlaces)}</span>
                      <span className="text-accent-light font-mono ml-auto shrink-0">{z.strengthScore}/100</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── tiny sub-components ───────────────────────────────────────────

function Panel({ title, tone, children }: { title: string; tone: "bull" | "bear" | "warn" | "accent" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "bull"   ? "border-bull/30 bg-bull/5"
    : tone === "bear" ? "border-bear/30 bg-bear/5"
    : tone === "warn" ? "border-warn/30 bg-warn/5"
    : tone === "accent" ? "border-accent/30 bg-accent/5"
    : "border-border/40 bg-surface-2/30";
  return (
    <div className={cn("rounded-lg border p-2", cls)}>
      <div className="text-[9px] uppercase tracking-wider text-muted mb-1">{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" | "neutral" }) {
  const cls = tone === "bull" ? "text-bull-light" : tone === "bear" ? "text-bear-light" : "text-foreground";
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted">{label}</span>
      <span className={cn("font-mono font-bold", cls)}>{value}</span>
    </div>
  );
}

function Numeric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-surface-2 border border-border/30 p-1.5 text-center">
      <div className="text-[9px] uppercase opacity-70 text-muted">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
