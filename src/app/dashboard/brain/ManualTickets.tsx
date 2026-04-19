"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOrCreateUserKey } from "@/lib/trading/user-key-client";

interface Ticket {
  id: string;
  internalSymbol: string;
  brokerSymbol: string | null;
  side: "buy" | "sell";
  orderType: string;
  requestedVolume: number;
  status: string;
  statusReason: string | null;
  stopLoss: number | null;
  takeProfit: number | null;
  entryPrice: number | null;
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

export function ManualTickets() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Ticket[]>([]);

  useEffect(() => {
    const userKey = getOrCreateUserKey();
    if (!userKey) { setLoading(false); return; }
    fetch("/api/trading/execution-history?take=30", {
      headers: { "x-trading-user-key": userKey },
      cache: "no-store",
    })
      .then(async (r) => (r.ok ? r.json() : { requests: [] }))
      .then((data) => { setRows(data.requests ?? []); })
      .finally(() => setLoading(false));
  }, []);

  // Live/active tickets: filled or still in-flight. Exclude rejected/failed/cancelled.
  const active = rows.filter((r) => {
    if (["rejected", "failed", "cancelled"].includes(r.status)) return false;
    return true;
  });

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Manual Tickets
          {active.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted normal-case">
              · {active.length} active · sent from Execute Trade
            </span>
          )}
        </h2>
        <Link href="/dashboard/trading/executions" className="text-xs text-muted hover:text-foreground underline underline-offset-4">
          Full history →
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading your tickets…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted">
          No live manual tickets. Trades sent via the Execute Trade button appear here after the broker adapter acknowledges them.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {active.map((t) => {
            const isBuy = t.side === "buy";
            const isDemo = t.status === "filled" && t.result?.executionStatus === "accepted" && !t.result.brokerTicketRef;
            const statusClass =
              t.status === "filled" ? "bg-green-500/15 text-green-400 border-green-500/40"
                : t.status === "submitted" ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                  : t.status === "pending_submission" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                    : "bg-muted/10 text-muted border-border";
            const priceDigits = (t.entryPrice ?? t.result?.fillPrice ?? 1) > 100 ? 2 : 5;
            return (
              <Link
                key={t.id}
                href={`/dashboard/trading/executions/${t.id}`}
                className="rounded-lg border border-border bg-background/30 p-3 space-y-2 hover:border-border-light transition-smooth block"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${isBuy ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                      {isBuy ? "▲ BUY" : "▼ SELL"}
                    </span>
                    <span className="font-mono text-sm font-semibold truncate">{t.internalSymbol}</span>
                    <span className="text-[10px] text-muted uppercase">{t.orderType}</span>
                  </div>
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${statusClass}`}>
                    {t.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-[11px] text-muted-light font-mono truncate">
                  {t.account ? `${t.account.brokerName} · #${t.account.accountLogin}` : "—"}
                  {isDemo && <span className="ml-2 px-1 py-0.5 text-[9px] rounded bg-warn/10 text-warn border border-warn/30 uppercase">demo</span>}
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px] font-mono">
                  <div className="flex flex-col"><span className="text-muted text-[9px] uppercase">Vol</span><span>{t.requestedVolume}</span></div>
                  <div className="flex flex-col"><span className="text-muted text-[9px] uppercase">Fill</span><span>{t.result?.fillPrice != null ? t.result.fillPrice.toFixed(priceDigits) : t.entryPrice != null ? t.entryPrice.toFixed(priceDigits) : "—"}</span></div>
                  <div className="flex flex-col"><span className="text-muted text-[9px] uppercase">Ticket</span><span className="truncate">{t.result?.brokerTicketRef ?? "—"}</span></div>
                  <div className="flex flex-col"><span className="text-muted text-[9px] uppercase">SL</span><span className="text-red-400">{t.stopLoss != null ? t.stopLoss.toFixed(priceDigits) : "—"}</span></div>
                  <div className="flex flex-col"><span className="text-muted text-[9px] uppercase">TP</span><span className="text-green-400">{t.takeProfit != null ? t.takeProfit.toFixed(priceDigits) : "—"}</span></div>
                  <div className="flex flex-col"><span className="text-muted text-[9px] uppercase">Age</span><span>{timeAgo(t.createdAt)}</span></div>
                </div>
                {t.sourceType && t.sourceType !== "manual" && (
                  <div className="text-[10px] text-muted uppercase tracking-wide">
                    source · {t.sourceType.replace(/_/g, " ")}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-muted mt-3">
        Status reflects the last broker acknowledgement. Live open/closed state requires an MT bridge poll — not yet wired.
      </p>
    </section>
  );
}
