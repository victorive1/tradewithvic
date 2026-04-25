"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { ShowcaseView } from "./ShowcaseView";
import { computeOneR } from "@/lib/setups/one-r";
import { computeExposure } from "@/lib/brain/exposure";

type ViewMode = "operator" | "showcase";
const VIEW_MODE_KEY = "tradewithvic.brain.viewMode";

type SubTab = "dashboard" | "signals" | "history" | "config";

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
  requireMarketPredictionAlignment: boolean;
  minConfidenceScore: number;
  minRiskReward: number;
  selectedSymbolsJson: string;
  allowedTimeframesJson: string;
  allowedSessionsJson: string;
  selectedMtAccountIdsJson: string;
  orderPlacementMode: string;
  pendingOrderTtlMinutes: number;
  pendingEntryTolerancePct: number;
  lastCycleAt?: string | null;
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
const ALL_TIMEFRAMES = [
  { id: "4h",    label: "4h",  tag: "Swing",  desc: "Higher-TF bias, fewer but cleaner entries" },
  { id: "1h",    label: "1h",  tag: "Swing",  desc: "Structural continuation, best session overlap setups" },
  { id: "15min", label: "15m", tag: "Intra",  desc: "Intraday execution on confirmed HTF bias" },
  { id: "5min",  label: "5m",  tag: "Scalp",  desc: "Fast execution — noisier, best with tight risk" },
];
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

const ORDER_MODES = [
  { id: "instant_market", label: "Instant Market", desc: "Fill every setup immediately at the latest mark — never miss an entry." },
  { id: "pending_limit", label: "Pending Limit", desc: "Place an order at setup entry and wait for price to pull back. Best-fill quality." },
  { id: "hybrid", label: "Hybrid", desc: "Instant fills for A+ setups, pending limits for A setups. Recommended." },
];

export default function BrainExecutionPage() {
  const [tab, setTab] = useState<SubTab>("dashboard");
  const [viewMode, setViewMode] = useState<ViewMode>("operator");
  const [state, setState] = useState<any>(null);
  const [loadingState, setLoadingState] = useState(true);
  const [stateError, setStateError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<"idle" | "refreshing" | "scanning" | "success">("idle");

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
    try {
      const saved = window.localStorage.getItem(VIEW_MODE_KEY);
      if (saved === "operator" || saved === "showcase") setViewMode(saved);
    } catch {}
  }, []);

  function switchViewMode(mode: ViewMode) {
    setViewMode(mode);
    try { window.localStorage.setItem(VIEW_MODE_KEY, mode); } catch {}
  }

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

  const handleManualRefresh = useCallback(async () => {
    setRefreshStatus("scanning");
    // Kick off the scan in the background — DON'T await it so the UI stays snappy.
    // Scan cycles can take 30-60s; blocking that long would make the button feel frozen.
    fetch("/api/brain/execution/scan-now", { method: "POST", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          console.warn("scan-now returned", res.status);
          return;
        }
        // Re-fetch state again once scan completes so latest results land in UI.
        await fetchState();
      })
      .catch((err) => {
        console.warn("scan-now failed", err);
      });

    // Meanwhile, immediately re-fetch current state so the user sees *something* change.
    try {
      await fetchState();
      setRefreshStatus("success");
    } catch (e: any) {
      setStateError(e?.message || "Refresh failed");
      setRefreshStatus("idle");
      return;
    }
    // Hold the "Updated" confirmation briefly, then return to idle.
    setTimeout(() => setRefreshStatus("idle"), 1800);
  }, [fetchState]);

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
    // 60s poll — scan cycle is 2 min, so 10s was 12× overkill and just
    // burned DB cycles on the state endpoint (11 parallel Prisma queries).
    pollRef.current = setInterval(fetchState, 60_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchState, fetchConfig]);

  async function saveConfig(patch: Partial<ExecutionAccount> | Record<string, any>) {
    setSaving(true);
    setConfigError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
      const res = await fetch("/api/brain/execution/config", {
        method: "POST",
        headers,
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
    { id: "dashboard", label: "⚡ Dashboard", count: state?.positions?.length },
    { id: "signals", label: "📡 Signal Log", count: state?.signals?.length },
    { id: "history", label: "🗂 History", count: state?.trades?.length },
    { id: "config", label: "⚙ Config" },
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
        <div className="flex gap-2 items-center">
          <div className="inline-flex rounded-lg bg-surface-2 border border-border/50 p-0.5">
            <button
              onClick={() => switchViewMode("operator")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-smooth",
                viewMode === "operator" ? "bg-accent text-white" : "text-muted-light hover:text-foreground"
              )}
            >
              Operator
            </button>
            <button
              onClick={() => switchViewMode("showcase")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-smooth",
                viewMode === "showcase" ? "bg-accent text-white" : "text-muted-light hover:text-foreground"
              )}
            >
              Showcase
            </button>
          </div>
          <RefreshButton status={refreshStatus} onClick={handleManualRefresh} />

          <Link href="/dashboard/brain" className="text-xs px-3 py-1.5 rounded-lg text-muted hover:text-foreground underline underline-offset-4">← Brain</Link>
        </div>
      </div>

      {viewMode === "showcase" && <ShowcaseView state={state} mtAccounts={mtAccounts} />}
      {viewMode === "showcase" && (
        <div className="text-center text-xs text-muted">
          Showcase mode polls the same live data every 10 seconds. Switch to Operator to edit config and see full tables.
        </div>
      )}

      {viewMode === "operator" && (
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
      )}

      {viewMode === "operator" && tab === "dashboard" && (
        <LiveTab state={state} loading={loadingState} error={stateError} mtAccounts={mtAccounts} />
      )}
      {viewMode === "operator" && tab === "signals" && (
        <SignalLogTab signals={state?.signals ?? []} loading={loadingState} />
      )}
      {viewMode === "operator" && tab === "history" && (
        <HistoryTab trades={state?.trades ?? []} mtAccounts={mtAccounts} loading={loadingState} />
      )}
      {viewMode === "operator" && tab === "config" && (
        <ConfigTab
          config={config}
          loading={loadingConfig}
          error={configError}
          saving={saving}
          savedAt={savedAt}
          mtAccounts={mtAccounts}
          onSave={saveConfig}
        />
      )}
    </div>
  );
}

