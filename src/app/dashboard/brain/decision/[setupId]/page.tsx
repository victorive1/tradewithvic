import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function timeAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function DecisionAuditPage({
  params,
}: {
  params: Promise<{ setupId: string }>;
}) {
  const { setupId } = await params;
  const setup = await prisma.tradeSetup.findUnique({ where: { id: setupId } });
  if (!setup) notFound();

  const [decisionLog, order, position, trade, guardrailLog, portfolioDecision, regime, structure, indicator, recentEvents, recentSweeps] = await Promise.all([
    prisma.setupDecisionLog.findFirst({ where: { setupId }, orderBy: { createdAt: "desc" }, include: { outcomes: true } }),
    prisma.executionOrder.findUnique({ where: { setupId } }),
    prisma.executionPosition.findFirst({ where: { setupId }, orderBy: { openedAt: "desc" } }),
    prisma.executionTrade.findFirst({ where: { setupId }, orderBy: { closedAt: "desc" } }),
    prisma.executionGuardrailLog.findFirst({ where: { setupId }, orderBy: { checkedAt: "desc" } }),
    prisma.portfolioDecisionLog.findFirst({ where: { setupId }, orderBy: { createdAt: "desc" } }),
    prisma.regimeSnapshot.findUnique({ where: { symbol_timeframe: { symbol: setup.symbol, timeframe: setup.timeframe } } }),
    prisma.structureState.findUnique({ where: { symbol_timeframe: { symbol: setup.symbol, timeframe: setup.timeframe } } }),
    prisma.indicatorSnapshot.findUnique({ where: { symbol_timeframe: { symbol: setup.symbol, timeframe: setup.timeframe } } }),
    prisma.structureEvent.findMany({
      where: { symbol: setup.symbol, timeframe: setup.timeframe, detectedAt: { lte: setup.createdAt } },
      orderBy: { detectedAt: "desc" },
      take: 3,
    }),
    prisma.liquidityEvent.findMany({
      where: { symbol: setup.symbol, timeframe: setup.timeframe, detectedAt: { lte: setup.createdAt } },
      orderBy: { detectedAt: "desc" },
      take: 3,
    }),
  ]);

  const reasoning = decisionLog ? parseJson<{ confluences?: string[]; conflicts?: string[]; disqualifiers?: string[] }>(decisionLog.reasoningJson, {}) : {};
  const featureVector = decisionLog ? parseJson<Record<string, number>>(decisionLog.featureVectorJson, {}) : {};
  const marketContext = decisionLog ? parseJson<Record<string, any>>(decisionLog.marketContextJson, {}) : {};
  const guardrailReasons = guardrailLog ? parseJson<string[]>(guardrailLog.failureReasons, []) : [];
  const portfolioReasons = portfolioDecision ? parseJson<string[]>(portfolioDecision.reasons, []) : [];

  const isBull = setup.direction === "bullish";
  const outcome = decisionLog?.outcomes?.[0];

  const dimensions = [
    { key: "trendAlignment", label: "Trend Alignment", max: 15 },
    { key: "structureQuality", label: "Structure", max: 20 },
    { key: "liquidityBehavior", label: "Liquidity", max: 15 },
    { key: "strategyPattern", label: "Strategy Pattern", max: 15 },
    { key: "indicatorConfluence", label: "Indicators", max: 10 },
    { key: "volatilityQuality", label: "Volatility", max: 5 },
    { key: "spreadQuality", label: "Spread", max: 5 },
    { key: "sessionQuality", label: "Session", max: 5 },
    { key: "sentimentAlignment", label: "Sentiment", max: 5 },
    { key: "fundamentalSafety", label: "Event Safety", max: 5 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Decision Audit</h1>
          <p className="text-sm text-muted mt-1 font-mono">{setup.id}</p>
        </div>
        <Link href="/dashboard/brain" className="text-sm text-muted hover:text-foreground underline underline-offset-4">← Brain</Link>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-bold ${isBull ? "text-green-400" : "text-red-400"}`}>
                {isBull ? "LONG" : "SHORT"}
              </span>
              <span className="font-mono text-xl">{setup.symbol}</span>
              <span className="text-muted">·</span>
              <span className="text-muted">{setup.timeframe}</span>
              <span className="px-2 py-0.5 text-xs font-bold border border-border rounded bg-background/40">{setup.qualityGrade}</span>
              <span className="text-muted">{setup.confidenceScore}/100</span>
            </div>
            <p className="text-sm text-muted mt-2">{setup.setupType.replace(/_/g, " ")} · created {timeAgo(setup.createdAt)} · status {setup.status}</p>
          </div>
          <div className="text-xs space-y-0.5 font-mono">
            <div>Entry <span className="text-foreground">{setup.entry.toFixed(5)}</span></div>
            <div>SL <span className="text-red-400">{setup.stopLoss.toFixed(5)}</span></div>
            <div>TP1 <span className="text-green-400">{setup.takeProfit1.toFixed(5)}</span></div>
            <div>RR <span className="text-foreground">{setup.riskReward.toFixed(2)}x</span></div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Layer 2 — Score Composition</h2>
        {!decisionLog ? (
          <p className="text-sm text-muted">No decision log exists for this setup yet.</p>
        ) : (
          <div className="space-y-2">
            {dimensions.map((d) => {
              const v = featureVector[d.key] ?? 0;
              const pct = (v / d.max) * 100;
              const bar = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : pct >= 30 ? "bg-yellow-500" : "bg-red-500";
              return (
                <div key={d.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span>{d.label}</span>
                    <span className="font-mono text-muted">{v.toFixed(1)} / {d.max}</span>
                  </div>
                  <div className="h-1.5 rounded bg-surface-2 mt-1 overflow-hidden">
                    <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-3 mt-3 border-t border-border/40 flex items-center justify-between">
              <span className="text-sm font-semibold">Rules score</span>
              <span className="text-2xl font-bold">{decisionLog.rulesScore.toFixed(0)} / 100</span>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 text-green-400">Confluences</h2>
          {!reasoning.confluences || reasoning.confluences.length === 0 ? (
            <p className="text-xs text-muted">None recorded.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {reasoning.confluences.map((c, i) => <li key={i} className="border-l-2 border-green-400/40 pl-3">{c}</li>)}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 text-yellow-400">Conflicts</h2>
          {!reasoning.conflicts || reasoning.conflicts.length === 0 ? (
            <p className="text-xs text-muted">None recorded.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {reasoning.conflicts.map((c, i) => <li key={i} className="border-l-2 border-yellow-400/40 pl-3">{c}</li>)}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 text-red-400">Disqualifiers</h2>
          {!reasoning.disqualifiers || reasoning.disqualifiers.length === 0 ? (
            <p className="text-xs text-muted">None — setup passed hard gates.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {reasoning.disqualifiers.map((c, i) => <li key={i} className="border-l-2 border-red-400/40 pl-3">{c}</li>)}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Decision Timeline</h2>
        <div className="space-y-3 text-xs">
          <TimelineRow
            when={setup.createdAt}
            layer="Layer 1.3 — Strategy Detection"
            text={`Detected ${setup.setupType.replace(/_/g, " ")} on ${setup.symbol} ${setup.timeframe}`}
          />
          {decisionLog && (
            <TimelineRow
              when={decisionLog.createdAt}
              layer="Layer 2 — Confluence Qualification"
              text={`Scored ${decisionLog.rulesScore.toFixed(0)}/100, graded ${decisionLog.qualityLabel}. Session ${decisionLog.session}, regime ${decisionLog.marketRegime}.`}
            />
          )}
          {guardrailLog && (
            <TimelineRow
              when={guardrailLog.checkedAt}
              layer="Layer 5 — Execution Guardrails"
              text={guardrailLog.passed
                ? "All execution guardrails passed"
                : `Blocked by guardrails: ${guardrailReasons.join(", ")}`}
              tone={guardrailLog.passed ? "ok" : "bad"}
            />
          )}
          {portfolioDecision && (
            <TimelineRow
              when={portfolioDecision.createdAt}
              layer="Layer 6 — Portfolio Risk"
              text={portfolioDecision.decision === "allow"
                ? `Portfolio layer approved at $${portfolioDecision.originalRisk.toFixed(2)} risk`
                : portfolioDecision.decision === "reduce"
                  ? `Size reduced to $${(portfolioDecision.adjustedRisk ?? 0).toFixed(2)} · ${portfolioReasons.join(", ")}`
                  : `Rejected: ${portfolioReasons.join(", ")}`}
              tone={portfolioDecision.decision === "allow" ? "ok" : portfolioDecision.decision === "reduce" ? "warn" : "bad"}
            />
          )}
          {order && (
            <TimelineRow
              when={order.filledAt ?? order.createdAt}
              layer={`Layer 5 — Execution Order (${order.status})`}
              text={order.status === "filled"
                ? `Filled at ${order.filledPrice?.toFixed(5)} · size ${order.sizeUnits.toFixed(2)} · risk $${order.riskAmount.toFixed(2)}`
                : `${order.status} — ${order.rejectReason ?? "n/a"}`}
              tone={order.status === "filled" ? "ok" : "bad"}
            />
          )}
          {position && (
            <TimelineRow
              when={position.openedAt}
              layer="Layer 5 — Position Opened"
              text={`Position opened · grade ${position.grade} · thesis ${position.thesisScore}/${position.thesisState}`}
              tone="ok"
            />
          )}
          {position?.closedAt && (
            <TimelineRow
              when={position.closedAt}
              layer="Layer 5 — Position Closed"
              text={`Closed at ${position.exitPrice?.toFixed(5)} via ${position.exitReason} · realized $${position.realizedPnl.toFixed(2)}`}
              tone={position.realizedPnl > 0 ? "ok" : "bad"}
            />
          )}
          {trade && (
            <TimelineRow
              when={trade.closedAt}
              layer="Layer 4 — Outcome Labeled"
              text={`${trade.rMultiple.toFixed(2)}R result · MFE ${trade.mfe.toFixed(4)} / MAE ${trade.mae.toFixed(4)} · ${trade.durationMinutes}m`}
              tone={trade.realizedPnl > 0 ? "ok" : "bad"}
            />
          )}
          {outcome && !trade && (
            <TimelineRow
              when={outcome.labeledAt}
              layer="Layer 4 — Outcome (virtual)"
              text={`Virtual outcome: ${outcome.outcomeClass} · TP1=${outcome.tp1Hit} TP2=${outcome.tp2Hit} SL=${outcome.slHit}`}
              tone={outcome.outcomeClass === "excellent" || outcome.outcomeClass === "good" ? "ok" : "bad"}
            />
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-3">Regime at decision</h3>
          {regime ? (
            <div className="text-xs font-mono space-y-1">
              <div>structure <span className="text-foreground">{regime.structureRegime}</span></div>
              <div>volatility <span className="text-foreground">{regime.volatilityRegime}</span></div>
              <div>trend <span className="text-foreground">{regime.trendStrength} {regime.directionalBias}</span></div>
              {regime.unstable && <div className="text-yellow-400">⚠ unstable</div>}
            </div>
          ) : <p className="text-xs text-muted">No regime data.</p>}
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-3">Structure at decision</h3>
          {structure ? (
            <div className="text-xs font-mono space-y-1">
              <div>bias <span className="text-foreground">{structure.bias}</span></div>
              {structure.lastSwingHigh && <div>SH <span className="text-foreground">{structure.lastSwingHigh.toFixed(5)}</span></div>}
              {structure.lastSwingLow && <div>SL <span className="text-foreground">{structure.lastSwingLow.toFixed(5)}</span></div>}
              {structure.lastEventType && <div>last event <span className="text-foreground">{structure.lastEventType}</span></div>}
            </div>
          ) : <p className="text-xs text-muted">No structure data.</p>}
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-3">Indicators at decision</h3>
          {indicator ? (
            <div className="text-xs font-mono space-y-1">
              <div>trend <span className="text-foreground">{indicator.trendBias}</span></div>
              <div>momentum <span className="text-foreground">{indicator.momentum}</span></div>
              {indicator.rsi14 !== null && <div>RSI {indicator.rsi14.toFixed(1)} ({indicator.rsiState})</div>}
              {indicator.atrPercent !== null && <div>ATR% {indicator.atrPercent.toFixed(3)}</div>}
              {indicator.bbPercentB !== null && <div>BB %B {((indicator.bbPercentB ?? 0) * 100).toFixed(0)}%</div>}
            </div>
          ) : <p className="text-xs text-muted">No indicator data.</p>}
        </section>
      </div>
    </div>
  );
}

function TimelineRow({ when, layer, text, tone = "ok" }: { when: Date; layer: string; text: string; tone?: "ok" | "warn" | "bad" }) {
  const dotColor = tone === "bad" ? "bg-red-500" : tone === "warn" ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${dotColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold">{layer}</span>
          <span className="text-muted">{timeAgo(when)}</span>
        </div>
        <div className="text-muted mt-0.5">{text}</div>
      </div>
    </div>
  );
}
