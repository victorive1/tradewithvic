"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ExplainPayload {
  signal: any;
  drivers: string[];
  evidence: any;
  context: {
    structureEvents: any[];
    liquidityEvents: any[];
    flowTimeline: any[];
  };
}

export default function SignalExplainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ExplainPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/iflow/signals/${id}/explain`, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page-container"><div className="glass-card p-12 text-center text-muted">Loading signal…</div></div>;
  if (!data) return <div className="page-container"><div className="glass-card p-12 text-center text-muted">Signal not found.</div></div>;

  const s = data.signal;
  const isLong = s.direction === "long";

  const components = [
    { key: "Flow Quality", value: s.flowQuality, max: 20, desc: "Aggression, absorption, sweeps, refill" },
    { key: "Derivatives", value: s.derivativesScore, max: 15, desc: "Options/futures evidence" },
    { key: "Cross-Asset", value: s.crossAssetScore, max: 15, desc: "Correlated markets agreement" },
    { key: "Venue", value: s.venueScore, max: 10, desc: "Execution venue and routing patterns" },
    { key: "Catalyst", value: s.catalystScore, max: 10, desc: "Fit with active news / macro event" },
    { key: "Persistence", value: s.persistenceScore, max: 15, desc: "Probability pressure continues" },
    { key: "Positioning", value: s.positioningScore, max: 10, desc: "Backdrop from COT / 13F / ETF flows" },
    { key: "Regime", value: s.regimeScore, max: 5, desc: "Trend / volatility / liquidity fit" },
  ];

  return (
    <div className="page-container space-y-5 max-w-4xl">
      <header>
        <Link href="/dashboard/institutional-flow" className="text-xs text-muted hover:text-foreground">← All institutional signals</Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <h1 className="text-fluid-3xl font-bold font-mono">{s.assetSymbol}</h1>
          <span className={cn("text-[11px] px-2 py-0.5 rounded-md font-bold border",
            isLong ? "border-bull/40 bg-bull/10 text-bull-light"
            : s.direction === "short" ? "border-bear/40 bg-bear/10 text-bear-light"
            : "border-border bg-surface-2 text-muted-light")}>
            {isLong ? "▲ LONG" : s.direction === "short" ? "▼ SHORT" : "NEUTRAL"}
          </span>
          <span className="text-[11px] text-muted uppercase tracking-wider">{s.classification}</span>
          <span className={cn("text-[11px] px-2 py-0.5 rounded-md border font-bold ml-auto",
            s.confidenceGrade === "A+" ? "border-bull/40 text-bull-light bg-bull/10"
            : s.confidenceGrade === "A" ? "border-accent/40 text-accent-light bg-accent/10"
            : s.confidenceGrade === "B" ? "border-warn/40 text-warn bg-warn/10"
            : "border-border text-muted bg-surface-2")}>
            {s.confidenceGrade}
          </span>
        </div>
      </header>

      <section className="glass-card p-5 space-y-4">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Institutional Intent Score</div>
            <div className="text-5xl font-bold font-mono tabular-nums mt-1">{s.intentScore.toFixed(0)}<span className="text-lg text-muted font-normal"> /100</span></div>
          </div>
          <div className="text-right text-xs space-y-0.5">
            {s.defendedLevel != null && <div>Defended level · <span className="font-mono font-semibold">{s.defendedLevel.toFixed(4)}</span></div>}
            {s.invalidationLevel != null && <div>Invalidation · <span className="font-mono text-bear-light font-semibold">{s.invalidationLevel.toFixed(4)}</span></div>}
            {s.persistenceProb != null && <div>Persistence · <span className="font-mono text-accent-light font-semibold">{(s.persistenceProb * 100).toFixed(0)}%</span></div>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {components.map((c) => {
            const pct = c.value / c.max;
            return (
              <div key={c.key} className="bg-surface-2/50 border border-border/40 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-foreground">{c.key}</span>
                  <span className={cn("text-sm font-mono font-bold tabular-nums",
                    pct >= 0.7 ? "text-bull-light" : pct >= 0.4 ? "text-accent-light" : c.value === 0 ? "text-muted" : "text-warn")}>
                    {c.value.toFixed(0)}<span className="text-[10px] text-muted">/{c.max}</span>
                  </span>
                </div>
                <div className="h-1 rounded-full bg-surface-3/80 overflow-hidden mb-1">
                  <div className={cn("h-full transition-all",
                    pct >= 0.7 ? "bg-bull" : pct >= 0.4 ? "bg-accent-light" : c.value === 0 ? "bg-muted/40" : "bg-warn")}
                    style={{ width: `${Math.max(3, pct * 100)}%` }} />
                </div>
                <div className="text-[10px] text-muted">{c.desc}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass-card p-5 space-y-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Drivers · why this signal fired</h2>
        {data.drivers.length === 0 ? (
          <p className="text-xs text-muted italic">No explanatory drivers attached.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-muted-light">
            {data.drivers.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-accent-light shrink-0 mt-0.5">·</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(data.context.structureEvents.length > 0 || data.context.liquidityEvents.length > 0) && (
        <section className="glass-card p-5 space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Context near the signal</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Structure events</div>
              {data.context.structureEvents.length === 0 ? (
                <p className="text-muted italic text-[11px]">None in the window.</p>
              ) : (
                <ul className="space-y-1">
                  {data.context.structureEvents.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted w-16 shrink-0">{e.timeframe}</span>
                      <span className={cn(e.eventType.includes("bullish") ? "text-bull-light" : "text-bear-light")}>{e.eventType}</span>
                      <span className="font-mono text-muted-light ml-auto">{e.priceLevel.toFixed(4)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Liquidity sweeps</div>
              {data.context.liquidityEvents.length === 0 ? (
                <p className="text-muted italic text-[11px]">None in the window.</p>
              ) : (
                <ul className="space-y-1">
                  {data.context.liquidityEvents.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted w-16 shrink-0">{e.levelType}</span>
                      <span className={cn(e.sweepDirection === "bullish_sweep" ? "text-bull-light" : "text-bear-light")}>{e.sweepDirection.replace("_", " ")}</span>
                      <span className="font-mono text-muted-light ml-auto">{e.levelPrice.toFixed(4)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {data.evidence?.flow && (
        <section className="glass-card p-5 space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Evidence snapshot at capture time</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <KV label="Aggressor ratio" value={data.evidence.flow.aggressorRatio?.toFixed(2) ?? "—"} />
            <KV label="Sweeps (60m)" value={String(data.evidence.flow.sweepCount ?? 0)} />
            <KV label="Absorption" value={String(Math.round(data.evidence.flow.absorptionScore ?? 0))} />
            <KV label="Refill" value={String(Math.round(data.evidence.flow.refillScore ?? 0))} />
            <KV label="Notional vs median" value={data.evidence.flow.rawNotional != null ? `${data.evidence.flow.rawNotional.toFixed(2)}×` : "—"} />
            <KV label="VWAP distance" value={data.evidence.flow.vwapDistance != null ? `${data.evidence.flow.vwapDistance.toFixed(2)}%` : "—"} />
          </div>
        </section>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-muted uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 font-mono">{value}</div>
    </div>
  );
}