function RefreshButton({ status, onClick }: { status: "idle" | "refreshing" | "scanning" | "success"; onClick: () => void }) {
  const busy = status === "scanning" || status === "refreshing";
  const done = status === "success";
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative overflow-hidden text-xs font-medium px-3.5 py-2 rounded-lg border inline-flex items-center gap-2 transition-all",
        done
          ? "bg-bull/15 border-bull/40 text-bull-light"
          : busy
            ? "bg-accent/15 border-accent/50 text-accent-light shadow-[0_0_20px_rgba(129,140,248,0.25)]"
            : "bg-surface-2 border-border/50 text-foreground hover:border-accent hover:text-accent-light active:scale-95"
      )}
    >
      {/* Shimmer sweep while busy */}
      {busy && (
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(129,140,248,0.25), transparent)",
            animation: "shimmer 1.3s linear infinite",
            transform: "translateX(-100%)",
          }}
        />
      )}
      {/* Icon */}
      {done ? (
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M4 10.5l4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg
          className={cn("w-3.5 h-3.5", busy && "animate-spin")}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path d="M4 12a8 8 0 0114-5.3L20 4M20 12a8 8 0 01-14 5.3L4 20M20 4v5h-5M4 20v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span>
        {status === "scanning" ? "Scanning…" : status === "refreshing" ? "Refreshing…" : status === "success" ? "Updated" : "Refresh"}
      </span>
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </button>
  );
}

type SignalFilter = "all" | "executed" | "skipped" | "queued" | "detected";

