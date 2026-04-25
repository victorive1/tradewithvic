"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ComponentHealth {
  name: string;
  status: "healthy" | "warning" | "degraded" | "down";
  detail: string;
  lastUpdatedAt: string | null;
}

interface OpenAlert {
  id: string;
  level: string;
  category: string;
  title: string;
  message: string;
  createdAt: string;
}

interface HealthPayload {
  overall: ComponentHealth["status"];
  tradingPermission: "allowed" | "reduced_risk_only" | "blocked";
  components: ComponentHealth[];
  openAlerts: OpenAlert[];
  generatedAt: string;
}

const TONE: Record<ComponentHealth["status"], { bar: string; text: string; pill: string; icon: string }> = {
  healthy: { bar: "bg-bull", text: "text-bull-light", pill: "border-bull/40 bg-bull/10 text-bull-light", icon: "●" },
  warning: { bar: "bg-warn", text: "text-warn-light", pill: "border-warn/40 bg-warn/10 text-warn-light", icon: "▲" },
  degraded: { bar: "bg-bear", text: "text-bear-light", pill: "border-bear/40 bg-bear/10 text-bear-light", icon: "■" },
  down: { bar: "bg-bear", text: "text-bear-light", pill: "border-bear/50 bg-bear/20 text-bear-light", icon: "✕" },
};

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brain/system-health", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) return <div className="page-container"><div className="glass-card p-10 text-center text-muted">Loading system health…</div></div>;
  if (!data) return null;

  const overallTone = TONE[data.overall];
  const permLabel =
    data.tradingPermission === "allowed" ? "Trading allowed" :
    data.tradingPermission === "reduced_risk_only" ? "Reduced risk only" :
    "Trading blocked";

  return (
    <div className="page-container space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-fluid-3xl font-bold">System Health</h1>
          <p className="text-fluid-sm text-muted-light mt-1">
            Quant Engine Blueprint § 23 — observability for every infrastructure
            signal that gates whether the brain is allowed to trade.
          </p>
        </div>
        <button onClick={load} className="btn-ghost text-xs">↻ Refresh</button>
      </header>

      <section className={cn("glass-card p-5 border-2", overallTone.pill.replace("text-", "border-"))}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Overall</div>
            <div className={cn("text-3xl font-bold", overallTone.text)}>
              {overallTone.icon} {data.overall.toUpperCase()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Trading permission</div>
            <div className={cn("text-lg font-bold", overallTone.text)}>{permLabel}</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.components.map((c) => (
          <div key={c.name} className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">{c.name}</h3>
              <span className={cn("text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border", TONE[c.status].pill)}>
                {c.status}
              </span>
            </div>
            <p className="text-xs text-muted-light">{c.detail}</p>
            {c.lastUpdatedAt && (
              <p className="text-[10px] text-muted mt-1.5">{new Date(c.lastUpdatedAt).toLocaleString()}</p>
            )}
          </div>
        ))}
      </section>

      <section className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Open monitoring alerts ({data.openAlerts.length})</h2>
          {data.openAlerts.length === 0 && <span className="text-xs text-bull-light">All clear</span>}
        </div>
        {data.openAlerts.length === 0 ? null : (
          <ul className="space-y-2">
            {data.openAlerts.map((a) => {
              const lvl = a.level === "critical" ? "degraded" : a.level === "warning" ? "warning" : "healthy";
              const tone = TONE[lvl as ComponentHealth["status"]];
              return (
                <li key={a.id} className="flex items-start gap-3 text-xs border-b border-border/20 last:border-0 pb-2 last:pb-0">
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0", tone.pill)}>
                    {a.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{a.title}</div>
                    <p className="text-[11px] text-muted-light mt-0.5">{a.message}</p>
                    <div className="text-[10px] text-muted mt-0.5">
                      {a.category} · {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[10px] text-muted text-center">
        Auto-refresh every 60s · Generated {new Date(data.generatedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}
