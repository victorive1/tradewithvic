"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getOrCreateUserKey } from "@/lib/trading/user-key-client";

interface DetailPayload {
  request: RequestDetail;
  setup: SetupLite | null;
  decisionLog: DecisionLogLite | null;
  algoExecution: AlgoExecLite | null;
  order: OrderLite | null;
  position: PositionLite | null;
  trade: TradeLite | null;
  events: ExecEvent[];
}

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
  sourceRef: string | null;
  magicNumber: number | null;
  result: ResultLite | null;
  audit: AuditEntry[];
  account: AccountLite | null;
}

interface ResultLite {
  executionStatus: string;
  brokerTicketRef: string | null;
  fillPrice: number | null;
  filledVolume: number | null;
  remainingVolume: number | null;
  slippagePips: number | null;
  commissionCost: number | null;
  swap: number | null;
  rejectionReason: string | null;
}
interface AuditEntry {
  id: string;
  eventType: string;
  actor: string;
  payloadJson: string | null;
  createdAt: string;
}
interface AccountLite {
  platformType: string;
  accountLogin: string;
  accountLabel: string | null;
  brokerName: string;
}
interface SetupLite {
  id: string;
  symbol: string;
  direction: string;
  setupType: string;
  timeframe: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  riskReward: number;
  confidenceScore: number;
  qualityGrade: string;
  explanation: string | null;
  invalidation: string | null;
}
interface DecisionLogLite {
  id: string;
  rulesScore: number;
  hybridScore: number | null;
  qualityLabel: string;
  alignmentScore: number | null;
  structureScore: number | null;
  momentumScore: number | null;
  entryLocationScore: number | null;
  rrScore: number | null;
  volatilityScore: number | null;
  eventRiskScore: number | null;
  pairStrengthSpread: number | null;
}
interface AlgoExecLite {
  id: string;
  botId: string;
  botLabel: string;
  status: string;
  rejectReason: string | null;
  accountLogin: string;
  grade: string | null;
  routedAt: string;
}
interface OrderLite {
  id: string;
  status: string;
  orderType: string;
  filledAt: string | null;
  filledPrice: number | null;
  rejectReason: string | null;
  cancelReason: string | null;
}
interface PositionLite {
  id: string;
  status: string;
  direction: string;
  entry: number;
  stopLoss: number;
  originalStopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  sizeUnits: number;
  riskAmount: number;
  mfe: number;
  mae: number;
  realizedPnl: number;
  unrealizedPnl: number;
  closedPct: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  movedToBreakeven: boolean;
  thesisScore: number;
  thesisState: string;
  exitPrice: number | null;
  exitReason: string | null;
  openedAt: string;
  closedAt: string | null;
}
interface TradeLite {
  id: string;
  entry: number;
  exit: number;
  stopLoss: number;
  realizedPnl: number;
  pnlPct: number;
  rMultiple: number;
  exitReason: string;
  openedAt: string;
  closedAt: string;
  durationMinutes: number;
  mfe: number;
  mae: number;
}
interface ExecEvent {
  id: string;
  eventType: string;
  price: number | null;
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  createdAt: string;
}

