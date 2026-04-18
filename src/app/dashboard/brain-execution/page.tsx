"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

type SubTab = "live" | "config" | "positions" | "trades" | "events";

interface ConnectedMtAccount {
  id: string;
  platform: "MT4" | "MT5";
  login: string;
  server: string;
  broker: string;
  label?: string;
}

interface ExecutionAccount {
  id: string;
  name: string;
  mode: string;
  baseCurrency: string;
  startingBalance: number;
  currentBalance: number;
  equityHigh: number;
  equityLow: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalClosedTrades: number;
  totalWins: number;
  totalLosses: number;
  dailyPnl: number;
  weeklyPnl: number;
  riskPerTradePct: number;
  maxConcurrentPositions: number;
  maxDailyLossPct: number;
  weeklyLossLimitPct: number;
  maxTotalRiskPct: number;
  maxSameDirectionPositions: number;
  maxSameAssetClassPositions: number;
  maxSameStrategyPositions: number;
  maxCurrencyExposurePct: number;
  allowedGrades: string;
  smartExitMode: string;
  executionMode: string;
  autoExecuteEnabled: boolean;
  killSwitchEngaged: boolean;
  newsFilterEnabled: boolean;
  fridayCloseProtection: boolean;
  minConfidenceScore: number;
  minRiskReward: number;
  selectedSymbolsJson: string;
  allowedSessionsJson: string;
  selectedMtAccountIdsJson: string;
}

