import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { probeEngine } from "@/lib/agent/probes";
import { type ProbeStatus, formatAgoSeconds } from "@/lib/agent/types";
import { FixButton } from "../FixButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function statusDot(status: ProbeStatus): string {
  return status === "healthy" ? "bg-bull"
    : status === "warning" ? "bg-warn"
    : status === "critical" ? "bg-bear"
    : "bg-muted";
}
function statusBadge(status: ProbeStatus): string {
  return status === "healthy" ? "bg-bull/10 text-bull-light border-bull/30"
    : status === "warning" ? "bg-warn/10 text-warn border-warn/40"
    : status === "critical" ? "bg-bear/10 text-bear-light border-bear/40"
    : "bg-surface-3 text-muted border-border";
}

export default async function EngineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const engine = await probeEngine(id);
  if (!engine) notFound();

  const remediationHistory = await prisma.agentRemediationLog.findMany({
    where: { engineId: id },
    orderBy: { requestedAt: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/dashboard/agent" className="hover:text-foreground">Agent</Link>
        <span>/</span>
        <span className="text-foreground">{engine.label}</span>
      </div>

      <div className="glass-card p-5 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              {engine.label}
              <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${statusBadge(engine.status)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(engine.status)}`} />
                {engine.status}
              </span>
            </h1>
            <p className="text-xs text-muted mt-1">{engine.summary}</p>
          </div>
          <Link
            href={engine.route}
            className="px-3 py-1.5 rounded-lg bg-surface-2 text-xs font-medium border border-border/50 hover:border-border-light transition-smooth"
          >
            Open {engine.label} →
          </Link>
        </div>
        <div className="text-sm text-foreground">{engine.statusMessage}</div>
        {engine.note && <div className="text-[11px] text-muted italic">{engine.note}</div>}
      </div>

      {/* Probes */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">Health Checks</h2>
        <div className="space-y-2">
          {engine.probes.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-surface-2/40 border border-border/40">
              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(p.status)}`} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="text-xs text-muted-light">{p.message}</div>
                  {p.detail && <div className="text-[11px] text-muted mt-1">{p.detail}</div>}
                  {p.expected && (
                    <div className="text-[10px] text-muted mt-1 font-mono">threshold · {p.expected}</div>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                {p.value != null && (
                  <div className="text-right">
                    <div className="text-[10px] text-muted uppercase">Value</div>
                    <div className="text-sm font-mono font-semibold">{String(p.value)}</div>
                  </div>
                )}
                {p.remediationId && p.remediationLabel && (
                  <FixButton
                    engineId={engine.id}
                    recipeId={p.remediationId}
                    label={p.remediationLabel}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Data sources */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">Data Sources</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border/40">
                <th className="text-left py-2 pr-3">Table</th>
                <th className="text-left px-2">Description</th>
                <th className="text-right px-2">Rows</th>
                <th className="text-right px-2">Last updated</th>
                <th className="text-right pl-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {engine.dataSources.map((d) => {
                const age = d.lastUpdatedAt ? Math.round((Date.now() - new Date(d.lastUpdatedAt).getTime()) / 1000) : null;
                return (
                  <tr key={d.tableName} className="border-b border-border/20 last:border-0">
                    <td className="py-2 pr-3 font-mono">{d.tableName}</td>
                    <td className="px-2">
                      {d.label}
                      {d.note && <div className="text-[10px] text-muted italic">{d.note}</div>}
                    </td>
                    <td className="text-right px-2 font-mono tabular-nums">{d.rowCount.toLocaleString()}</td>
                    <td className="text-right px-2 font-mono text-muted-light">{formatAgoSeconds(age)}</td>
                    <td className="text-right pl-2">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wider ${statusBadge(d.status)}`}>
                        {d.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dependencies */}
      {engine.dependencies.length > 0 && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">Dependencies</h2>
          <div className="space-y-2">
            {engine.dependencies.map((d) => (
              <Link
                key={d.engineId}
                href={`/dashboard/agent/${d.engineId}`}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-2/40 border border-border/40 hover:border-border-light transition-smooth"
              >
                <div>
                  <div className="text-sm font-semibold">{d.label}</div>
                  <div className="text-[11px] text-muted-light">{d.statusMessage || "—"}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${statusBadge(d.status)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDot(d.status)}`} />
                  {d.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent errors */}
      {engine.recentErrors.length > 0 && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">
            Recent Errors
            <span className="ml-2 text-[10px] font-normal text-muted normal-case">· {engine.recentErrors.length} shown</span>
          </h2>
          <div className="space-y-1.5">
            {engine.recentErrors.map((err, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-bear/5 border border-bear/20 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-bear/15 text-bear-light font-mono font-bold shrink-0">{err.code}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] text-muted-light">{err.source} · {formatAgoSeconds(Math.round((Date.now() - new Date(err.at).getTime()) / 1000))}</div>
                  <div className="text-bear-light break-words">{err.message}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Remediation history */}
      {remediationHistory.length > 0 && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">
            Remediation History
            <span className="ml-2 text-[10px] font-normal text-muted normal-case">· {remediationHistory.length} shown</span>
          </h2>
          <div className="space-y-1.5">
            {remediationHistory.map((r) => {
              const age = Math.round((Date.now() - r.requestedAt.getTime()) / 1000);
              return (
                <div
                  key={r.id}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs ${
                    r.success ? "bg-bull/5 border-bull/20" : r.completedAt ? "bg-bear/5 border-bear/20" : "bg-warn/5 border-warn/20"
                  }`}
                >
                  <span className={`px-1.5 py-0.5 rounded font-mono font-bold shrink-0 text-[10px] ${
                    r.success ? "bg-bull/15 text-bull-light" : r.completedAt ? "bg-bear/15 text-bear-light" : "bg-warn/15 text-warn"
                  }`}>
                    {r.success ? "✓" : r.completedAt ? "✗" : "…"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[11px] text-muted-light">
                      {r.recipeId} · {formatAgoSeconds(age)}
                      {r.durationMs != null && ` · ${r.durationMs}ms`}
                    </div>
                    <div className="break-words">{r.summary}</div>
                    {r.error && <div className="text-bear-light break-words font-mono text-[11px] mt-0.5">{r.error}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
