"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getOrCreateUserKey } from "@/lib/trading/user-key-client";

interface RequestDetail {
  id: string;
  internalSymbol: string;
  brokerSymbol: string | null;
  side: string;
  orderType: string;
  requestedVolume: number;
  sizingMode: string;
  riskPercent: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  status: string;
  statusReason: string | null;
  createdAt: string;
  submittedAt: string | null;
  comment: string | null;
  sourceType: string | null;
  result: any | null;
  audit: Array<{ id: string; eventType: string; actor: string; payloadJson: string | null; createdAt: string }>;
  account: any | null;
}

export default function ExecutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [userKey, setUserKey] = useState("");
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const headers = useMemo(() => ({ "x-trading-user-key": userKey }), [userKey]);

  useEffect(() => { setUserKey(getOrCreateUserKey()); }, []);

  const load = useCallback(async () => {
    if (!userKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/trading/executions/${id}`, { headers, cache: "no-store" });
      if (res.ok) { const data = await res.json(); setDetail(data.request); }
    } finally { setLoading(false); }
  }, [userKey, id, headers]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="page-container"><div className="glass-card p-10 text-center text-muted">Loading order…</div></div>;
  if (!detail) return <div className="page-container"><div className="glass-card p-10 text-center text-muted">Order not found.</div></div>;

  const result = detail.result;
  const ok = result?.executionStatus === "accepted" || result?.executionStatus === "partial";
  const rejected = result?.executionStatus === "rejected" || result?.executionStatus === "error";

  return (
    <div className="page-container space-y-5 max-w-3xl">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboard/trading/executions" className="text-xs text-muted hover:text-foreground transition-smooth">← All executions</Link>
          <h1 className="text-fluid-2xl font-bold mt-1">{detail.side.toUpperCase()} {detail.requestedVolume} {detail.internalSymbol}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={cn("badge", detail.status === "filled" ? "badge-bull" : detail.status === "rejected" || detail.status === "failed" ? "badge-bear" : "badge-warn")}>
              {detail.status}
            </span>
            <span className="text-[11px] text-muted uppercase tracking-wider">{detail.orderType}</span>
            {detail.sourceType && <span className="text-[11px] text-muted">· source: {detail.sourceType}</span>}
          </div>
        </div>
      </header>

      <section className="glass-card p-5 space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Order</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <KV label="Symbol (internal)" value={detail.internalSymbol} mono />
          <KV label="Symbol (broker)" value={detail.brokerSymbol ?? "—"} mono />
          <KV label="Entry" value={detail.entryPrice != null ? String(detail.entryPrice) : "Market"} mono />
          <KV label="Stop / Target" value={`${detail.stopLoss ?? "—"} / ${detail.takeProfit ?? "—"}`} mono />
          <KV label="Sizing" value={detail.sizingMode === "risk_percent" ? `${detail.riskPercent}% risk` : "Fixed lots"} />
          <KV label="Volume" value={String(detail.requestedVolume)} mono />
          {detail.account && <KV label="Account" value={`${detail.account.platformType} #${detail.account.accountLogin}`} mono />}
          {detail.comment && <KV label="Comment" value={detail.comment} />}
        </div>
      </section>

      {result && (
        <section className={cn("glass-card p-5 space-y-3 border-2",
          ok ? "border-bull/40" : rejected ? "border-bear/40" : "border-warn/40"
        )}>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Adapter response</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <KV label="Status" value={result.executionStatus} />
            <KV label="Broker ticket" value={result.brokerTicketRef ?? "—"} mono />
            <KV label="Fill price" value={result.fillPrice != null ? String(result.fillPrice) : "—"} mono />
            <KV label="Filled volume" value={result.filledVolume != null ? String(result.filledVolume) : "—"} mono />
            <KV label="Slippage" value={result.slippagePips != null ? `${result.slippagePips}p` : "—"} mono />
            <KV label="Commission" value={result.commissionCost != null ? `$${result.commissionCost.toFixed(2)}` : "—"} mono />
          </div>
          {result.rejectionReason && (
            <div className="text-xs text-bear-light bg-bear/5 border border-bear/30 rounded-lg p-3">
              {result.rejectionReason}
            </div>
          )}
        </section>
      )}

      <section className="glass-card p-5 space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Audit trail</h2>
        <ol className="space-y-2">
          {detail.audit.map((e) => (
            <li key={e.id} className="flex items-start gap-3 text-xs">
              <span className={cn(
                "w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border text-center",
                e.eventType === "created" || e.eventType === "submitted" ? "border-accent/40 text-accent-light bg-accent/10" :
                e.eventType === "fill" || e.eventType === "ack" ? "border-bull/40 text-bull-light bg-bull/10" :
                e.eventType === "reject" || e.eventType === "error" ? "border-bear/40 text-bear-light bg-bear/10" :
                "border-border text-muted bg-surface-2"
              )}>{e.eventType}</span>
              <div className="flex-1 min-w-0">
                <div className="text-muted-light">{new Date(e.createdAt).toLocaleString()} · <span className="text-muted">{e.actor}</span></div>
                {e.payloadJson && (
                  <pre className="mt-1 text-[10px] font-mono text-muted bg-surface-2/60 border border-border/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {e.payloadJson}
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-muted text-[10px] uppercase tracking-wider">{label}</div>
      <div className={cn("mt-0.5 truncate", mono && "font-mono")}>{value}</div>
    </div>
  );
}