export default function ExecutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [userKey, setUserKey] = useState("");
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const headers = useMemo(() => ({ "x-trading-user-key": userKey }), [userKey]);

  useEffect(() => { setUserKey(getOrCreateUserKey()); }, []);

  const load = useCallback(async () => {
    if (!userKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/trading/executions/${id}`, { headers, cache: "no-store" });
      if (res.ok) {
        const payload = (await res.json()) as DetailPayload;
        setData(payload);
      }
    } finally { setLoading(false); }
  }, [userKey, id, headers]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="page-container"><div className="glass-card p-10 text-center text-muted">Loading order…</div></div>;
  if (!data) return <div className="page-container"><div className="glass-card p-10 text-center text-muted">Order not found.</div></div>;

  const { request: detail, setup, decisionLog, algoExecution, position, trade, events } = data;
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
            {algoExecution && <span className="text-[11px] text-accent-light">· algo: {algoExecution.botLabel}</span>}
          </div>
        </div>
      </header>

      <section className="glass-card p-5 space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Order plan</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <KV label="Symbol (internal)" value={detail.internalSymbol} mono />
          <KV label="Symbol (broker)" value={detail.brokerSymbol ?? "—"} mono />
          <KV label="Entry" value={detail.entryPrice != null ? String(detail.entryPrice) : "Market"} mono />
          <KV label="Stop" value={detail.stopLoss != null ? String(detail.stopLoss) : "—"} mono />
          <KV label="TP1" value={setup?.takeProfit1 != null ? String(setup.takeProfit1) : (detail.takeProfit != null ? String(detail.takeProfit) : "—")} mono />
          <KV label="TP2" value={setup?.takeProfit2 != null ? String(setup.takeProfit2) : "—"} mono />
          <KV label="TP3" value={setup?.takeProfit3 != null ? String(setup.takeProfit3) : "—"} mono />
          <KV label="RR" value={setup?.riskReward != null ? setup.riskReward.toFixed(2) : "—"} mono />
          <KV label="Sizing" value={detail.sizingMode === "risk_percent" ? `${detail.riskPercent}% risk` : "Fixed lots"} />
          <KV label="Volume" value={String(detail.requestedVolume)} mono />
          <KV label="Magic" value={detail.magicNumber != null ? String(detail.magicNumber) : "—"} mono />
          {detail.account && <KV label="Account" value={`${detail.account.platformType} #${detail.account.accountLogin}`} mono />}
          {detail.comment && <KV label="Comment" value={detail.comment} />}
        </div>
      </section>

      <AlgoProvenance algo={algoExecution} sourceType={detail.sourceType} />

      <SetupRatings setup={setup} decisionLog={decisionLog} />

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
            <KV label="Remaining" value={result.remainingVolume != null ? String(result.remainingVolume) : "—"} mono />
            <KV label="Slippage" value={result.slippagePips != null ? `${result.slippagePips}p` : "—"} mono />
            <KV label="Commission" value={result.commissionCost != null ? `$${result.commissionCost.toFixed(2)}` : "—"} mono />
            <KV label="Swap" value={result.swap != null ? `$${result.swap.toFixed(2)}` : "—"} mono />
          </div>
          {result.rejectionReason && (
            <div className="text-xs text-bear-light bg-bear/5 border border-bear/30 rounded-lg p-3">
              {result.rejectionReason}
            </div>
          )}
        </section>
      )}

      <PostTradeOutcome position={position} trade={trade} />

      <LifecycleTimeline audit={detail.audit} events={events} />
    </div>
  );
}

