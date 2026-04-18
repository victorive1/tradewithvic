import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LiveRefresh } from "@/components/dashboard/LiveRefresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Agg {
  count: number;
  wins: number;
  losses: number;
  neutral: number;
  triggered: number;
  slHits: number;
  tp1Hits: number;
  tp2Hits: number;
  tp3Hits: number;
}

function newAgg(): Agg {
  return { count: 0, wins: 0, losses: 0, neutral: 0, triggered: 0, slHits: 0, tp1Hits: 0, tp2Hits: 0, tp3Hits: 0 };
}

function classifyFromOutcome(oc: string): "win" | "loss" | "neutral" {
  if (oc === "excellent" || oc === "good") return "win";
  if (oc === "poor" || oc === "invalid") return "loss";
  return "neutral";
}

function timeAgo(date: Date): string {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function AggRow({ label, agg }: { label: string; agg: Agg }) {
  const winRate = agg.count > 0 ? (agg.wins / agg.count) * 100 : 0;
  const winRateClass = winRate >= 60 ? "text-green-400" : winRate >= 45 ? "text-yellow-400" : winRate > 0 ? "text-red-400" : "text-muted";
  return (
    <tr className="border-b border-border/20 last:border-0">
      <td className="py-2 pr-3 font-mono">{label}</td>
      <td className="text-right px-2">{agg.count}</td>
      <td className={`text-right px-2 font-semibold ${winRateClass}`}>
        {agg.count > 0 ? `${winRate.toFixed(0)}%` : "—"}
      </td>
      <td className="text-right px-2 text-green-400">{agg.wins}</td>
      <td className="text-right px-2 text-red-400">{agg.losses}</td>
      <td className="text-right px-2 text-muted">{agg.neutral}</td>
      <td className="text-right px-2 text-muted">{agg.tp1Hits}/{agg.tp2Hits}/{agg.tp3Hits}</td>
      <td className="text-right pl-2 text-muted">{agg.slHits}</td>
    </tr>
  );
}

export default async function BrainPerformancePage() {
  const renderedAt = Date.now();
  const thirtyDaysAgo = new Date(renderedAt - 30 * 86400_000);

  const [labeledLogs, recentLabeled, latestReport] = await Promise.all([
    prisma.setupDecisionLog.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        outcomes: { some: {} },
      },
      include: { outcomes: true },
    }),
    prisma.setupOutcome.findMany({
      orderBy: { labeledAt: "desc" },
      take: 20,
      include: { setupDecisionLog: true },
    }),
    prisma.dailyLearningReport.findFirst({ orderBy: { reportDate: "desc" } }),
  ]);

  const bump = (m: Agg, outcome: any) => {
    m.count++;
    const cls = classifyFromOutcome(outcome.outcomeClass);
    if (cls === "win") m.wins++;
    else if (cls === "loss") m.losses++;
    else m.neutral++;
    if (outcome.triggered) m.triggered++;
    if (outcome.slHit) m.slHits++;
    if (outcome.tp1Hit) m.tp1Hits++;
    if (outcome.tp2Hit) m.tp2Hits++;
    if (outcome.tp3Hit) m.tp3Hits++;
  };

  const overall = newAgg();
  const byStrategy: Record<string, Agg> = {};
  const bySymbol: Record<string, Agg> = {};
  const byTimeframe: Record<string, Agg> = {};
  const bySession: Record<string, Agg> = {};
  const byGrade: Record<string, Agg> = {};

  for (const log of labeledLogs) {
    const outcome = log.outcomes[0];
    if (!outcome) continue;
    bump(overall, outcome);
    byStrategy[log.setupType] ??= newAgg(); bump(byStrategy[log.setupType], outcome);
    bySymbol[log.symbol] ??= newAgg(); bump(bySymbol[log.symbol], outcome);
    byTimeframe[log.timeframe] ??= newAgg(); bump(byTimeframe[log.timeframe], outcome);
    bySession[log.session] ??= newAgg(); bump(bySession[log.session], outcome);
    byGrade[log.qualityLabel] ??= newAgg(); bump(byGrade[log.qualityLabel], outcome);
  }

  const overallWinRate = overall.count > 0 ? (overall.wins / overall.count) * 100 : 0;
  const recommendations = latestReport?.recommendationsJson ? JSON.parse(latestReport.recommendationsJson) : [];
  const topFeatures = latestReport?.candidateMetricsJson
    ? (JSON.parse(latestReport.candidateMetricsJson).featureImportance ?? []).slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Brain Performance</h1>
          <p className="text-sm text-muted mt-1">
            Setup outcomes, win rates, and learning signal · 30-day window
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveRefresh serverTimestamp={renderedAt} />
          <Link
            href="/dashboard/brain"
            className="text-sm text-muted hover:text-foreground underline underline-offset-4"
          >
            ← Back to Brain
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted uppercase tracking-wide">Total Labeled</div>
          <div className="text-2xl font-bold mt-1">{overall.count}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted uppercase tracking-wide">Overall Win Rate</div>
          <div className={`text-2xl font-bold mt-1 ${overallWinRate >= 60 ? "text-green-400" : overallWinRate >= 45 ? "text-yellow-400" : overallWinRate > 0 ? "text-red-400" : ""}`}>
            {overall.count > 0 ? `${overallWinRate.toFixed(0)}%` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted uppercase tracking-wide">Trigger Rate</div>
          <div className="text-2xl font-bold mt-1">
            {overall.count > 0 ? `${((overall.triggered / overall.count) * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted uppercase tracking-wide">TP1 / TP2 / TP3</div>
          <div className="text-xl font-semibold mt-1 font-mono">
            {overall.tp1Hits}/{overall.tp2Hits}/{overall.tp3Hits}
          </div>
        </div>
      </div>

      {(["byStrategy", "bySymbol", "byTimeframe", "bySession", "byGrade"] as const).map((dim) => {
        const map: Record<string, Agg> = (
          dim === "byStrategy" ? byStrategy
          : dim === "bySymbol" ? bySymbol
          : dim === "byTimeframe" ? byTimeframe
          : dim === "bySession" ? bySession
          : byGrade
        );
        const label = dim === "byStrategy" ? "By Strategy" : dim === "bySymbol" ? "By Symbol" : dim === "byTimeframe" ? "By Timeframe" : dim === "bySession" ? "By Session" : "By Grade";
        const entries = Object.entries(map).sort((a, b) => b[1].count - a[1].count);

        return (
          <section key={dim} className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">{label}</h2>
            {entries.length === 0 ? (
              <p className="text-sm text-muted">Nothing labeled yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted border-b border-border/40">
                      <th className="text-left py-2 pr-3">Group</th>
                      <th className="text-right px-2">N</th>
                      <th className="text-right px-2">Win%</th>
                      <th className="text-right px-2">Wins</th>
                      <th className="text-right px-2">Losses</th>
                      <th className="text-right px-2">Neutral</th>
                      <th className="text-right px-2">TP1/2/3</th>
                      <th className="text-right pl-2">SL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(([k, v]) => <AggRow key={k} label={k} agg={v} />)}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
          Recent Labeled Outcomes
        </h2>
        {recentLabeled.length === 0 ? (
          <p className="text-sm text-muted">No outcomes labeled yet. Active setups will populate once price action confirms or invalidates them.</p>
        ) : (
          <div className="space-y-1.5">
            {recentLabeled.map((o) => {
              const cls = classifyFromOutcome(o.outcomeClass);
              const color = cls === "win" ? "text-green-400" : cls === "loss" ? "text-red-400" : "text-muted";
              const log = o.setupDecisionLog;
              return (
                <div key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`uppercase font-bold ${color}`}>{o.outcomeClass}</span>
                    <span className="font-mono">{log.symbol} · {log.timeframe}</span>
                    <span className="text-muted uppercase">{log.direction}</span>
                    <span className="text-muted">{log.setupType.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex gap-3 text-muted">
                    {o.tp3Hit ? <span className="text-green-400">TP3</span> : o.tp2Hit ? <span className="text-green-400">TP2</span> : o.tp1Hit ? <span className="text-green-400">TP1</span> : null}
                    {o.slHit && <span className="text-red-400">SL</span>}
                    <span>{timeAgo(o.labeledAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Feature Importance (latest report)
          </h2>
          {topFeatures.length === 0 ? (
            <p className="text-sm text-muted">No learning report yet. Runs daily at 02:00 UTC.</p>
          ) : (
            <div className="space-y-2">
              {topFeatures.map((f: any) => (
                <div key={f.feature} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                  <span className="font-mono">{f.feature}</span>
                  <span className="flex gap-3 text-muted">
                    <span>win μ {f.winMean.toFixed(2)}</span>
                    <span>loss μ {f.lossMean.toFixed(2)}</span>
                    <span className={f.delta > 0 ? "text-green-400" : f.delta < 0 ? "text-red-400" : ""}>
                      Δ {f.delta.toFixed(2)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Learning Recommendations
          </h2>
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted">No active recommendations.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {recommendations.map((r: any, i: number) => (
                <li key={i} className="border-l-2 border-accent/50 pl-3 py-1">
                  <div className="uppercase font-semibold text-accent">{r.type.replace(/_/g, " ")}</div>
                  <div className="text-muted mt-0.5">{r.message}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
