import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LiveRefresh } from "@/components/dashboard/LiveRefresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export default async function ReplayPage() {
  const renderedAt = Date.now();
  const sessions = await prisma.replaySession.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Simulation & Replay</h1>
          <p className="text-sm text-muted mt-1">
            Re-score historical decisions against alternative weight configurations to preview upgrades safely
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveRefresh serverTimestamp={renderedAt} />
          <Link href="/dashboard/brain" className="text-sm text-muted hover:text-foreground underline underline-offset-4">← Brain</Link>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-2">How replay works</h2>
        <p className="text-xs text-muted">
          Each replay reads SetupDecisionLog rows within a window and re-applies a weighted sum of each decision's feature vector using alternate weights.
          It compares grade distribution (A+/A/candidate/watch/ignore), average score, and hypothetical win rate against the baseline.
          Trigger a run via <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded">POST /api/brain/replay</code> with Bearer ADMIN_REFRESH_SECRET. Body accepts optional
          <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded ml-1">windowStart</code>, <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded">windowEnd</code>,
          <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded ml-1">weightsOverride</code> (e.g. <code>{`{ "liquidityBehavior": 1.2, "volatilityQuality": 0.5 }`}</code>), and <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded">label</code>.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Recent Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">No replay sessions yet.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const baseline = parseJson<any>(s.baselineMetricsJson, {});
              const simulated = parseJson<any>(s.simulatedMetricsJson, {});
              const delta = parseJson<any>(s.deltaJson, {});
              const weights = parseJson<Record<string, number>>(s.weightsOverrideJson, {});
              return (
                <div key={s.id} className="rounded-lg border border-border/60 p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                    <div>
                      <div className="font-semibold">{s.label}</div>
                      <div className="text-xs text-muted font-mono">
                        {fmtDate(s.windowStart)} → {fmtDate(s.windowEnd)} · {s.decisionCount} decisions
                      </div>
                    </div>
                    {Object.keys(weights).length > 0 && (
                      <div className="text-xs text-muted font-mono">
                        Weights: {Object.entries(weights).map(([k, v]) => `${k}×${v}`).join(" ")}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="rounded border border-border/40 p-2">
                      <div className="text-muted uppercase">Avg Score</div>
                      <div className="font-mono text-sm">
                        {baseline.avgScore?.toFixed(1) ?? "—"} → {simulated.avgScore?.toFixed(1) ?? "—"}
                      </div>
                      <div className={`text-[10px] ${delta.avgScoreDelta > 0 ? "text-green-400" : delta.avgScoreDelta < 0 ? "text-red-400" : "text-muted"}`}>
                        Δ {delta.avgScoreDelta?.toFixed(2) ?? "0"}
                      </div>
                    </div>
                    <div className="rounded border border-border/40 p-2">
                      <div className="text-muted uppercase">A+ Count</div>
                      <div className="font-mono text-sm">
                        {baseline.aPlus ?? 0} → {simulated.aPlus ?? 0}
                      </div>
                      <div className={`text-[10px] ${(delta.aPlusDelta ?? 0) > 0 ? "text-green-400" : (delta.aPlusDelta ?? 0) < 0 ? "text-red-400" : "text-muted"}`}>
                        Δ {delta.aPlusDelta ?? 0}
                      </div>
                    </div>
                    <div className="rounded border border-border/40 p-2">
                      <div className="text-muted uppercase">A Count</div>
                      <div className="font-mono text-sm">
                        {baseline.a ?? 0} → {simulated.a ?? 0}
                      </div>
                      <div className={`text-[10px] ${(delta.aDelta ?? 0) > 0 ? "text-green-400" : (delta.aDelta ?? 0) < 0 ? "text-red-400" : "text-muted"}`}>
                        Δ {delta.aDelta ?? 0}
                      </div>
                    </div>
                    <div className="rounded border border-border/40 p-2">
                      <div className="text-muted uppercase">Win Rate</div>
                      <div className="font-mono text-sm">
                        {((baseline.winRate ?? 0) * 100).toFixed(0)}% → {((simulated.winRate ?? 0) * 100).toFixed(0)}%
                      </div>
                      <div className={`text-[10px] ${(delta.winRateDelta ?? 0) > 0 ? "text-green-400" : (delta.winRateDelta ?? 0) < 0 ? "text-red-400" : "text-muted"}`}>
                        Δ {((delta.winRateDelta ?? 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  {s.notes && <p className="mt-2 text-xs text-muted">{s.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