function PostTradeOutcome({ position, trade }: { position: PositionLite | null; trade: TradeLite | null }) {
  if (!position && !trade) return null;
  const closed = position?.status === "closed" || !!trade;
  const pnl = trade?.realizedPnl ?? position?.realizedPnl ?? position?.unrealizedPnl ?? 0;
  const pnlTone = pnl > 0 ? "bull" : pnl < 0 ? "bear" : "neutral";
  return (
    <section className={cn("glass-card p-5 space-y-3 border-2",
      closed
        ? (pnl >= 0 ? "border-bull/40" : "border-bear/40")
        : "border-accent/30"
    )}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          {closed ? "Post-trade outcome" : "Position — live"}
        </h2>
        {position && (
          <span className={cn("badge", closed ? "badge-bear" : "badge-bull")}>
            {closed ? "closed" : "open"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        {trade ? (
          <>
            <KV label="Realized PnL" value={`$${trade.realizedPnl.toFixed(2)}`} mono tone={pnlTone} />
            <KV label="PnL %" value={`${trade.pnlPct.toFixed(2)}%`} mono tone={pnlTone} />
            <KV label="R multiple" value={trade.rMultiple.toFixed(2)} mono tone={pnlTone} />
            <KV label="Exit reason" value={trade.exitReason} />
            <KV label="Entry" value={String(trade.entry)} mono />
            <KV label="Exit" value={String(trade.exit)} mono />
            <KV label="MFE" value={trade.mfe.toFixed(2)} mono />
            <KV label="MAE" value={trade.mae.toFixed(2)} mono />
            <KV label="Opened" value={new Date(trade.openedAt).toLocaleString()} />
            <KV label="Closed" value={new Date(trade.closedAt).toLocaleString()} />
            <KV label="Duration" value={formatMinutes(trade.durationMinutes)} />
          </>
        ) : position ? (
          <>
            <KV
              label={closed ? "Realized PnL" : "Unrealized PnL"}
              value={`$${(closed ? position.realizedPnl : position.unrealizedPnl).toFixed(2)}`}
              mono
              tone={pnlTone}
            />
            <KV label="MFE" value={position.mfe.toFixed(2)} mono />
            <KV label="MAE" value={position.mae.toFixed(2)} mono />
            <KV label="Closed %" value={`${position.closedPct.toFixed(0)}%`} mono />
            <KV label="Entry" value={String(position.entry)} mono />
            <KV label="Stop (current)" value={String(position.stopLoss)} mono />
            <KV label="Stop (orig)" value={String(position.originalStopLoss)} mono />
            <KV label="Size units" value={String(position.sizeUnits)} mono />
            <KV label="Thesis" value={`${position.thesisScore} · ${position.thesisState}`} tone={thesisTone(position.thesisState)} />
            <KV label="Moved to BE" value={position.movedToBreakeven ? "yes" : "no"} />
            <KV label="Opened" value={new Date(position.openedAt).toLocaleString()} />
            {position.closedAt && <KV label="Closed" value={new Date(position.closedAt).toLocaleString()} />}
            {position.exitReason && <KV label="Exit reason" value={position.exitReason} />}
          </>
        ) : null}
      </div>

      {position && (
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider pt-2 border-t border-border/30 flex-wrap">
          <span className="text-muted">Targets:</span>
          <HitPill label="TP1" hit={position.tp1Hit} />
          {position.takeProfit2 != null && <HitPill label="TP2" hit={position.tp2Hit} />}
          {position.takeProfit3 != null && <HitPill label="TP3" hit={position.tp3Hit} />}
          <HitPill label="SL" hit={(trade?.exitReason === "sl_hit") || position.exitReason === "sl_hit"} bear />
          <HitPill label="BE moved" hit={position.movedToBreakeven} neutral />
        </div>
      )}
    </section>
  );
}

function HitPill({ label, hit, bear, neutral }: { label: string; hit: boolean; bear?: boolean; neutral?: boolean }) {
  return (
    <span className={cn(
      "font-mono px-2 py-0.5 rounded-md border",
      hit
        ? (bear ? "border-bear/40 bg-bear/10 text-bear-light"
          : neutral ? "border-accent/40 bg-accent/10 text-accent-light"
          : "border-bull/40 bg-bull/10 text-bull-light")
        : "border-border/40 bg-surface-2 text-muted"
    )}>
      {label} {hit ? "✓" : "·"}
    </span>
  );
}

function thesisTone(state: string): Tone {
  if (state === "strong") return "bull";
  if (state === "weakening") return "warn";
  if (state === "damaged" || state === "invalidated") return "bear";
  return "neutral";
}

function formatMinutes(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h < 24) return r ? `${h}h ${r}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

interface TimelineEntry {
  id: string;
  source: "audit" | "event";
  eventType: string;
  createdAt: string;
  actor: string;
  detail: string | null;
}

function LifecycleTimeline({ audit, events }: { audit: AuditEntry[]; events: ExecEvent[] }) {
  const merged: TimelineEntry[] = [
    ...audit.map((a) => ({
      id: `a:${a.id}`,
      source: "audit" as const,
      eventType: a.eventType,
      createdAt: a.createdAt,
      actor: a.actor,
      detail: a.payloadJson,
    })),
    ...events.map((e) => ({
      id: `e:${e.id}`,
      source: "event" as const,
      eventType: e.eventType,
      createdAt: e.createdAt,
      actor: "brain",
      detail: [
        e.reason,
        e.price != null ? `@ ${e.price}` : null,
        e.fromValue != null || e.toValue != null ? `${e.fromValue ?? "—"} → ${e.toValue ?? "—"}` : null,
      ].filter(Boolean).join(" · ") || null,
    })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <section className="glass-card p-5 space-y-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        Lifecycle timeline
      </h2>
      <ol className="space-y-2">
        {merged.map((e) => (
          <li key={e.id} className="flex items-start gap-3 text-xs">
            <span className={cn(
              "w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border text-center",
              timelineClass(e.eventType)
            )}>{e.eventType}</span>
            <div className="flex-1 min-w-0">
              <div className="text-muted-light">
                {new Date(e.createdAt).toLocaleString()} ·{" "}
                <span className="text-muted">{e.source === "audit" ? e.actor : "brain"}</span>
              </div>
              {e.detail && (
                <pre className="mt-1 text-[10px] font-mono text-muted bg-surface-2/60 border border-border/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all">
                  {e.detail}
                </pre>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function timelineClass(eventType: string): string {
  if (eventType === "created" || eventType === "submitted" || eventType === "opened") {
    return "border-accent/40 text-accent-light bg-accent/10";
  }
  if (eventType === "fill" || eventType === "ack" || eventType.startsWith("tp")) {
    return "border-bull/40 text-bull-light bg-bull/10";
  }
  if (eventType === "reject" || eventType === "error" || eventType === "sl_hit" || eventType.startsWith("closed")) {
    return "border-bear/40 text-bear-light bg-bear/10";
  }
  if (eventType.includes("thesis") || eventType.includes("breakeven") || eventType.includes("trail") || eventType.includes("partial")) {
    return "border-warn/40 text-warn-light bg-warn/10";
  }
  return "border-border text-muted bg-surface-2";
}

function AlgoProvenance({ algo, sourceType }: { algo: AlgoExecLite | null; sourceType: string | null }) {
  if (!algo) {
    return (
      <section className="glass-card p-5 space-y-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Algo provenance</h2>
        <p className="text-xs text-muted">
          {sourceType === "manual" || !sourceType
            ? "Manual order — no algo routed this trade."
            : `Source: ${sourceType}. No AlgoBotExecution row linked — may have been queued outside the algo runtime.`}
        </p>
      </section>
    );
  }
  const tone = algo.status === "routed" ? "bull" : algo.status === "rejected" || algo.status === "filtered" ? "bear" : "warn";
  return (
    <section className="glass-card p-5 space-y-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Algo provenance</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <KV label="Algo" value={algo.botLabel} mono />
        <KV label="Routing status" value={algo.status} tone={tone} />
        <KV label="Grade at routing" value={algo.grade ?? "—"} mono />
        <KV label="Routed at" value={new Date(algo.routedAt).toLocaleString()} />
      </div>
      {algo.rejectReason && (
        <div className="text-xs text-bear-light bg-bear/5 border border-bear/30 rounded-lg p-3">
          {algo.rejectReason}
        </div>
      )}
    </section>
  );
}

function SetupRatings({ setup, decisionLog }: { setup: SetupLite | null; decisionLog: DecisionLogLite | null }) {
  if (!setup && !decisionLog) return null;
  const dims: Array<[string, number | null | undefined]> = decisionLog ? [
    ["Structure", decisionLog.structureScore],
    ["Momentum", decisionLog.momentumScore],
    ["Alignment", decisionLog.alignmentScore],
    ["Entry loc", decisionLog.entryLocationScore],
    ["RR", decisionLog.rrScore],
    ["Volatility", decisionLog.volatilityScore],
    ["Event risk", decisionLog.eventRiskScore],
  ] : [];
  return (
    <section className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Setup ratings</h2>
        {setup && (
          <Link href={`/dashboard/brain/decision/${setup.id}`} className="text-[11px] text-accent-light hover:text-accent transition-smooth">
            Decision drill-down →
          </Link>
        )}
      </div>
      {setup && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <KV label="Grade" value={setup.qualityGrade} tone={gradeTone(setup.qualityGrade)} />
          <KV label="Confidence" value={`${setup.confidenceScore}/100`} mono />
          <KV label="Strategy" value={setup.setupType} />
          <KV label="Timeframe" value={setup.timeframe} mono />
          {decisionLog?.hybridScore != null && <KV label="Hybrid score" value={decisionLog.hybridScore.toFixed(1)} mono />}
          {decisionLog && <KV label="Rules score" value={decisionLog.rulesScore.toFixed(1)} mono />}
          {decisionLog && <KV label="Quality label" value={decisionLog.qualityLabel} />}
        </div>
      )}
      {dims.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {dims.map(([k, v]) => (
            <DimensionBar key={k} label={k} value={v ?? null} />
          ))}
        </div>
      )}
      {setup?.explanation && (
        <p className="text-[11px] text-muted-light leading-relaxed pt-1">{setup.explanation}</p>
      )}
      {setup?.invalidation && (
        <p className="text-[11px] text-muted pt-1"><span className="uppercase tracking-wider text-[9px]">Invalidated if:</span> {setup.invalidation}</p>
      )}
    </section>
  );
}

function DimensionBar({ label, value }: { label: string; value: number | null }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
  const tone = pct >= 75 ? "bg-bull/70" : pct >= 50 ? "bg-accent/70" : pct >= 25 ? "bg-warn/70" : "bg-bear/60";
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <div className="w-20 shrink-0 text-muted">{label}</div>
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        {value != null && <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />}
      </div>
      <div className="w-10 text-right font-mono text-muted-light">{value == null ? "—" : pct.toFixed(0)}</div>
    </div>
  );
}

function gradeTone(grade: string): Tone {
  if (grade === "A+" || grade === "A") return "bull";
  if (grade === "B") return "warn";
  return "neutral";
}

type Tone = "bull" | "bear" | "warn" | "neutral";

function KV({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: Tone }) {
  return (
    <div>
      <div className="text-muted text-[10px] uppercase tracking-wider">{label}</div>
      <div className={cn(
        "mt-0.5 truncate",
        mono && "font-mono",
        tone === "bull" && "text-bull-light font-semibold",
        tone === "bear" && "text-bear-light font-semibold",
        tone === "warn" && "text-warn-light font-semibold",
      )}>{value}</div>
    </div>
  );
}