function parseJsonArray(s: string | null | undefined, fallback: string[] = []): string[] {
  if (!s) return fallback;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ADMIN_TOKEN_KEY = "tradewithvic.brain.adminToken";
const MT_ACCOUNTS_KEY = "mt_accounts";

function readAdminToken(): string | null {
  try { return window.localStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
}

function readMtAccounts(): ConnectedMtAccount[] {
  try {
    const raw = window.localStorage.getItem(MT_ACCOUNTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

const ALL_GRADES = ["A+", "A", "candidate", "watch"];
const ALL_SESSIONS = [
  { id: "london", label: "London" },
  { id: "newyork", label: "New York" },
  { id: "overlap", label: "Overlap" },
  { id: "asia", label: "Asia" },
  { id: "crypto_24_7", label: "Crypto 24/7" },
  { id: "after_hours", label: "After Hours" },
];
const SMART_EXIT_MODES = [
  { id: "off", label: "Off", desc: "Pure TP/SL only" },
  { id: "conservative", label: "Conservative", desc: "Move to BE on damage, close on invalidation" },
  { id: "balanced", label: "Balanced", desc: "50% partial on damage, full close on invalidation" },
  { id: "aggressive", label: "Aggressive", desc: "25% partial on weakening, 75% on damage" },
];
const EXECUTION_MODES = [
  { id: "paper", label: "Paper", desc: "Virtual fills, tracked in this app" },
  { id: "mt_shadow", label: "MT Shadow", desc: "Paper fills tagged to MT account (for review)" },
  { id: "mt_live", label: "MT Live", desc: "Route orders to MT account (requires bridge)" },
];

export default function BrainExecutionPage() {
  const [tab, setTab] = useState<SubTab>("live");
  const [state, setState] = useState<any>(null);
  const [loadingState, setLoadingState] = useState(true);
  const [stateError, setStateError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const [config, setConfig] = useState<ExecutionAccount | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [mtAccounts, setMtAccounts] = useState<ConnectedMtAccount[]>([]);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setAdminToken(readAdminToken());
    setMtAccounts(readMtAccounts());
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/execution/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`state ${res.status}`);
      const data = await res.json();
      setState(data);
      setLastFetchedAt(Date.now());
      setStateError(null);
    } catch (e: any) {
      setStateError(e.message || "Failed to fetch state");
    } finally {
      setLoadingState(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/execution/config", { cache: "no-store" });
      if (!res.ok) throw new Error(`config ${res.status}`);
      const data = await res.json();
      setConfig(data);
      setConfigError(null);
    } catch (e: any) {
      setConfigError(e.message || "Failed to fetch config");
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    fetchConfig();
    pollRef.current = setInterval(fetchState, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchState, fetchConfig]);

  async function saveConfig(patch: Partial<ExecutionAccount> | Record<string, any>) {
    if (!adminToken) {
      setConfigError("Admin token not set. Unlock admin mode on /dashboard/brain first.");
      return;
    }
    setSaving(true);
    setConfigError(null);
    try {
      const res = await fetch("/api/brain/execution/config", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `save failed ${res.status}`);
      }
      const data = await res.json();
      setConfig(data);
      setSavedAt(Date.now());
      fetchState();
    } catch (e: any) {
      setConfigError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const account = state?.account ?? config;
  const equity = account ? account.currentBalance + (account.totalUnrealizedPnl ?? 0) : 0;
  const equityPctFromStart = account && account.startingBalance ? ((equity - account.startingBalance) / account.startingBalance) * 100 : 0;
  const winRate = account && account.totalClosedTrades ? (account.totalWins / account.totalClosedTrades) * 100 : 0;

  const running = account?.autoExecuteEnabled && !account?.killSwitchEngaged;

  const subtabs: { id: SubTab; label: string; count?: number }[] = [
    { id: "live", label: "Live" },
    { id: "config", label: "Config" },
    { id: "positions", label: "Positions", count: state?.positions?.length },
    { id: "trades", label: "Trades", count: state?.trades?.length },
    { id: "events", label: "Events", count: state?.events?.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">Market Core Brain Execution</h1>
            <span className={cn(
              "text-xs px-2.5 py-1 rounded-full border",
              running ? "bg-bull/10 text-bull-light border-bull/20" : "bg-bear/10 text-bear-light border-bear/20"
            )}>
              <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1", running ? "bg-bull pulse-live" : "bg-bear")} />
              {running ? "Running" : account?.killSwitchEngaged ? "Kill switch" : "Disabled"}
            </span>
            {account && (
              <span className="text-xs bg-surface-2 text-muted-light px-2 py-1 rounded-full border border-border/50 uppercase tracking-wide">
                {account.executionMode?.replace("_", " ") ?? "paper"}
              </span>
            )}
            {account && (
              <span className="text-xs bg-surface-2 text-muted-light px-2 py-1 rounded-full border border-border/50">
                Smart Exit: {account.smartExitMode}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">
            Algo that executes Layer 2 A+/A setups, applies thesis monitoring and adaptive protection post-entry.
            {lastFetchedAt && <span className="ml-2 text-[11px]">updated {Math.round((Date.now() - lastFetchedAt) / 1000)}s ago</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchState} className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-border/50 hover:border-accent transition-smooth">
            ↻ Refresh
          </button>
          <Link href="/dashboard/brain" className="text-xs px-3 py-1.5 rounded-lg text-muted hover:text-foreground underline underline-offset-4">← Brain</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {subtabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
              tab === t.id
                ? "bg-accent text-white"
                : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
            )}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {tab === "live" && (
        <LiveTab state={state} loading={loadingState} error={stateError} account={account} equity={equity} equityPctFromStart={equityPctFromStart} winRate={winRate} />
      )}
      {tab === "config" && (
        <ConfigTab
          config={config}
          loading={loadingConfig}
          error={configError}
          saving={saving}
          savedAt={savedAt}
          adminToken={adminToken}
          mtAccounts={mtAccounts}
          onSave={saveConfig}
          onRefreshToken={() => setAdminToken(readAdminToken())}
        />
      )}
      {tab === "positions" && <PositionsTab positions={state?.positions ?? []} />}
      {tab === "trades" && <TradesTab trades={state?.trades ?? []} />}
      {tab === "events" && <EventsTab events={state?.events ?? []} rejected={state?.rejectedOrders ?? []} portfolioDecisions={state?.portfolioDecisions ?? []} />}
    </div>
  );
}

function LiveTab({ state, loading, error, account, equity, equityPctFromStart, winRate }: any) {
  if (loading) return <div className="glass-card p-12 text-center text-muted">Loading live state…</div>;
  if (error) return <div className="glass-card p-6 text-sm text-bear-light">{error}</div>;
  if (!account) return <div className="glass-card p-12 text-center text-muted">No execution account yet. Trigger a scan to initialize.</div>;

  const equityClass = equity >= account.startingBalance ? "text-bull-light" : "text-bear-light";
  const portfolio = state?.portfolio;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Equity" valueClass={equityClass} value={`$${equity.toFixed(2)}`} sub={`${equityPctFromStart >= 0 ? "+" : ""}${equityPctFromStart.toFixed(2)}% from start`} />
        <StatCard label="Balance / Unreal" value={`$${account.currentBalance.toFixed(2)}`} sub={`${account.totalUnrealizedPnl >= 0 ? "+" : ""}$${account.totalUnrealizedPnl.toFixed(2)} unreal`} subClass={account.totalUnrealizedPnl >= 0 ? "text-bull-light" : "text-bear-light"} />
        <StatCard label="Trades (Open / Closed)" value={`${state?.positions?.length ?? 0} / ${account.totalClosedTrades}`} sub={account.totalClosedTrades > 0 ? `${winRate.toFixed(0)}% win` : "—"} subClass={winRate >= 55 ? "text-bull-light" : winRate > 0 ? "text-warn" : "text-muted"} />
        <StatCard label="Today's P&L" value={`${account.dailyPnl >= 0 ? "+" : ""}$${account.dailyPnl.toFixed(2)}`} sub={`Limit -${account.maxDailyLossPct}%`} valueClass={account.dailyPnl >= 0 ? "text-bull-light" : "text-bear-light"} />
      </div>

      {portfolio && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Portfolio Exposure</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted uppercase">Total Risk</div>
              <div className={cn("text-lg font-bold", portfolio.totalRiskPct > account.maxTotalRiskPct * 0.8 ? "text-bear-light" : portfolio.totalRiskPct > account.maxTotalRiskPct * 0.6 ? "text-warn" : "text-bull-light")}>
                {portfolio.totalRiskPct.toFixed(2)}%
              </div>
              <div className="text-xs text-muted">${portfolio.totalRiskAmount.toFixed(2)} / cap {account.maxTotalRiskPct}%</div>
            </div>
            <div>
              <div className="text-xs text-muted uppercase">Long / Short</div>
              <div className="text-lg font-bold"><span className="text-bull-light">{portfolio.longCount}</span><span className="text-muted"> / </span><span className="text-bear-light">{portfolio.shortCount}</span></div>
              <div className="text-xs text-muted">cap {account.maxSameDirectionPositions} each</div>
            </div>
            <div>
              <div className="text-xs text-muted uppercase">Drawdown</div>
              <div className={cn("text-lg font-bold", portfolio.drawdownPct > 5 ? "text-bear-light" : portfolio.drawdownPct > 2 ? "text-warn" : "text-bull-light")}>{portfolio.drawdownPct.toFixed(2)}%</div>
              <div className="text-xs text-muted">from ${account.equityHigh.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-xs text-muted uppercase">Weekly P&L</div>
              <div className={cn("text-lg font-bold", account.weeklyPnl >= 0 ? "text-bull-light" : "text-bear-light")}>{account.weeklyPnl >= 0 ? "+" : ""}${account.weeklyPnl.toFixed(2)}</div>
              <div className="text-xs text-muted">limit -{account.weeklyLossLimitPct}%</div>
            </div>
          </div>
        </section>
      )}

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Open Positions ({state?.positions?.length ?? 0})</h2>
        {!state?.positions || state.positions.length === 0 ? (
          <p className="text-sm text-muted">No open positions right now.</p>
        ) : (
          <PositionTable positions={state.positions} />
        )}
      </section>
    </div>
  );
}

function PositionTable({ positions }: { positions: any[] }) {
  return (
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
            <th className="text-right px-2">Unreal</th>
            <th className="text-right px-2">MFE/MAE</th>
            <th className="text-right px-2">Closed %</th>
            <th className="text-right px-2">Thesis</th>
            <th className="text-right pl-2">Age</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const isBull = p.direction === "bullish";
            const pnlClass = p.unrealizedPnl >= 0 ? "text-bull-light" : "text-bear-light";
            const thesisClass =
              p.thesisState === "strong" ? "text-bull-light"
                : p.thesisState === "weakening" ? "text-warn"
                  : p.thesisState === "damaged" ? "text-orange-400"
                    : "text-bear-light";
            return (
              <tr key={p.id} className="border-b border-border/20 last:border-0">
                <td className="py-2 pr-3 font-mono">{p.symbol} · {p.timeframe}</td>
                <td className="px-2">
                  <span className={isBull ? "text-bull-light" : "text-bear-light"}>{isBull ? "LONG" : "SHORT"}</span>
                  <span className="ml-2 text-muted">{p.grade}</span>
                </td>
                <td className="text-right px-2 font-mono">{p.entry.toFixed(5)}</td>
                <td className="text-right px-2 font-mono text-bear-light/80">{p.stopLoss.toFixed(5)}</td>
                <td className="text-right px-2 font-mono text-bull-light/80">{p.takeProfit1.toFixed(5)}</td>
                <td className="text-right px-2 font-mono">{p.sizeUnits.toFixed(2)}</td>
                <td className="text-right px-2 font-mono">${p.riskAmount.toFixed(2)}</td>
                <td className={cn("text-right px-2 font-mono", pnlClass)}>{p.unrealizedPnl >= 0 ? "+" : ""}${p.unrealizedPnl.toFixed(2)}</td>
                <td className="text-right px-2 font-mono text-muted">{p.mfe.toFixed(4)} / {p.mae.toFixed(4)}</td>
                <td className="text-right px-2 font-mono">{p.closedPct?.toFixed(0) ?? 0}%</td>
                <td className={cn("text-right px-2 font-mono", thesisClass)}>{p.thesisScore} · {p.thesisState}</td>
                <td className="text-right pl-2 text-muted">{timeAgo(p.openedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PositionsTab({ positions }: { positions: any[] }) {
  if (positions.length === 0) return <div className="glass-card p-12 text-center text-muted">No open positions.</div>;
  return <div className="glass-card p-5"><PositionTable positions={positions} /></div>;
}

function TradesTab({ trades }: { trades: any[] }) {
  if (trades.length === 0) return <div className="glass-card p-12 text-center text-muted">No closed trades yet.</div>;
  return (
    <div className="glass-card p-5">
      <div className="space-y-1.5">
        {trades.map((t) => {
          const win = t.realizedPnl > 0;
          return (
            <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
              <div className="flex items-center gap-3">
                <span className={cn("font-bold", win ? "text-bull-light" : "text-bear-light")}>{win ? "+" : ""}${t.realizedPnl.toFixed(2)}</span>
                <span className="font-mono">{t.symbol} · {t.timeframe}</span>
                <span className="text-muted uppercase">{t.direction}</span>
                <span className="text-muted">{t.grade}</span>
              </div>
              <div className="flex gap-3 text-muted">
                <span className={cn("font-mono", t.rMultiple >= 0 ? "text-bull-light" : "text-bear-light")}>{t.rMultiple.toFixed(2)}R</span>
                <span className="uppercase">{t.exitReason.replace(/_/g, " ")}</span>
                <span>{timeAgo(t.closedAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventsTab({ events, rejected, portfolioDecisions }: { events: any[]; rejected: any[]; portfolioDecisions: any[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Position Events</h2>
        {events.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
          <div className="space-y-1.5">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 font-mono uppercase text-[10px] rounded bg-surface-2 text-muted-light">{e.eventType.replace(/_/g, " ")}</span>
                  <span className="font-mono">{e.position?.symbol ?? "—"}</span>
                  <span className="text-muted truncate max-w-[260px]">{e.reason}</span>
                </div>
                <span className="text-muted">{timeAgo(e.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Rejections (Guardrails + Portfolio)</h2>
        {rejected.length === 0 && portfolioDecisions.length === 0 ? <p className="text-sm text-muted">No recent rejections.</p> : (
          <div className="space-y-1.5">
            {rejected.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 font-mono uppercase text-[10px] rounded bg-bear/10 text-bear-light">guardrail</span>
                  <span className="font-mono">{o.symbol}</span>
                  <span className="text-muted truncate max-w-[220px]">{o.rejectReason}</span>
                </div>
                <span className="text-muted">{timeAgo(o.createdAt)}</span>
              </div>
            ))}
            {portfolioDecisions.map((d) => {
              const reasons = (() => { try { return JSON.parse(d.reasons); } catch { return []; } })() as string[];
              return (
                <div key={d.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("px-1.5 py-0.5 text-[10px] font-bold uppercase rounded", d.decision === "reject" ? "bg-bear/10 text-bear-light" : "bg-warn/10 text-warn")}>
                      portfolio {d.decision}
                    </span>
                    <span className="text-muted">{reasons.join(" · ")}</span>
                  </div>
                  <span className="text-muted">{timeAgo(d.createdAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, sub, valueClass, subClass }: { label: string; value: string; sub?: string; valueClass?: string; subClass?: string }) {
  return (
    <div className="glass-card p-4">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className={cn("text-xl font-bold mt-1", valueClass)}>{value}</div>
      {sub && <div className={cn("text-xs mt-0.5 text-muted", subClass)}>{sub}</div>}
    </div>
  );
}

function ConfigTab({
  config,
  loading,
  error,
  saving,
  savedAt,
  adminToken,
  mtAccounts,
  onSave,
  onRefreshToken,
}: {
  config: ExecutionAccount | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  savedAt: number | null;
  adminToken: string | null;
  mtAccounts: ConnectedMtAccount[];
  onSave: (patch: any) => Promise<void>;
  onRefreshToken: () => void;
}) {
  const [draft, setDraft] = useState<ExecutionAccount | null>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  if (loading || !draft) return <div className="glass-card p-12 text-center text-muted">Loading config…</div>;

  const allowedGrades = parseJsonArray(draft.allowedGrades, ["A+", "A"]);
  const selectedSymbols = parseJsonArray(draft.selectedSymbolsJson, []);
  const allowedSessions = parseJsonArray(draft.allowedSessionsJson, ["london", "newyork", "overlap", "crypto_24_7"]);
  const selectedMtAccountIds = parseJsonArray(draft.selectedMtAccountIdsJson, []);

  function patchDraft<K extends keyof ExecutionAccount>(key: K, value: ExecutionAccount[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleGrade(g: string) {
    const next = allowedGrades.includes(g) ? allowedGrades.filter((x) => x !== g) : [...allowedGrades, g];
    patchDraft("allowedGrades", JSON.stringify(next));
  }
  function toggleSession(id: string) {
    const next = allowedSessions.includes(id) ? allowedSessions.filter((x) => x !== id) : [...allowedSessions, id];
    patchDraft("allowedSessionsJson", JSON.stringify(next));
  }
  function toggleSymbol(sym: string) {
    const next = selectedSymbols.includes(sym) ? selectedSymbols.filter((x) => x !== sym) : [...selectedSymbols, sym];
    patchDraft("selectedSymbolsJson", JSON.stringify(next));
  }
  function toggleMtAccount(id: string) {
    const next = selectedMtAccountIds.includes(id) ? selectedMtAccountIds.filter((x) => x !== id) : [...selectedMtAccountIds, id];
    patchDraft("selectedMtAccountIdsJson", JSON.stringify(next));
  }

  async function handleSaveAll() {
    if (!draft) return;
    const patch: any = {
      autoExecuteEnabled: draft.autoExecuteEnabled,
      killSwitchEngaged: draft.killSwitchEngaged,
      smartExitMode: draft.smartExitMode,
      executionMode: draft.executionMode,
      riskPerTradePct: draft.riskPerTradePct,
      minConfidenceScore: draft.minConfidenceScore,
      minRiskReward: draft.minRiskReward,
      maxConcurrentPositions: draft.maxConcurrentPositions,
      maxDailyLossPct: draft.maxDailyLossPct,
      weeklyLossLimitPct: draft.weeklyLossLimitPct,
      maxTotalRiskPct: draft.maxTotalRiskPct,
      maxSameDirectionPositions: draft.maxSameDirectionPositions,
      maxSameAssetClassPositions: draft.maxSameAssetClassPositions,
      maxSameStrategyPositions: draft.maxSameStrategyPositions,
      maxCurrencyExposurePct: draft.maxCurrencyExposurePct,
      newsFilterEnabled: draft.newsFilterEnabled,
      fridayCloseProtection: draft.fridayCloseProtection,
      allowedGrades,
      selectedSymbols,
      allowedSessions,
      selectedMtAccountIds,
    };
    await onSave(patch);
  }

  return (
    <div className="space-y-6">
      {!adminToken && (
        <div className="glass-card p-4 border border-warn/30 bg-warn/5 text-sm flex items-center justify-between">
          <div>
            <div className="font-semibold text-warn">Admin token required to save</div>
            <div className="text-xs text-muted mt-1">
              Unlock admin mode by visiting <code className="font-mono bg-surface-2 px-1.5 py-0.5 rounded">/dashboard/brain?admin=YOUR_TOKEN</code> once.
            </div>
          </div>
          <button onClick={onRefreshToken} className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-border/50">Re-check</button>
        </div>
      )}
      {error && <div className="glass-card p-3 text-sm text-bear-light">{error}</div>}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Brain Execution · Algo Config</h2>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-bull-light">Saved {timeAgo(new Date(savedAt).toISOString())}</span>}
          <button
            onClick={handleSaveAll}
            disabled={saving || !adminToken}
            className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50 transition-smooth"
          >
            {saving ? "Saving…" : "Save All Config"}
          </button>
        </div>
      </div>

      {/* Master switches */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Master Controls</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ToggleRow
            label="Auto Execute"
            desc="Master switch — turn off to pause all new fills"
            checked={draft.autoExecuteEnabled}
            onChange={(v) => patchDraft("autoExecuteEnabled", v)}
          />
          <ToggleRow
            label="Kill Switch"
            desc="Emergency halt — blocks every order regardless of other settings"
            checked={draft.killSwitchEngaged}
            onChange={(v) => patchDraft("killSwitchEngaged", v)}
            danger
          />
          <div className="bg-surface-2 rounded-xl p-3">
            <div className="text-xs font-medium text-foreground">Execution Mode</div>
            <div className="text-[10px] text-muted mb-2">Where orders get routed</div>
            <select
              value={draft.executionMode}
              onChange={(e) => patchDraft("executionMode", e.target.value)}
              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-foreground"
            >
              {EXECUTION_MODES.map((m) => (
                <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grades & rating filter */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Rating Filter</h3>
        <p className="text-xs text-muted mb-3">Only setups with one of the selected grades AND score ≥ min will fill.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {ALL_GRADES.map((g) => (
            <button
              key={g}
              onClick={() => toggleGrade(g)}
              className={cn("px-4 py-2 rounded-xl text-xs font-semibold transition-smooth",
                allowedGrades.includes(g) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
              {g}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Min Confidence Score (0-100)" value={draft.minConfidenceScore} onChange={(v) => patchDraft("minConfidenceScore", v)} min={0} max={100} />
          <NumField label="Min Risk-Reward Ratio" value={draft.minRiskReward} onChange={(v) => patchDraft("minRiskReward", v)} min={0.5} max={10} step={0.1} />
        </div>
      </div>

      {/* Position sizing & risk */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Risk Sizing</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <NumField label="Risk % Per Trade" value={draft.riskPerTradePct} onChange={(v) => patchDraft("riskPerTradePct", v)} min={0.1} max={10} step={0.1} />
          <NumField label="Max Concurrent Positions" value={draft.maxConcurrentPositions} onChange={(v) => patchDraft("maxConcurrentPositions", Math.round(v))} min={1} max={20} />
          <NumField label="Max Total Risk %" value={draft.maxTotalRiskPct} onChange={(v) => patchDraft("maxTotalRiskPct", v)} min={1} max={20} step={0.5} />
          <NumField label="Daily Loss Limit %" value={draft.maxDailyLossPct} onChange={(v) => patchDraft("maxDailyLossPct", v)} min={0.5} max={20} step={0.5} />
          <NumField label="Weekly Loss Limit %" value={draft.weeklyLossLimitPct} onChange={(v) => patchDraft("weeklyLossLimitPct", v)} min={1} max={25} step={0.5} />
          <NumField label="Max Currency Exposure %" value={draft.maxCurrencyExposurePct} onChange={(v) => patchDraft("maxCurrencyExposurePct", v)} min={20} max={100} step={5} />
          <NumField label="Max Same-Direction" value={draft.maxSameDirectionPositions} onChange={(v) => patchDraft("maxSameDirectionPositions", Math.round(v))} min={1} max={10} />
          <NumField label="Max Same Asset Class" value={draft.maxSameAssetClassPositions} onChange={(v) => patchDraft("maxSameAssetClassPositions", Math.round(v))} min={1} max={10} />
          <NumField label="Max Same Strategy" value={draft.maxSameStrategyPositions} onChange={(v) => patchDraft("maxSameStrategyPositions", Math.round(v))} min={1} max={10} />
        </div>
      </div>

      {/* Smart Exit + Adaptive Protection */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Smart Exit Mode (Layers 11 + 12)</h3>
        <p className="text-xs text-muted mb-3">Controls how thesis monitoring translates into partial exits, SL tightening, and move-to-breakeven.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {SMART_EXIT_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => patchDraft("smartExitMode", m.id)}
              className={cn(
                "text-left p-3 rounded-xl border transition-smooth",
                draft.smartExitMode === m.id
                  ? "border-accent bg-accent/10"
                  : "border-border/50 bg-surface-2 hover:border-border-light"
              )}
            >
              <div className="text-sm font-semibold">{m.label}</div>
              <div className="text-xs text-muted mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Safety filters */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Safety Filters</h3>
        <ToggleRow
          label="News Filter"
          desc="Block fills when a high-impact economic event is imminent"
          checked={draft.newsFilterEnabled}
          onChange={(v) => patchDraft("newsFilterEnabled", v)}
        />
        <ToggleRow
          label="Friday Close Protection"
          desc="Stop taking new FX/metals/indices trades after Friday 20:00 UTC"
          checked={draft.fridayCloseProtection}
          onChange={(v) => patchDraft("fridayCloseProtection", v)}
        />
      </div>

      {/* Sessions */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Allowed Sessions</h3>
        <div className="flex flex-wrap gap-2">
          {ALL_SESSIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleSession(s.id)}
              className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
                allowedSessions.includes(s.id) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Symbol whitelist */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Instrument Whitelist</h3>
        <p className="text-xs text-muted mb-3">Leave empty to trade all scanned instruments (BTC, EUR/USD, XAU/USD, etc.). Pick specific ones to limit the algo's scope.</p>
        <div className="flex flex-wrap gap-2">
          {ALL_INSTRUMENTS.map((inst) => (
            <button
              key={inst.symbol}
              onClick={() => toggleSymbol(inst.symbol)}
              className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth",
                selectedSymbols.includes(inst.symbol) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
              {inst.displayName}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => patchDraft("selectedSymbolsJson", JSON.stringify([]))} className="text-[10px] text-muted hover:text-muted-light">Clear (allow all)</button>
        </div>
      </div>

      {/* MT accounts */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">MT Trading Accounts</h3>
        <p className="text-xs text-muted mb-3">
          When execution mode is <span className="font-mono text-foreground">mt_shadow</span> or <span className="font-mono text-foreground">mt_live</span>, selected accounts will mirror or receive orders.
          Connect accounts via <Link href="/dashboard/trading-hub" className="text-accent-light underline">Trading Hub</Link>.
        </p>
        {mtAccounts.length === 0 ? (
          <p className="text-xs text-muted">No MT accounts connected in this browser.</p>
        ) : (
          <div className="space-y-2">
            {mtAccounts.map((acct) => (
              <div key={acct.id} className="flex items-center justify-between bg-surface-2 rounded-xl p-3">
                <div>
                  <div className="text-xs font-medium text-foreground">{acct.label || `${acct.broker} — ${acct.server}`}</div>
                  <div className="text-[10px] text-muted">{acct.platform} · {acct.login} · {acct.server}</div>
                </div>
                <ToggleSwitch checked={selectedMtAccountIds.includes(acct.id)} onChange={() => toggleMtAccount(acct.id)} />
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted mt-3 italic">
          Note: real MT order routing requires a broker bridge to be configured on the server (OANDA REST, MT bridge WebSocket, etc.). Paper + mt_shadow work today.
        </p>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div>
      <label className="text-xs text-muted-light mb-1 block">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono"
      />
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange, danger }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <div className="bg-surface-2 rounded-xl p-3 flex items-center justify-between">
      <div>
        <div className={cn("text-xs font-medium", danger && checked ? "text-bear-light" : "text-foreground")}>{label}</div>
        <div className="text-[10px] text-muted">{desc}</div>
      </div>
      <ToggleSwitch checked={checked} onChange={() => onChange(!checked)} danger={danger} />
    </div>
  );
}

function ToggleSwitch({ checked, onChange, danger }: { checked: boolean; onChange: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        "w-10 h-5 rounded-full relative transition-smooth",
        checked ? (danger ? "bg-bear" : "bg-accent") : "bg-surface-3"
      )}
    >
      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", checked ? "left-5" : "left-0.5")} />
    </button>
  );
}
