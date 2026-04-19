"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getOrCreateUserKey } from "@/lib/trading/user-key-client";

interface RequestRow {
  id: string;
  internalSymbol: string;
  brokerSymbol: string | null;
  side: "buy" | "sell";
  orderType: string;
  requestedVolume: number;
  status: string;
  statusReason: string | null;
  createdAt: string;
  submittedAt: string | null;
  sourceType: string | null;
  account: { accountLabel: string | null; accountLogin: string; brokerName: string; platformType: string } | null;
  result: {
    executionStatus: string;
    brokerTicketRef: string | null;
    fillPrice: number | null;
    filledVolume: number | null;
    rejectionReason: string | null;
  } | null;
}

function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ExecutionHistoryPage() {
  const [userKey, setUserKey] = useState("");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const headers = useMemo(() => ({ "x-trading-user-key": userKey }), [userKey]);

  useEffect(() => { setUserKey(getOrCreateUserKey()); }, []);

  const load = useCallback(async () => {
    if (!userKey) return;
    setLoading(true);
    try {
      const qs = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const res = await fetch(`/api/trading/execution-history${qs}`, { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setRows(data.requests ?? []);
      }
    } finally { setLoading(false); }
  }, [userKey, headers, statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page-container space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-fluid-3xl font-bold">Execution History</h1>
          <p className="text-fluid-sm text-muted-light mt-1">
            Every direct trade request submitted from this platform, with adapter responses.
          </p>
        </div>
        <Link href="/dashboard/trading/execute" className="btn-primary">+ New order</Link>
      </header>

      <div className="flex items-center gap-1.5 flex-wrap">
        {["all", "filled", "submitted", "rejected", "failed"].map((f) => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth",
              statusFilter === f ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light")}>
            {f}
          </button>
        ))}
        <button onClick={load} className="btn-ghost text-xs ml-auto">↻ Refresh</button>
      </div>

      <section className="glass-card overflow-x-auto p-0">
        {loading ? (
          <div className="p-10 text-center text-muted">Loading executions…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="text-3xl opacity-40">📋</div>
            <p className="text-fluid-sm text-muted">No orders yet{statusFilter !== "all" ? " with that status" : ""}.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border/40 bg-surface-2/30">
                <th className="text-left py-2.5 px-3">WHEN</th>
                <th className="text-left px-2">SYMBOL</th>
                <th className="text-left px-2">DIR</th>
                <th className="text-right px-2">VOL</th>
                <th className="text-right px-2">FILL</th>
                <th className="text-left px-2">ACCOUNT</th>
                <th className="text-left px-2">STATUS</th>
                <th className="text-left px-2">TICKET</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = r.status === "filled" ? "bull" : r.status === "rejected" || r.status === "failed" ? "bear" : "warn";
                return (
                  <tr key={r.id} className="border-b border-border/20 last:border-0 hover:bg-surface-2/30 transition-smooth">
                    <td className="py-2 px-3 font-mono text-muted">{timeAgo(r.createdAt)}</td>
                    <td className="px-2 font-mono font-semibold">{r.internalSymbol}</td>
                    <td className="px-2">
                      <span className={cn("font-bold text-[11px]", r.side === "buy" ? "text-bull-light" : "text-bear-light")}>
                        {r.side === "buy" ? "▲ BUY" : "▼ SELL"}
                      </span>
                    </td>
                    <td className="px-2 text-right font-mono">{r.requestedVolume}</td>
                    <td className="px-2 text-right font-mono">{r.result?.fillPrice ?? "—"}</td>
                    <td className="px-2 text-muted-light">{r.account ? `${r.account.platformType} #${r.account.accountLogin}` : "—"}</td>
                    <td className="px-2">
                      <span className={cn("badge",
                        tone === "bull" ? "badge-bull" : tone === "bear" ? "badge-bear" : "badge-warn"
                      )}>{r.status}</span>
                    </td>
                    <td className="px-2 font-mono text-muted text-[10px]">
                      {r.result?.brokerTicketRef ? (
                        <Link href={`/dashboard/trading/executions/${r.id}`} className="text-accent-light hover:text-accent transition-smooth">
                          {r.result.brokerTicketRef}
                        </Link>
                      ) : (
                        <Link href={`/dashboard/trading/executions/${r.id}`} className="text-muted hover:text-foreground transition-smooth">
                          detail →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
