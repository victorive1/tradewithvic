import Link from "next/link";
import { runAllEngineProbes } from "@/lib/agent/probes";
import { type ProbeStatus, formatAgoSeconds } from "@/lib/agent/types";

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

export default async function AgentPage() {
  const engines = await runAllEngineProbes();
  const overall: ProbeStatus = engines.some((e) => e.status === "critical") ? "critical"
    : engines.some((e) => e.status === "warning") ? "warning"
    : engines.every((e) => e.status === "healthy") ? "healthy"
    : "unknown";

  const counts = {
    healthy: engines.filter((e) => e.status === "healthy").length,
    warning: engines.filter((e) => e.status === "warning").length,
    critical: engines.filter((e) => e.status === "critical").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agent</h1>
          <p className="text-sm text-muted mt-1">
            Live diagnostics for every engine on the platform. Drill into any card to see probes, data sources, dependencies, and recent errors.
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${statusBadge(overall)}`}>
          <span className={`w-2 h-2 rounded-full ${statusDot(overall)}`} />
          <span className="text-xs font-semibold uppercase tracking-wider">
            {overall === "healthy" ? "All systems healthy"
              : overall === "warning" ? `${counts.warning} warning`
              : overall === "critical" ? `${counts.critical} critical · ${counts.warning} warning`
              : "Unknown"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {engines.map((e) => {
          const age = e.lastUpdatedAt ? Math.round((Date.now() - new Date(e.lastUpdatedAt).getTime()) / 1000) : null;
          return (
            <Link
              key={e.id}
              href={`/dashboard/agent/${e.id}`}
              className="glass-card glass-card-hover p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{e.label}</h3>
                  <p className="text-[11px] text-muted mt-0.5 line-clamp-2">{e.summary}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${statusBadge(e.status)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDot(e.status)}`} />
                  {e.status}
                </span>
              </div>
              <div className="text-xs text-muted-light">{e.statusMessage}</div>
              <div className="flex items-center justify-between text-[10px] text-muted pt-2 border-t border-border/30">
                <span>Last update · {formatAgoSeconds(age)}</span>
                <span>{e.probes.length} probe{e.probes.length === 1 ? "" : "s"}</span>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-[11px] text-muted italic">
        This page is read-only. Use it to diagnose issues — remediation is still manual. Deep-link into any engine with <code className="font-mono">/dashboard/agent/&#123;id&#125;</code>.
      </p>
    </div>
  );
}
