"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AlgoBotExecutionRow {
  id: string;
  symbol: string;
  direction: string;
  grade: string | null;
  accountLogin: string;
  status: string;
  rejectReason: string | null;
  brokerOrderId: string | null;
  routedAt: string;
}

interface AlgoBotConfigRow {
  enabled: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

interface ActivityResponse {
  config: AlgoBotConfigRow | null;
  recent: AlgoBotExecutionRow[];
  routedToday: number;
  lastRoutedAt: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Live server-side activity for one algo bot. Polls /api/algos/activity
 * every 30s so admins can watch orders come through without refreshing.
 */
export function AlgoBotStatusPanel({ botId }: { botId: string }) {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/algos/activity/${botId}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as ActivityResponse;
        if (!cancelled) setData(json);
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [botId]);

  const running = !!(data?.config?.enabled && data?.config?.running);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">🛰 Live Routing Activity</h3>
          <span className={cn(
            "flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border",
            running ? "bg-bull/10 text-bull-light border-bull/30"
              : "bg-surface-3 text-muted border-border",
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", running ? "bg-bull pulse-live" : "bg-muted")} />
            {running ? "Server-side bot running" : "Server-side bot idle"}
          </span>
        </div>
        <div className="text-[10px] text-muted">
          Updates every 30s · Runs inside the 2-min Brain cycle
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Routed Today</div>
          <div className="text-lg font-bold text-foreground">{data?.routedToday ?? 0}</div>
        </div>
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Last Routed</div>
          <div className="text-lg font-bold text-foreground">{timeAgo(data?.lastRoutedAt ?? null)}</div>
        </div>
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Last Run</div>
          <div className="text-lg font-bold text-foreground">{timeAgo(data?.config?.lastRunAt ?? null)}</div>
        </div>
      </div>

      {data?.config?.lastErrorMessage && data?.config?.lastErrorAt && (
        <div className="bg-bear/10 border border-bear/30 rounded-xl p-3 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-bear-light mb-1">
            Last error · {timeAgo(data.config.lastErrorAt)}
          </div>
          <div className="text-xs text-bear-light font-mono break-words">{data.config.lastErrorMessage}</div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted py-4 text-center">Loading…</div>
      ) : !data?.recent?.length ? (
        <div className="text-xs text-muted py-4 text-center">
          No routing activity yet. Once enabled + running, qualifying A/A+ setups from the Brain will
          route to the linked MT accounts selected above.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {data.recent.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2 gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">{r.symbol}</span>
                  <span className={cn(
                    "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                    r.direction === "long" ? "bg-bull/10 text-bull-light border-bull/30"
                      : "bg-bear/10 text-bear-light border-bear/30",
                  )}>
                    {r.direction}
                  </span>
                  {r.grade && <span className="text-[9px] font-bold text-accent-light">{r.grade}</span>}
                  <span className={cn(
                    "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border",
                    r.status === "routed" ? "bg-bull/10 text-bull-light border-bull/30"
                      : r.status === "rejected" ? "bg-bear/10 text-bear-light border-bear/30"
                      : "bg-surface-3 text-muted border-border",
                  )}>
                    {r.status}
                  </span>
                </div>
                <div className="text-[10px] text-muted mt-0.5 truncate">
                  #{r.accountLogin}
                  {r.brokerOrderId && <> · ticket {r.brokerOrderId}</>}
                  {r.rejectReason && <> · {r.rejectReason}</>}
                </div>
              </div>
              <div className="text-[10px] text-muted shrink-0">{timeAgo(r.routedAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
