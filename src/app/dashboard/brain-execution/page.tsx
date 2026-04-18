import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function timeAgo(date: Date): string {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function BrainExecutionPage() {
  const [account, openPositions, queuedOrders, rejectedOrders, recentTrades, recentEvents, recentGuardrails, latestPortfolio, portfolioDecisions] = await Promise.all([
    prisma.executionAccount.findUnique({ where: { name: "paper-default" } }),
    prisma.executionPosition.findMany({
      where: { status: "open" },
      orderBy: { openedAt: "desc" },
    }),
    prisma.executionOrder.findMany({
      where: { status: "queued" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.executionOrder.findMany({
      where: { status: "rejected" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.executionTrade.findMany({
      orderBy: { closedAt: "desc" },
      take: 15,
    }),
    prisma.executionEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { position: { select: { symbol: true, direction: true, grade: true } } },
    }),
    prisma.executionGuardrailLog.findMany({
      where: { passed: false },
      orderBy: { checkedAt: "desc" },
      take: 10,
    }),
    prisma.portfolioSnapshot.findFirst({ orderBy: { capturedAt: "desc" } }),
    prisma.portfolioDecisionLog.findMany({
      where: { decision: { in: ["reduce", "reject"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  if (!account) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Market Core Brain Execution</h1>
        <p className="text-muted">No execution account yet. Run a scan cycle to initialize.</p>
      </div>
    );
  }

  const equity = account.currentBalance + account.totalUnrealizedPnl;
  const equityPctFromStart = ((equity - account.startingBalance) / account.startingBalance) * 100;
  const winRate = account.totalClosedTrades > 0 ? (account.totalWins / account.totalClosedTrades) * 100 : 0;
  const equityClass = equity >= account.startingBalance ? "text-green-400" : "text-red-400";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market Core Brain Execution</h1>
          <p className="text-sm text-muted mt-1">
            {account.mode === "paper" ? "Paper trading" : "Live trading"} · {account.name} ·
            {account.autoExecuteEnabled && !account.killSwitchEngaged ? (
              <span className="ml-1 text-green-400">AUTO</span>
            ) : (
              <span className="ml-1 text-red-400">HALTED</span>
            )}
          </p>
        </div>
        <Link href="/dashboard/brain" className="text-sm text-muted hover:text-foreground underline underline-offset-4">
          ← Brain
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted uppercase tracking-wide">Equity</div>
          <div className={`text-2xl font-bold mt-1 ${equityClass}`}>${equity.toFixed(2)}</div>
          <div className={`text-xs mt-0.5 ${equityClass}`}>
            {equityPctFromStart >= 0 ? "+" : ""}{equityPctFromStart.toFixed(2)}% from start
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted uppercase tracking-wide">Balance / Unrealized</div>
          <div className="text-xl font-semibold mt-1">${account.currentBalance.toFixed(2)}</div>
          <div className={`text-xs mt-0.5 ${account.totalUnrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {account.totalUnrealizedPnl >= 0 ? "+" : ""}${account.totalUnrealizedPnl.toFixed(2)} unrealized
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted uppercase tracking-wide">Open / Closed Trades</div>
          <div className="text-xl font-semibold mt-1">
            {openPositions.length} / {account.totalClosedTrades}
          </div>
          <div className={`text-xs mt-0.5 ${winRate >= 55 ? "text-green-400" : winRate > 0 ? "text-yellow-400" : "text-muted"}`}>
            {account.totalClosedTrades > 0 ? `${winRate.toFixed(0)}% win rate` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted uppercase tracking-wide">Today's P&L</div>
          <div className={`text-xl font-semibold mt-1 ${account.dailyPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {account.dailyPnl >= 0 ? "+" : ""}${account.dailyPnl.toFixed(2)}
          </div>
          <div className="text-xs mt-0.5 text-muted">Limit: -{account.maxDailyLossPct}%</div>
        </div>
      </div>

      {latestPortfolio && (() => {
        const catBreakdown = (() => { try { return JSON.parse(latestPortfolio.categoryBreakdownJson); } catch { return {}; } })() as Record<string, number>;
        const ccyExposure = (() => { try { return JSON.parse(latestPortfolio.currencyExposureJson); } catch { return {}; } })() as Record<string, number>;
        const riskPctClass = latestPortfolio.totalRiskPct > account.maxTotalRiskPct * 0.8 ? "text-red-400" : latestPortfolio.totalRiskPct > account.maxTotalRiskPct * 0.6 ? "text-yellow-400" : "text-green-400";
        const ddClass = latestPortfolio.drawdownPct > 5 ? "text-red-400" : latestPortfolio.drawdownPct > 2 ? "text-yellow-400" : "text-green-400";
        return (
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
              Portfolio Exposure
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-xs text-muted uppercase tracking-wide">Total Risk</div>
                <div className={`text-lg font-bold ${riskPctClass}`}>
                  {latestPortfolio.totalRiskPct.toFixed(2)}%
                </div>
                <div className="text-xs text-muted">${latestPortfolio.totalRiskAmount.toFixed(2)} / cap {account.maxTotalRiskPct}%</div>
              </div>
              <div>
                <div className="text-xs text-muted uppercase tracking-wide">Long / Short</div>
                <div className="text-lg font-bold">
                  <span className="text-green-400">{latestPortfolio.longCount}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-red-400">{latestPortfolio.shortCount}</span>
                </div>
                <div className="text-xs text-muted">cap {account.maxSameDirectionPositions} each side</div>
              </div>
              <div>
                <div className="text-xs text-muted uppercase tracking-wide">Drawdown</div>
                <div className={`text-lg font-bold ${ddClass}`}>{latestPortfolio.drawdownPct.toFixed(2)}%</div>
                <div className="text-xs text-muted">from equity high ${account.equityHigh.toFixed(0)}</div>
              </div>
              <div>
                <div className="text-xs text-muted uppercase tracking-wide">Weekly P&L</div>
                <div className={`text-lg font-bold ${account.weeklyPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {account.weeklyPnl >= 0 ? "+" : ""}${account.weeklyPnl.toFixed(2)}
                </div>
                <div className="text-xs text-muted">limit -{account.weeklyLossLimitPct}%</div>
              </div>
            </div>
            {(Object.keys(catBreakdown).length > 0 || Object.keys(ccyExposure).length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-muted uppercase tracking-wide mb-2">By Asset Class</div>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(catBreakdown).map(([k, v]) => (
                      <span key={k} className="px-2 py-0.5 rounded border border-border/60 font-mono">
                        {k} · {v}
                      </span>
                    ))}
                    {Object.keys(catBreakdown).length === 0 && <span className="text-muted">—</span>}
                  </div>
                </div>
                <div>
                  <div className="text-muted uppercase tracking-wide mb-2">Currency Exposure</div>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(ccyExposure).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                      <span key={k} className={`px-2 py-0.5 rounded border font-mono ${v > account.maxCurrencyExposurePct * 0.8 ? "border-red-500/40 text-red-400" : "border-border/60"}`}>
                        {k} · {v}%
                      </span>
                    ))}
                    {Object.keys(ccyExposure).length === 0 && <span className="text-muted">—</span>}
                  </div>
                </div>
              </div>
            )}
            {portfolioDecisions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/40">
                <div className="text-xs text-muted uppercase tracking-wide mb-2">Recent Portfolio Decisions</div>
                <div className="space-y-1 text-xs">
                  {portfolioDecisions.map((d) => {
                    const reasons = (() => { try { return JSON.parse(d.reasons); } catch { return []; } })() as string[];
                    return (
                      <div key={d.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${d.decision === "reject" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                            {d.decision}
                          </span>
                          <span className="text-muted">{reasons.join(" · ")}</span>
                        </div>
                        <span className="text-muted">{timeAgo(d.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })()}

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
          Open Positions ({openPositions.length})
        </h2>
        {openPositions.length === 0 ? (
          <p className="text-sm text-muted">No open positions. Engine fills A+/A qualified setups automatically.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border/40">
                  <th className="text-left py-2 pr-3">Symbol · TF</th>
                  <th className="text-left px-2">Dir · Grade</th>
                  <th className="text-right px-2">Entry</th>
                  <th className="text-right px-2">SL</th>
                  <th className="text-right px-2">TP1</th>
                  <th className="text-right px-2">Size</th>
                  <th className="text-right px-2">Risk</th>
                  <th className="text-right px-2">Unreal PnL</th>
                  <th className="text-right px-2">MFE / MAE</th>
                  <th className="text-right px-2">Thesis</th>
                  <th className="text-right pl-2">Age</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((p) => {
                  const isBull = p.direction === "bullish";
                  const pnlClass = p.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400";
                  const thesisClass =
                    p.thesisState === "strong" ? "text-green-400"
                      : p.thesisState === "weakening" ? "text-yellow-400"
                        : p.thesisState === "damaged" ? "text-orange-400"
                          : "text-red-400";
                  return (
                    <tr key={p.id} className="border-b border-border/20 last:border-0">
                      <td className="py-2 pr-3 font-mono">{p.symbol} · {p.timeframe}</td>
                      <td className="px-2">
                        <span className={isBull ? "text-green-400" : "text-red-400"}>{isBull ? "LONG" : "SHORT"}</span>
                        <span className="ml-2 text-muted">{p.grade}</span>
                      </td>
                      <td className="text-right px-2 font-mono">{p.entry.toFixed(5)}</td>
                      <td className="text-right px-2 font-mono text-red-400/80">{p.stopLoss.toFixed(5)}</td>
                      <td className="text-right px-2 font-mono text-green-400/80">{p.takeProfit1.toFixed(5)}</td>
                      <td className="text-right px-2 font-mono">{p.sizeUnits.toFixed(2)}</td>
                      <td className="text-right px-2 font-mono">${p.riskAmount.toFixed(2)}</td>
                      <td className={`text-right px-2 font-mono ${pnlClass}`}>
                        {p.unrealizedPnl >= 0 ? "+" : ""}${p.unrealizedPnl.toFixed(2)}
                      </td>
                      <td className="text-right px-2 font-mono text-muted">
                        {p.mfe.toFixed(4)} / {p.mae.toFixed(4)}
                      </td>
                      <td className={`text-right px-2 font-mono ${thesisClass}`}>
                        {p.thesisScore} · {p.thesisState}
                      </td>
                      <td className="text-right pl-2 text-muted">{timeAgo(p.openedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Recent Closed Trades
          </h2>
          {recentTrades.length === 0 ? (
            <p className="text-sm text-muted">No closed trades yet.</p>
          ) : (
            <div className="space-y-1.5">
              {recentTrades.map((t) => {
                const win = t.realizedPnl > 0;
                return (
                  <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`font-bold ${win ? "text-green-400" : "text-red-400"}`}>
                        {win ? "+" : ""}${t.realizedPnl.toFixed(2)}
                      </span>
                      <span className="font-mono">{t.symbol} · {t.timeframe}</span>
                      <span className="text-muted uppercase">{t.direction}</span>
                      <span className="text-muted">{t.grade}</span>
                    </div>
                    <div className="flex gap-3 text-muted">
                      <span className={t.rMultiple >= 0 ? "text-green-400" : "text-red-400"}>
                        {t.rMultiple.toFixed(2)}R
                      </span>
                      <span className="uppercase">{t.exitReason.replace(/_/g, " ")}</span>
                      <span>{timeAgo(t.closedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
            Recent Events
          </h2>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted">No events yet.</p>
          ) : (
            <div className="space-y-1.5">
              {recentEvents.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 font-mono uppercase text-[10px] rounded bg-muted/10 text-muted">
                      {e.eventType.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono">{e.position?.symbol}</span>
                    <span className="text-muted truncate max-w-[200px]">{e.reason}</span>
                  </div>
                  <span className="text-muted">{timeAgo(e.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
          Recently Rejected by Guardrails
        </h2>
        {recentGuardrails.length === 0 ? (
          <p className="text-sm text-muted">No rejections in recent history.</p>
        ) : (
          <div className="space-y-1.5">
            {recentGuardrails.map((g) => {
              const reasons = (() => {
                try { return JSON.parse(g.failureReasons); } catch { return []; }
              })() as string[];
              return (
                <div key={g.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted">{g.setupId.slice(-8)}</span>
                    <span className="text-red-400">{reasons.join(" · ")}</span>
                  </div>
                  <span className="text-muted">{timeAgo(g.checkedAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