function SignalLogTab({ signals, loading }: { signals: any[]; loading: boolean }) {
  const [filter, setFilter] = useState<SignalFilter>("all");

  const counts = useMemo(() => {
    const c = { all: signals.length, executed: 0, skipped: 0, queued: 0, detected: 0 };
    for (const s of signals) {
      const a = (s.action || "").toLowerCase();
      if (a === "executed" || a === "closed") c.executed++;
      else if (a === "skipped" || a === "expired") c.skipped++;
      else if (a === "queued") c.queued++;
      else c.detected++;
    }
    return c;
  }, [signals]);

  const filtered = useMemo(() => {
    if (filter === "all") return signals;
    return signals.filter((s) => {
      const a = (s.action || "").toLowerCase();
      if (filter === "executed") return a === "executed" || a === "closed";
      if (filter === "skipped") return a === "skipped" || a === "expired";
      if (filter === "queued") return a === "queued";
      return a === "detected";
    });
  }, [filter, signals]);

  if (loading) return <div className="glass-card p-12 text-center text-muted">Loading signals…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-muted">
          Total <span className="text-foreground font-semibold">{counts.all}</span>
          <span className="mx-2">·</span>
          Scanner <span className="text-accent-light">{signals.filter((s) => !s.action || s.action === "DETECTED").length}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            { id: "all", label: "All", count: counts.all },
            { id: "executed", label: "Executed", count: counts.executed },
            { id: "skipped", label: "Skipped", count: counts.skipped },
            { id: "queued", label: "Queued", count: counts.queued },
            { id: "detected", label: "Detected", count: counts.detected },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-smooth border",
                filter === f.id
                  ? "bg-accent/15 text-accent-light border-accent/40"
                  : "bg-surface-2 text-muted-light border-border/50 hover:border-border-light"
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card overflow-x-auto p-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted border-b border-border/40 bg-surface-2/30">
              <th className="text-left py-3 px-4">TIME</th>
              <th className="text-left px-3">SOURCE</th>
              <th className="text-left px-3">STRATEGY</th>
              <th className="text-left px-3">SYMBOL</th>
              <th className="text-left px-3">TF</th>
              <th className="text-left px-3">DIR</th>
              <th className="text-right px-3">ENTRY</th>
              <th className="text-right px-3">SL</th>
              <th className="text-right px-3">1R</th>
              <th className="text-right px-3">TP1</th>
              <th className="text-right px-3">CONF</th>
              <th className="text-left px-3">ACTION / STATUS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-12 text-muted">No signals match this filter.</td></tr>
            ) : filtered.map((s) => (
              <tr key={s.id} className="border-b border-border/20 last:border-0 hover:bg-surface-2/30 transition-smooth">
                <td className="py-3 px-4 font-mono text-muted-light">{new Date(s.time).toLocaleString()}</td>
                <td className="px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-warn/10 text-warn border border-warn/20">{s.source}</span>
                </td>
                <td className="px-3 font-semibold uppercase tracking-wide">{s.strategy?.replace(/_/g, "-")}</td>
                <td className="px-3 font-semibold">{s.symbol}</td>
                <td className="px-3 font-mono uppercase text-muted">{s.timeframe}</td>
                <td className="px-3">
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                    s.direction === "bullish" ? "bg-bull/10 text-bull-light border-bull/20" : "bg-bear/10 text-bear-light border-bear/20"
                  )}>
                    {s.direction === "bullish" ? "BUY" : "SELL"}
                  </span>
                </td>
                <td className="text-right px-3 font-mono">{s.entry ? s.entry.toFixed(s.entry > 100 ? 2 : 4) : "—"}</td>
                <td className="text-right px-3 font-mono text-bear-light/80">{s.stopLoss?.toFixed(s.stopLoss > 100 ? 2 : 4)}</td>
                <td className="text-right px-3 font-mono text-accent-light/90">
                  {s.entry != null && s.stopLoss != null ? computeOneR(s.entry, s.stopLoss, s.direction).toFixed(s.entry > 100 ? 2 : 4) : "—"}
                </td>
                <td className="text-right px-3 font-mono text-bull-light/80">{s.takeProfit1?.toFixed(s.takeProfit1 > 100 ? 2 : 4)}</td>
                <td className="text-right px-3 font-mono">
                  <span className={cn(
                    "font-semibold",
                    s.confidenceScore >= 89 ? "text-bull-light" : s.confidenceScore >= 65 ? "text-warn" : "text-muted"
                  )}>
                    {s.confidenceScore}
                  </span>
                </td>
                <td className="px-3">
                  <ActionBadge action={s.action} reason={s.actionReason} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionBadge({ action, reason }: { action: string; reason?: string | null }) {
  const base = "text-[11px] font-bold uppercase tracking-wider";
  const colorMap: Record<string, string> = {
    EXECUTED: "text-bull-light",
    CLOSED: "text-bull-light",
    SKIPPED: "text-bear-light",
    EXPIRED: "text-muted",
    QUEUED: "text-accent-light",
    DETECTED: "text-warn",
  };
  return (
    <div>
      <div className={cn(base, colorMap[action] ?? "text-muted")}>{action}</div>
      {reason && <div className="text-[10px] text-muted mt-0.5 max-w-[260px] truncate" title={reason}>{reason}</div>}
    </div>
  );
}

