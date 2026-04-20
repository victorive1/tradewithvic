import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { LiveRefresh } from "@/components/dashboard/LiveRefresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function timeAgo(date: Date): string {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const BIAS_COLOR: Record<string, string> = {
  bullish: "text-bull-light",
  bearish: "text-bear-light",
  neutral: "text-muted",
};

const POSITION_COLOR: Record<string, string> = {
  above: "bg-bull/10 text-bull-light border-bull/30",
  below: "bg-bear/10 text-bear-light border-bear/30",
  at: "bg-surface-3 text-muted border-border",
};

const REGIME_COLOR: Record<string, string> = {
  trend: "bg-accent/10 text-accent-light border-accent/30",
  balanced: "bg-surface-3 text-muted border-border",
  stretched: "bg-warn/10 text-warn border-warn/30",
  mean_revert: "bg-accent/10 text-accent-light border-accent/30",
  choppy: "bg-surface-3 text-muted border-border",
};

const EVENT_COLOR: Record<string, string> = {
  reclaim: "text-bull-light",
  rejection: "text-bear-light",
  stretch_upper: "text-warn",
  stretch_lower: "text-warn",
  snapback: "text-accent-light",
};

export default async function VwapPage() {
  const renderedAt = Date.now();
  const [snapshots, events, setups] = await Promise.all([
    prisma.vwapSnapshot.findMany({
      orderBy: [{ symbol: "asc" }, { anchor: "asc" }],
      take: 200,
    }),
    prisma.vwapDeviationEvent.findMany({
      orderBy: { detectedAt: "desc" },
      take: 30,
    }),
    prisma.tradeSetup.findMany({
      where: {
        status: "active",
        setupType: { in: ["vwap_reclaim", "vwap_rejection", "vwap_stretch"] },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const daily = snapshots.filter((s) => s.anchor === "daily");
  const weekly = snapshots.filter((s) => s.anchor === "weekly");

  const bullishDaily = daily.filter((s) => s.bias === "bullish").length;
  const bearishDaily = daily.filter((s) => s.bias === "bearish").length;
  const stretchedDaily = daily.filter((s) => s.regime === "stretched").length;

  return (
    <div className="space-y-6">
      <LiveRefresh serverTimestamp={renderedAt} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">VWAP Engine</h1>
            <span className="text-[10px] bg-accent/10 text-accent-light px-2 py-1 rounded-full border border-accent/20 uppercase tracking-wider">Phase 1</span>
          </div>
          <p className="text-sm text-muted">Daily + weekly anchored VWAP with σ bands, slope, regime classification, and deviation events. Runs every 2 minutes on the Market Core Brain cycle.</p>
        </div>
        <Link href="/dashboard/brain" className="text-xs text-accent-light hover:text-accent transition-smooth">← Back to Brain</Link>
      </div>

      {/* Top status strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Snapshots</div>
          <div className="text-xl font-bold">{snapshots.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Bullish (daily)</div>
          <div className="text-xl font-bold text-bull-light">{bullishDaily}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Bearish (daily)</div>
          <div className="text-xl font-bold text-bear-light">{bearishDaily}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Stretched</div>
          <div className="text-xl font-bold text-warn">{stretchedDaily}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Active Setups</div>
          <div className="text-xl font-bold text-accent-light">{setups.length}</div>
        </div>
      </div>

      {/* Daily anchored VWAP — primary table */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Daily Anchored VWAP</h3>
          <span className="text-[10px] text-muted">15min base · resets 00:00 UTC</span>
        </div>
        {daily.length === 0 ? (
          <p className="text-xs text-muted py-4 text-center">No daily VWAP snapshots yet — next scan cycle will populate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border/30">
                  <th className="text-left py-2 pr-3">Symbol</th>
                  <th className="text-right py-2 px-3">Price</th>
                  <th className="text-right py-2 px-3">VWAP</th>
                  <th className="text-right py-2 px-3">Dev %</th>
                  <th className="text-right py-2 px-3">z</th>
                  <th className="text-center py-2 px-3">Pos</th>
                  <th className="text-center py-2 px-3">Slope</th>
                  <th className="text-center py-2 px-3">Bias</th>
                  <th className="text-center py-2 px-3">Regime</th>
                  <th className="text-right py-2 pl-3">Vol</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((s) => (
                  <tr key={s.id} className="border-b border-border/20 hover:bg-surface-2/50">
                    <td className="py-2 pr-3 font-semibold text-foreground">{s.symbol}</td>
                    <td className="py-2 px-3 text-right font-mono">{s.lastClose.toFixed(5)}</td>
                    <td className="py-2 px-3 text-right font-mono">{s.vwap.toFixed(5)}</td>
                    <td className={`py-2 px-3 text-right font-mono ${s.deviationPct > 0 ? "text-bull-light" : s.deviationPct < 0 ? "text-bear-light" : "text-muted"}`}>
                      {s.deviationPct > 0 ? "+" : ""}{s.deviationPct.toFixed(2)}%
                    </td>
                    <td className={`py-2 px-3 text-right font-mono ${Math.abs(s.zScore) >= 2 ? "text-warn" : "text-muted"}`}>
                      {s.zScore.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wider border ${POSITION_COLOR[s.position] ?? "bg-surface-3 text-muted border-border"}`}>
                        {s.position}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-[11px]">
                      {s.slopeState === "rising" ? "↗" : s.slopeState === "falling" ? "↘" : "→"}
                    </td>
                    <td className={`py-2 px-3 text-center font-semibold ${BIAS_COLOR[s.bias] ?? "text-muted"}`}>
                      {s.bias}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wider border ${REGIME_COLOR[s.regime] ?? "bg-surface-3 text-muted border-border"}`}>
                        {s.regime === "mean_revert" ? "mean rev" : s.regime}
                      </span>
                    </td>
                    <td className="py-2 pl-3 text-right text-[10px] text-muted">
                      {s.volumeQuality === "synthetic" ? "syn" : s.volumeQuality === "degraded" ? "deg" : "ok"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-muted mt-3 italic">
          Spot FX volume is proxied via liquid NYSE-listed ETFs (FXE, FXB, FXY, FXA, FXC, FXF) and
          commodity ETFs (GLD, SLV) — real institutional flow during 13:30–20:00 UTC. Bars outside
          those hours or without a proxy mapping degrade to time-weighted averaging (&quot;deg&quot;/&quot;syn&quot;).
        </p>
      </div>

      {/* Weekly anchored VWAP — secondary table */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Weekly Anchored VWAP</h3>
          <span className="text-[10px] text-muted">1h base · resets Sun 22:00 UTC</span>
        </div>
        {weekly.length === 0 ? (
          <p className="text-xs text-muted py-4 text-center">No weekly VWAP snapshots yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border/30">
                  <th className="text-left py-2 pr-3">Symbol</th>
                  <th className="text-right py-2 px-3">Price</th>
                  <th className="text-right py-2 px-3">VWAP</th>
                  <th className="text-right py-2 px-3">Dev %</th>
                  <th className="text-right py-2 px-3">z</th>
                  <th className="text-center py-2 px-3">Bias</th>
                  <th className="text-center py-2 pl-3">Regime</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((s) => (
                  <tr key={s.id} className="border-b border-border/20 hover:bg-surface-2/50">
                    <td className="py-2 pr-3 font-semibold text-foreground">{s.symbol}</td>
                    <td className="py-2 px-3 text-right font-mono">{s.lastClose.toFixed(5)}</td>
                    <td className="py-2 px-3 text-right font-mono">{s.vwap.toFixed(5)}</td>
                    <td className={`py-2 px-3 text-right font-mono ${s.deviationPct > 0 ? "text-bull-light" : s.deviationPct < 0 ? "text-bear-light" : "text-muted"}`}>
                      {s.deviationPct > 0 ? "+" : ""}{s.deviationPct.toFixed(2)}%
                    </td>
                    <td className={`py-2 px-3 text-right font-mono ${Math.abs(s.zScore) >= 2 ? "text-warn" : "text-muted"}`}>
                      {s.zScore.toFixed(2)}
                    </td>
                    <td className={`py-2 px-3 text-center font-semibold ${BIAS_COLOR[s.bias] ?? "text-muted"}`}>
                      {s.bias}
                    </td>
                    <td className="py-2 pl-3 text-center">
                      <span className={`px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wider border ${REGIME_COLOR[s.regime] ?? "bg-surface-3 text-muted border-border"}`}>
                        {s.regime === "mean_revert" ? "mean rev" : s.regime}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* VWAP Trade Setups — tradeable signals emitted on reclaim, rejection,
          and band-stretch transitions. These flow through the Brain's
          confluence + execution pipeline just like breakout / pullback
          setups. */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Active VWAP Setups</h3>
          <span className="text-[10px] text-muted">Reclaim · Rejection · Stretch fade</span>
        </div>
        {setups.length === 0 ? (
          <p className="text-xs text-muted py-4 text-center">
            No active VWAP setups right now. Next reclaim / rejection / stretch transition will emit one here
            and through the Brain&apos;s confluence + execution pipeline.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border/30">
                  <th className="text-left py-2 pr-3">Symbol</th>
                  <th className="text-left py-2 px-3">Setup</th>
                  <th className="text-center py-2 px-3">Dir</th>
                  <th className="text-right py-2 px-3">Entry</th>
                  <th className="text-right py-2 px-3">SL</th>
                  <th className="text-right py-2 px-3">TP1</th>
                  <th className="text-right py-2 px-3">R:R</th>
                  <th className="text-center py-2 px-3">Score</th>
                  <th className="text-center py-2 px-3">Grade</th>
                  <th className="text-right py-2 pl-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {setups.map((s) => {
                  const label = s.setupType === "vwap_reclaim" ? "Reclaim"
                    : s.setupType === "vwap_rejection" ? "Rejection"
                    : "Stretch";
                  return (
                    <tr key={s.id} className="border-b border-border/20 hover:bg-surface-2/50">
                      <td className="py-2 pr-3 font-semibold text-foreground">{s.symbol}</td>
                      <td className="py-2 px-3 text-muted">{label} · {s.timeframe}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wider border ${s.direction === "long" ? "bg-bull/10 text-bull-light border-bull/30" : "bg-bear/10 text-bear-light border-bear/30"}`}>
                          {s.direction}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{s.entry.toFixed(5)}</td>
                      <td className="py-2 px-3 text-right font-mono text-bear-light">{s.stopLoss.toFixed(5)}</td>
                      <td className="py-2 px-3 text-right font-mono text-bull-light">{s.takeProfit1.toFixed(5)}</td>
                      <td className="py-2 px-3 text-right font-mono">{s.riskReward.toFixed(2)}</td>
                      <td className="py-2 px-3 text-center font-semibold">{s.confidenceScore}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wider border ${
                          s.qualityGrade === "A+" ? "bg-bull/20 text-bull-light border-bull/40"
                            : s.qualityGrade === "A" ? "bg-bull/10 text-bull-light border-bull/30"
                            : s.qualityGrade === "B" ? "bg-accent/10 text-accent-light border-accent/30"
                            : "bg-surface-3 text-muted border-border"
                        }`}>
                          {s.qualityGrade}
                        </span>
                      </td>
                      <td className="py-2 pl-3 text-right text-[10px] text-muted">{timeAgo(s.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent deviation events */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Recent Deviation Events</h3>
        {events.length === 0 ? (
          <p className="text-xs text-muted py-4 text-center">No events detected yet — triggered on reclaim, rejection, stretch, or snapback transitions.</p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between bg-surface-2 rounded-xl p-3 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">{e.symbol}</span>
                    <span className="text-[10px] text-muted">{e.anchor} · {e.timeframe}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${EVENT_COLOR[e.eventType] ?? "text-muted"}`}>
                      {e.eventType.replace("_", " ")}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted">
                    price {e.price.toFixed(5)} · vwap {e.vwapAtEvent.toFixed(5)} · z {e.zScoreAtEvent.toFixed(2)}
                    {e.reason && <> · {e.reason}</>}
                  </div>
                </div>
                <div className="text-[10px] text-muted shrink-0">{timeAgo(e.detectedAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