function HistoryTab({ trades, mtAccounts, loading }: { trades: any[]; mtAccounts: ConnectedMtAccount[]; loading: boolean }) {
  if (loading) return <div className="glass-card p-12 text-center text-muted">Loading history…</div>;
  const hasMt = mtAccounts.length > 0;

  const totalPnl = trades.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const wins = trades.filter((t) => (t.realizedPnl ?? 0) > 0).length;
  const losses = trades.filter((t) => (t.realizedPnl ?? 0) <= 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Total Trades" value={`${trades.length}`} />
        <MiniStat label="Wins / Losses" value={`${wins} / ${losses}`} valueClass={wins > losses ? "text-bull-light" : losses > wins ? "text-bear-light" : undefined} />
        <MiniStat label="Win Rate" value={trades.length ? `${winRate.toFixed(0)}%` : "—"} valueClass={winRate >= 55 ? "text-bull-light" : winRate > 0 ? "text-warn" : undefined} />
        <MiniStat label="Total P&L" value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`} valueClass={totalPnl >= 0 ? "text-bull-light" : "text-bear-light"} />
      </div>

      {!hasMt && (
        <div className="glass-card p-4 border border-accent/20 bg-accent/5 text-xs text-muted">
          <span className="text-accent-light font-semibold mr-2">Note</span>
          No MT account connected. P&L shown reflects the brain&#39;s internal algo tracking. Once an MT bridge is wired, real per-account P&L will appear here.
        </div>
      )}

      <div className="glass-card overflow-x-auto p-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted border-b border-border/40 bg-surface-2/30">
              <th className="text-left py-3 px-4">CLOSED AT</th>
              <th className="text-left px-3">SYMBOL</th>
              <th className="text-left px-3">TF</th>
              <th className="text-left px-3">DIR · GRADE</th>
              <th className="text-right px-3">ENTRY</th>
              <th className="text-right px-3">EXIT</th>
              <th className="text-right px-3">SIZE</th>
              <th className="text-right px-3">RISK</th>
              <th className="text-right px-3">P&L</th>
              <th className="text-right px-3">R MULT</th>
              <th className="text-left px-3">EXIT REASON</th>
              <th className="text-right px-3">MFE / MAE</th>
              <th className="text-right px-3 pr-4">DURATION</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr><td colSpan={13} className="text-center py-12 text-muted">No closed trades yet. History will populate as the algo exits positions.</td></tr>
            ) : trades.map((t) => {
              const win = (t.realizedPnl ?? 0) > 0;
              return (
                <tr key={t.id} className="border-b border-border/20 last:border-0 hover:bg-surface-2/30 transition-smooth">
                  <td className="py-3 px-4 font-mono text-muted-light">{new Date(t.closedAt).toLocaleString()}</td>
                  <td className="px-3 font-semibold">{t.symbol}</td>
                  <td className="px-3 font-mono text-muted">{t.timeframe}</td>
                  <td className="px-3">
                    <span className={cn("uppercase font-bold", t.direction === "bullish" ? "text-bull-light" : "text-bear-light")}>
                      {t.direction === "bullish" ? "LONG" : "SHORT"}
                    </span>
                    <span className="ml-2 text-muted">{t.grade}</span>
                  </td>
                  <td className="text-right px-3 font-mono">{t.entry?.toFixed(t.entry > 100 ? 2 : 4)}</td>
                  <td className="text-right px-3 font-mono">{t.exit?.toFixed(t.exit > 100 ? 2 : 4)}</td>
                  <td className="text-right px-3 font-mono">{t.sizeUnits?.toFixed(2)}</td>
                  <td className="text-right px-3 font-mono text-muted">${t.riskAmount?.toFixed(2)}</td>
                  <td className={cn("text-right px-3 font-mono font-bold", win ? "text-bull-light" : "text-bear-light")}>
                    {win ? "+" : ""}${t.realizedPnl?.toFixed(2)}
                  </td>
                  <td className={cn("text-right px-3 font-mono", (t.rMultiple ?? 0) >= 0 ? "text-bull-light" : "text-bear-light")}>
                    {t.rMultiple?.toFixed(2)}R
                  </td>
                  <td className="px-3 uppercase text-muted text-[10px]">{t.exitReason?.replace(/_/g, " ")}</td>
                  <td className="text-right px-3 font-mono text-muted text-[10px]">{t.mfe?.toFixed(4)} / {t.mae?.toFixed(4)}</td>
                  <td className="text-right px-3 pr-4 font-mono text-muted">{t.durationMinutes}m</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LiveTab({ state, loading, error, mtAccounts }: { state: any; loading: boolean; error: string | null; mtAccounts: ConnectedMtAccount[] }) {
  if (loading) return <div className="glass-card p-12 text-center text-muted">Loading live state…</div>;
  if (error) return <div className="glass-card p-6 text-sm text-bear-light">{error}</div>;

  const hasMt = mtAccounts.length > 0;
  const activeSignals = state?.positions ?? [];
  const recentEvents = state?.events ?? [];
  const latestCycle = state?.latestCycle;
  const pendingOrders = state?.pendingOrders ?? [];
  const health = state?.health;

  return (
    <div className="space-y-6">
      {health && <EngineHealthPanel health={health} />}

      {!hasMt ? (
        <section className="glass-card p-10 text-center space-y-4 border border-accent/20">
          <div className="text-5xl">🔌</div>
          <h3 className="text-xl font-semibold text-foreground">No trading account connected</h3>
          <p className="text-sm text-muted max-w-xl mx-auto">
            Connect your MT4 or MT5 account in Trading Hub. Once connected, this page will show your real account balance, equity, positions, and any trades the Market Core Brain algo routes to your broker.
          </p>
          <Link
            href="/dashboard/trading-hub"
            className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent"
          >
            Connect MT Account
          </Link>
        </section>
      ) : (
        <MtAccountsPanel accounts={mtAccounts} />
      )}

      {pendingOrders.length > 0 && <PendingOrdersPanel orders={pendingOrders} />}

      <BrainSignalSummary cycle={latestCycle} signals={activeSignals} events={recentEvents} />
    </div>
  );
}

function EngineHealthPanel({ health }: { health: any }) {
  const overallClass = health.overall === "healthy" ? "border-bull/40 bg-bull/5 text-bull-light"
    : health.overall === "degraded" ? "border-warn/40 bg-warn/5 text-warn"
      : "border-bear/40 bg-bear/5 text-bear-light";
  const overallLabel = health.overall === "healthy" ? "ALL SYSTEMS HEALTHY"
    : health.overall === "degraded" ? "DEGRADED"
      : "CRITICAL";
  const pulse = health.overall !== "critical";
  return (
    <section className={cn("rounded-xl border p-4", overallClass)}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            {pulse && (
              <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                health.overall === "healthy" ? "bg-bull" : "bg-warn")} />
            )}
            <span className={cn("relative inline-flex rounded-full h-3 w-3",
              health.overall === "healthy" ? "bg-bull" : health.overall === "degraded" ? "bg-warn" : "bg-bear")} />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">Engine Health</div>
            <div className="text-sm font-bold">{overallLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <HealthTile label="Engine" status={health.engineHealth} detail={
            health.engineHealth === "critical" ? "Kill switch" : health.engineHealth === "degraded" ? "Auto paused" : "Auto live"
          } />
          <HealthTile label="Scan" status={health.scanHealth} detail={
            health.scanAgeSec !== null ? `${health.scanAgeSec}s ago` : "No scans"
          } />
          <HealthTile label="Feed" status={health.feedHealth} detail={
            health.feedAgeSec !== null ? `${health.feedAgeSec}s ago` : "No data"
          } />
          <HealthTile label="Errors (20 cyc)" status={health.errorHealth} detail={`${health.cycleErrors}`} />
        </div>
      </div>
      {health.openAlerts?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-current/20 text-xs">
          <div className="opacity-70 uppercase tracking-wider text-[10px] mb-1">Recent alerts ({health.openAlerts.length})</div>
          <ul className="space-y-0.5">
            {health.openAlerts.slice(0, 3).map((a: any) => (
              <li key={a.id} className="opacity-90">
                <span className="font-mono text-[10px] uppercase mr-2 opacity-70">{a.level}</span>
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function HealthTile({ label, status, detail }: { label: string; status: string; detail: string }) {
  const dot = status === "healthy" ? "bg-bull" : status === "degraded" ? "bg-warn" : "bg-bear";
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-background/30 border border-current/20">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      <span className="opacity-80 uppercase text-[10px] tracking-wider">{label}</span>
      <span className="font-mono text-[11px] opacity-90">{detail}</span>
    </div>
  );
}

function PendingOrdersPanel({ orders }: { orders: any[] }) {
  return (
    <section className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Pending Orders ({orders.length})</h2>
        <span className="text-[11px] text-muted">Filled when price touches entry · auto-cancelled when setup expires or CHoCH invalidates direction</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted border-b border-border/40">
              <th className="text-left py-2 pr-3">CREATED</th>
              <th className="text-left px-2">SYMBOL · TF</th>
              <th className="text-left px-2">DIR · GRADE</th>
              <th className="text-left px-2">TYPE</th>
              <th className="text-right px-2">ENTRY</th>
              <th className="text-right px-2">SL</th>
              <th className="text-right px-2">1R</th>
              <th className="text-right px-2">TP1</th>
              <th className="text-right px-2">RISK</th>
              <th className="text-right px-2">EXPIRES</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-border/20 last:border-0">
                <td className="py-2 pr-3 font-mono text-muted-light">{timeAgo(o.createdAt)}</td>
                <td className="px-2 font-mono">{o.symbol} · {o.timeframe}</td>
                <td className="px-2">
                  <span className={cn("uppercase font-bold", o.direction === "bullish" ? "text-bull-light" : "text-bear-light")}>
                    {o.direction === "bullish" ? "LONG" : "SHORT"}
                  </span>
                  <span className="ml-2 text-muted">{o.grade}</span>
                </td>
                <td className="px-2 uppercase text-muted text-[10px]">{o.orderType?.replace(/_/g, " ")}</td>
                <td className="text-right px-2 font-mono">{o.entry?.toFixed(o.entry > 100 ? 2 : 5)}</td>
                <td className="text-right px-2 font-mono text-bear-light/80">{o.stopLoss?.toFixed(o.stopLoss > 100 ? 2 : 5)}</td>
                <td className="text-right px-2 font-mono text-accent-light/90">
                  {o.entry != null && o.stopLoss != null ? computeOneR(o.entry, o.stopLoss, o.direction).toFixed(o.entry > 100 ? 2 : 5) : "—"}
                </td>
                <td className="text-right px-2 font-mono text-bull-light/80">{o.takeProfit1?.toFixed(o.takeProfit1 > 100 ? 2 : 5)}</td>
                <td className="text-right px-2 font-mono">${o.riskAmount?.toFixed(2)}</td>
                <td className="text-right px-2 font-mono text-muted">
                  {o.validUntil ? timeRemaining(o.validUntil) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function timeRemaining(iso: string): string {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (s <= 0) return "expiring";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function MtAccountsPanel({ accounts }: { accounts: ConnectedMtAccount[] }) {
  return (
    <section className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Connected MT Accounts ({accounts.length})</h2>
        <Link href="/dashboard/trading-hub" className="text-xs text-accent-light hover:text-accent underline underline-offset-4">Manage in Trading Hub →</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-xl border border-border/60 bg-surface-2 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-bull pulse-live" />
                <span className="text-sm font-semibold">{a.label || `${a.broker} · ${a.login}`}</span>
              </div>
              <span className="text-[10px] bg-surface px-2 py-0.5 rounded uppercase tracking-wider text-muted">{a.platform}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted uppercase tracking-wider text-[10px]">Broker</div>
                <div className="font-medium">{a.broker}</div>
              </div>
              <div>
                <div className="text-muted uppercase tracking-wider text-[10px]">Login</div>
                <div className="font-mono">{a.login}</div>
              </div>
              <div className="col-span-2">
                <div className="text-muted uppercase tracking-wider text-[10px]">Server</div>
                <div className="text-xs font-mono">{a.server}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted uppercase tracking-wider text-[10px]">Balance</span>
                <span className="font-mono text-muted">pending bridge</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted uppercase tracking-wider text-[10px]">Equity</span>
                <span className="font-mono text-muted">pending bridge</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted uppercase tracking-wider text-[10px]">Open Positions</span>
                <span className="font-mono text-muted">pending bridge</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted italic mt-3">
        Live balance, equity, and positions for each MT account require a server-side broker bridge to be configured. Once wired, real values replace the "pending bridge" placeholders here.
      </p>
    </section>
  );
}

function BrainSignalSummary({ cycle, signals, events }: { cycle: any; signals: any[]; events: any[] }) {
  const cycleAge = cycle ? Math.round((Date.now() - new Date(cycle.startedAt).getTime()) / 1000) : null;
  return (
    <section className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Brain Algo Signals (Live)</h2>
        {cycle && (
          <span className="text-[11px] text-muted font-mono">
            last scan {cycleAge !== null ? `${cycleAge}s ago` : "—"} · {cycle.quotesFetched} quotes · {cycle.candlesFetched} new candles
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MiniStat label="Active signals" value={`${signals.length}`} />
        <MiniStat label="Recent events" value={`${events.length}`} />
        <MiniStat label="Last scan duration" value={cycle ? `${cycle.durationMs}ms` : "—"} />
        <MiniStat label="Cycle errors" value={cycle ? `${cycle.errorCount}` : "—"} valueClass={cycle && cycle.errorCount > 0 ? "text-bear-light" : undefined} />
      </div>
      {signals.length === 0 ? (
        <p className="text-sm text-muted">No active A-grade signals right now. Once the brain finds a qualified setup, it will appear here (and, when the MT bridge is wired, route to your connected account).</p>
      ) : (
        <PositionTable positions={signals} />
      )}
    </section>
  );
}

function MiniStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-surface-2 p-3">
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className={cn("text-lg font-bold font-mono mt-1", valueClass)}>{value}</div>
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
            <th className="text-right px-2">1R</th>
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
                <td className="text-right px-2 font-mono text-accent-light/90">{computeOneR(p.entry, p.stopLoss, p.direction).toFixed(5)}</td>
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
  return (
    <div className="space-y-3">
      <CurrencyExposureCard positions={positions} />
      <div className="glass-card p-5"><PositionTable positions={positions} /></div>
    </div>
  );
}

function CurrencyExposureCard({ positions }: { positions: any[] }) {
  const snapshot = computeExposure(
    positions.map((p) => ({ symbol: p.symbol, direction: p.direction, riskAmount: p.riskAmount ?? 0 })),
  );
  const rows = Object.values(snapshot.byCurrency).sort((a, b) => Math.abs(b.posCount) - Math.abs(a.posCount));
  const maxAbsRisk = Math.max(1, ...rows.map((r) => Math.abs(r.riskUSD)));

  if (rows.length === 0) return null;

  return (
    <section className="glass-card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Currency Exposure</h2>
        <span className="text-[11px] text-muted">
          Net per-currency risk across all open positions. Long EURUSD adds +EUR & -USD.
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const direction = r.posCount > 0 ? "LONG" : r.posCount < 0 ? "SHORT" : "FLAT";
          const dirClass =
            r.posCount > 0 ? "text-bull-light" :
            r.posCount < 0 ? "text-bear-light" :
            "text-muted";
          const widthPct = (Math.abs(r.riskUSD) / maxAbsRisk) * 100;
          const barClass = r.posCount > 0 ? "bg-bull/70" : r.posCount < 0 ? "bg-bear/70" : "bg-surface-3";
          const isOverloaded = Math.abs(r.posCount) >= 4;
          return (
            <li key={r.currency} className="flex items-center gap-3 text-xs">
              <div className="w-12 font-mono font-bold">{r.currency}</div>
              <div className={cn("w-16 text-[10px] uppercase tracking-wider font-bold", dirClass)}>
                {direction} {Math.abs(r.posCount)}
              </div>
              <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full", barClass)} style={{ width: `${widthPct}%` }} />
              </div>
              <div className="w-24 text-right font-mono text-muted-light">
                ${Math.abs(r.riskUSD).toFixed(0)} {r.posCount > 0 ? "long" : r.posCount < 0 ? "short" : ""}
              </div>
              {isOverloaded && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-bear/20 text-bear-light border border-bear/40">
                  CAP
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-muted mt-3">
        Algo runtime rejects new trades that would push net same-direction
        count past 4 on any single currency, or net % risk past the
        account&rsquo;s currency-exposure cap.
      </p>
    </section>
  );
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
  mtAccounts,
  onSave,
}: {
  config: ExecutionAccount | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  savedAt: number | null;
  mtAccounts: ConnectedMtAccount[];
  onSave: (patch: any) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ExecutionAccount | null>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  if (loading || !draft) return <div className="glass-card p-12 text-center text-muted">Loading config…</div>;

  const allowedGrades = parseJsonArray(draft.allowedGrades, ["A+", "A"]);
  const selectedSymbols = parseJsonArray(draft.selectedSymbolsJson, []);
  const allowedTimeframes = parseJsonArray(draft.allowedTimeframesJson, ["4h", "1h", "15min", "5min"]);
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
  function toggleTimeframe(tf: string) {
    const next = allowedTimeframes.includes(tf) ? allowedTimeframes.filter((x) => x !== tf) : [...allowedTimeframes, tf];
    patchDraft("allowedTimeframesJson", JSON.stringify(next));
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
      orderPlacementMode: draft.orderPlacementMode,
      pendingOrderTtlMinutes: draft.pendingOrderTtlMinutes,
      pendingEntryTolerancePct: draft.pendingEntryTolerancePct,
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
      requireMarketPredictionAlignment: draft.requireMarketPredictionAlignment,
      allowedGrades,
      selectedSymbols,
      allowedTimeframes,
      allowedSessions,
      selectedMtAccountIds,
    };
    await onSave(patch);
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-4 border border-border/50 bg-surface-2/40 text-xs text-muted flex items-start gap-3">
        <span className="font-mono text-accent-light">INFO</span>
        <span>
          This config is shared — changes affect the single paper-trading account that the engine runs against, so any viewer can tune the algo here. Use the Kill Switch to halt execution immediately.
        </span>
      </div>
      {error && <div className="glass-card p-3 text-sm text-bear-light">{error}</div>}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Brain Execution · Algo Config</h2>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-bull-light">Saved {timeAgo(new Date(savedAt).toISOString())}</span>}
          <button
            onClick={handleSaveAll}
            disabled={saving}
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

      {/* Order placement mode */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Order Placement</h3>
        <p className="text-xs text-muted mb-3">How the algo submits orders when a qualified setup appears. Hybrid is recommended: A+ setups fill instantly so we never miss them, A setups wait for a pullback for better entry quality.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
          {ORDER_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => patchDraft("orderPlacementMode", m.id)}
              className={cn(
                "text-left p-3 rounded-xl border transition-smooth",
                draft.orderPlacementMode === m.id
                  ? "border-accent bg-accent/10"
                  : "border-border/50 bg-surface-2 hover:border-border-light"
              )}
            >
              <div className="text-sm font-semibold">{m.label}</div>
              <div className="text-xs text-muted mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="Pending Order TTL (minutes)"
            value={draft.pendingOrderTtlMinutes}
            onChange={(v) => patchDraft("pendingOrderTtlMinutes", Math.round(v))}
            min={15}
            max={1440}
            step={15}
          />
          <NumField
            label="Entry Fill Tolerance (% of entry)"
            value={draft.pendingEntryTolerancePct}
            onChange={(v) => patchDraft("pendingEntryTolerancePct", v)}
            min={0.01}
            max={1}
            step={0.01}
          />
        </div>
        <p className="text-[10px] text-muted italic mt-2">
          TTL: how long a pending order stays live before auto-cancelling.
          Tolerance: how close price must come to entry to trigger a fill (e.g. 0.08% = 8bp zone).
          Pending orders are also cancelled automatically when the underlying setup expires or a CHoCH invalidates the direction.
        </p>
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
        <ToggleRow
          label="Require Market Prediction Alignment"
          desc="Veto any setup whose direction conflicts with the Market Prediction engine (also skips setups it grades NO_TRADE or neutral)"
          checked={draft.requireMarketPredictionAlignment}
          onChange={(v) => patchDraft("requireMarketPredictionAlignment", v)}
        />
      </div>

      {/* Timeframes */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">Allowed Timeframes</h3>
          <span className="text-[10px] text-muted">
            {allowedTimeframes.length === 0 ? "none — no trades will fire" : `${allowedTimeframes.length} enabled`}
          </span>
        </div>
        <p className="text-xs text-muted mb-3">
          Only setups on enabled timeframes can place trades. Deselect noisy timeframes to keep the
          algo focused on your preferred bias horizons.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_TIMEFRAMES.map((tf) => {
            const active = allowedTimeframes.includes(tf.id);
            return (
              <button
                key={tf.id}
                onClick={() => toggleTimeframe(tf.id)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-semibold transition-smooth border",
                  active
                    ? "bg-accent/15 border-accent/40 text-accent-light shadow-[0_0_16px_var(--color-accent-glow)]"
                    : "bg-surface-2 border-border/50 text-muted-light hover:border-border-light",
                )}
                title={tf.desc}
              >
                <span className="font-mono">{tf.label}</span>
                <span className="ml-2 text-[10px] opacity-70">{tf.tag}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3 text-[10px]">
          <button
            onClick={() => patchDraft("allowedTimeframesJson", JSON.stringify(ALL_TIMEFRAMES.map((t) => t.id)))}
            className="text-muted hover:text-muted-light"
          >
            Enable all
          </button>
          <span className="text-muted">·</span>
          <button
            onClick={() => patchDraft("allowedTimeframesJson", JSON.stringify([]))}
            className="text-muted hover:text-muted-light"
          >
            Disable all
          </button>
          <span className="text-muted">·</span>
          <button
            onClick={() => patchDraft("allowedTimeframesJson", JSON.stringify(["4h", "1h"]))}
            className="text-muted hover:text-muted-light"
          >
            Swing only (4h · 1h)
          </button>
          <span className="text-muted">·</span>
          <button
            onClick={() => patchDraft("allowedTimeframesJson", JSON.stringify(["15min", "5min"]))}
            className="text-muted hover:text-muted-light"
          >
            Scalp only (15m · 5m)
          </button>
        </div>
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
