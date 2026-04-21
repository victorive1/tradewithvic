"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

type AgentType = "supervisor" | "performance" | "debug";

interface BotStatusApiRow {
  botId: string;
  name: string;
  enabled: boolean;
  running: boolean;
  status: "healthy" | "warning" | "offline" | "stale";
  lastRunAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  selectedAccounts: string;
  allowedSessions: string;
  strategyFilter: string;
  symbolFilter: string;
  signalsToday: number;
  routedToday: number;
  rejectedToday: number;
  filteredToday: number;
}

interface BotRow {
  botId: string;
  name: string;
  status: "healthy" | "warning" | "offline" | "stale";
  lastHeartbeat: string;
  signalsToday: number;
  incidents: number;
  configured: boolean;
  raw?: BotStatusApiRow;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 5) return "Just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const agents: { id: AgentType; name: string; desc: string }[] = [
  {
    id: "supervisor",
    name: "Supervisor Agent",
    desc: "Monitors uptime, health checks, heartbeat intervals, and auto-restarts unhealthy bots",
  },
  {
    id: "performance",
    name: "Performance Agent",
    desc: "Compares bots by outcome quality, risk-adjusted returns, and execution efficiency",
  },
  {
    id: "debug",
    name: "Debug Agent",
    desc: "Investigates malfunctions, logs anomalies, traces execution paths, and generates incident reports",
  },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export default function BotAgentsPage() {
  const [activeAgent, setActiveAgent] = useState<AgentType>("supervisor");
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [botRows, setBotRows] = useState<BotRow[]>([]);
  const [incidentLog, setIncidentLog] = useState<{ time: string; agent: string; severity: string; msg: string }[]>([]);
  const [quotesTimestamp, setQuotesTimestamp] = useState<number | null>(null);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [isFetchingQuotes, setIsFetchingQuotes] = useState(false);
  const [isHealthChecking, setIsHealthChecking] = useState(false);

  // Fetch bot rows from server — replaces the old localStorage-only source
  // that reported "0 configured" because it never saw the DB-backed bots.
  const fetchBotRows = useCallback(async (): Promise<BotRow[]> => {
    try {
      const res = await fetch("/api/algos/status", { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error(`status_${res.status}`);
      const data = (await res.json()) as { bots: BotStatusApiRow[] };
      return data.bots.map((b) => ({
        botId: b.botId,
        name: b.name,
        status: b.status,
        lastHeartbeat: formatRelative(b.lastRunAt),
        signalsToday: b.signalsToday,
        incidents: b.rejectedToday,
        configured: b.enabled && b.running,
        raw: b,
      }));
    } catch {
      return [];
    }
  }, []);


  // Fetch quotes for freshness indicator
  const fetchQuotes = useCallback(async () => {
    setIsFetchingQuotes(true);
    setQuotesError(null);
    try {
      const res = await fetch("/api/market/quotes");
      const data = await res.json();
      setQuotesTimestamp(data.timestamp ?? Date.now());
      if (data.error) setQuotesError(data.error);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Fetch failed";
      setQuotesError(msg);
      setQuotesTimestamp(Date.now());
    } finally {
      setIsFetchingQuotes(false);
    }
  }, []);

  // Initialize: fetch live bot state from DB
  useEffect(() => {
    fetchBotRows().then(setBotRows);
    fetchQuotes();
    // Auto-refresh every 30s so the dashboard doesn't silently decay.
    const id = window.setInterval(() => {
      fetchBotRows().then(setBotRows);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [fetchBotRows, fetchQuotes]);

  // Run health check — re-fetch from the server and summarize.
  const runHealthCheck = async () => {
    setIsHealthChecking(true);
    const rows = await fetchBotRows();
    setBotRows(rows);

    const configured = rows.filter((r) => r.configured).length;
    const active = rows.filter((r) => r.status === "healthy").length;
    const stale = rows.filter((r) => r.status === "stale").length;
    const offline = rows.filter((r) => r.status === "offline").length;
    const warning = rows.filter((r) => r.status === "warning").length;
    const routedToday = rows.reduce((n, r) => n + (r.raw?.routedToday ?? 0), 0);

    const detail = `${configured} configured · ${active} healthy · ${warning} warning · ${stale} stale · ${offline} offline · ${routedToday} trades routed today`;

    const now = formatTime(new Date());
    setIncidentLog((prev) => [
      { time: now, agent: "Supervisor", severity: "info", msg: `Health check complete. ${detail}.` },
      ...prev,
    ]);
    setIsHealthChecking(false);
    alert(`Health check complete.\n\n${detail}.`);
  };

  const restartAllBots = async () => {
    if (!confirm("Refresh bot state from the server?")) return;
    const rows = await fetchBotRows();
    setBotRows(rows);
    const now = formatTime(new Date());
    setIncidentLog((prev) => [
      { time: now, agent: "Supervisor", severity: "info", msg: "Refreshed bot state from server." },
      ...prev,
    ]);
  };

  const statusBadge = (s: BotRow["status"]) =>
    s === "healthy" ? "bg-bull/10 text-bull-light"
    : s === "warning" ? "bg-warn/10 text-warn"
    : s === "stale" ? "bg-muted/20 text-muted-light"
    : "bg-bear/10 text-bear-light";

  const sevColor = (sev: string) =>
    sev === "error" ? "bg-bear" : sev === "warning" ? "bg-warn" : "bg-accent";

  const healthyCount = botRows.filter((b) => b.status === "healthy").length;
  const warningCount = botRows.filter((b) => b.status === "warning").length;
  const offlineCount = botRows.filter((b) => b.status === "offline").length;
  const totalIncidents = botRows.reduce((sum, b) => sum + b.incidents, 0);

  const selectedBotData = selectedBot ? botRows.find((b) => b.name === selectedBot) : null;

  // Data freshness display
  const freshnessText = (() => {
    if (isFetchingQuotes) return "Fetching...";
    if (!quotesTimestamp) return "Not fetched";
    const seconds = Math.round((Date.now() - quotesTimestamp) / 1000);
    if (seconds < 5) return "Just now";
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.round(seconds / 60)}m ago`;
  })();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">Bot Agents</h1>
          <span className="text-xs bg-accent/10 text-accent-light px-2.5 py-1 rounded-full border border-accent/20 font-medium">
            Supervisor
          </span>
          <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">
            Paper Mode
          </span>
        </div>
        <p className="text-sm text-muted">
          Management-agent architecture for monitoring, performance analysis, and debugging across all algo bots
        </p>
      </div>

      {/* Data freshness bar */}
      <div className="flex items-center justify-between glass-card p-3 px-5">
        <div className="flex items-center gap-3">
          <span className={cn("w-2 h-2 rounded-full", quotesError ? "bg-warn" : "bg-bull")} />
          <span className="text-xs text-muted-light">
            Data Freshness: <span className="text-foreground font-medium">{freshnessText}</span>
          </span>
          {quotesError && <span className="text-[10px] text-warn">({quotesError})</span>}
        </div>
        <button
          onClick={fetchQuotes}
          disabled={isFetchingQuotes}
          className="text-xs text-accent-light hover:text-accent font-medium transition-smooth disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Total Bots</div>
          <div className="text-lg font-bold">{botRows.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Healthy</div>
          <div className="text-lg font-bold text-bull-light">{healthyCount}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Warning</div>
          <div className="text-lg font-bold text-warn">{warningCount}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Offline</div>
          <div className="text-lg font-bold text-bear-light">{offlineCount}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Incidents</div>
          <div className="text-lg font-bold text-warn">{totalIncidents}</div>
        </div>
      </div>

      {/* Agent cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        {agents.map((a) => {
          const isActive = activeAgent === a.id;
          return (
            <div
              key={a.id}
              onClick={() => {
                setActiveAgent(a.id);
                setSelectedBot(null);
              }}
              className={cn(
                "glass-card p-5 cursor-pointer transition-smooth border-2",
                isActive ? "border-accent/40" : "border-transparent hover:border-border-light"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className={cn("text-sm font-bold", isActive ? "text-accent-light" : "text-foreground")}>
                  {a.name}
                </h4>
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full",
                    a.id === "debug" ? "bg-surface-3 text-muted" : "bg-bull/10 text-bull-light"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", a.id === "debug" ? "bg-muted" : "bg-bull")} />
                  {a.id === "debug" ? "idle" : "active"}
                </span>
              </div>
              <p className="text-[10px] text-muted leading-relaxed">{a.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Bot Health Dashboard */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Bot Health Dashboard</h3>
            <div className="flex gap-2">
              <button
                onClick={runHealthCheck}
                disabled={isHealthChecking}
                className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20 transition-smooth disabled:opacity-50"
              >
                {isHealthChecking ? "Checking..." : "Run Health Check"}
              </button>
              <button
                onClick={restartAllBots}
                className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-bear/10 text-bear-light border border-bear/20 hover:bg-bear/20 transition-smooth"
              >
                Restart All Bots
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-6 gap-2 text-[10px] text-muted font-medium px-3 pb-1">
              <span className="col-span-2">Bot</span>
              <span>Status</span>
              <span>Heartbeat</span>
              <span>Signals</span>
              <span>Incidents</span>
            </div>
            {botRows.map((bot) => (
              <div
                key={bot.name}
                onClick={() => setSelectedBot(selectedBot === bot.name ? null : bot.name)}
                className={cn(
                  "grid grid-cols-6 gap-2 items-center rounded-lg p-3 cursor-pointer transition-smooth",
                  selectedBot === bot.name
                    ? "bg-accent/10 border border-accent/20"
                    : "bg-surface-2 hover:bg-surface-3"
                )}
              >
                <span className="col-span-2 text-xs font-medium text-foreground truncate">{bot.name}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded text-center", statusBadge(bot.status))}>
                  {bot.status}
                </span>
                <span className="text-[10px] font-mono text-muted">{bot.lastHeartbeat}</span>
                <span className="text-[10px] font-medium text-muted">{bot.signalsToday}</span>
                <span className={cn("text-[10px] font-bold", bot.incidents > 0 ? "text-bear-light" : "text-muted")}>
                  {bot.incidents}
                </span>
              </div>
            ))}
          </div>

          {/* Selected bot detail panel */}
          {selectedBotData && (
            <div className="mt-4 p-4 bg-surface-2 rounded-xl border border-border/50">
              <h4 className="text-xs font-bold text-foreground mb-3">{selectedBotData.name} · Live state</h4>
              {selectedBotData.raw ? (
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div><span className="text-muted">Enabled:</span>{" "}
                    <span className="text-foreground font-medium">{selectedBotData.raw.enabled ? "Yes" : "No"}</span>
                  </div>
                  <div><span className="text-muted">Running:</span>{" "}
                    <span className="text-foreground font-medium">{selectedBotData.raw.running ? "Yes" : "No"}</span>
                  </div>
                  <div><span className="text-muted">Strategy:</span>{" "}
                    <span className="text-foreground font-medium">{selectedBotData.raw.strategyFilter || "(all)"}</span>
                  </div>
                  <div><span className="text-muted">Symbols:</span>{" "}
                    <span className="text-foreground font-medium">{selectedBotData.raw.symbolFilter || "(all)"}</span>
                  </div>
                  <div><span className="text-muted">Sessions:</span>{" "}
                    <span className="text-foreground font-medium">{selectedBotData.raw.allowedSessions || "(any)"}</span>
                  </div>
                  <div><span className="text-muted">Accounts:</span>{" "}
                    <span className="text-foreground font-medium">{selectedBotData.raw.selectedAccounts || "(none)"}</span>
                  </div>
                  <div><span className="text-muted">Last heartbeat:</span>{" "}
                    <span className="text-foreground font-medium">{formatRelative(selectedBotData.raw.lastRunAt)}</span>
                  </div>
                  <div><span className="text-muted">Last error:</span>{" "}
                    <span className="text-foreground font-medium">{selectedBotData.raw.lastErrorAt ? formatRelative(selectedBotData.raw.lastErrorAt) : "never"}</span>
                  </div>
                  <div className="col-span-2"><span className="text-muted">Today:</span>{" "}
                    <span className="text-foreground font-medium">
                      {selectedBotData.raw.routedToday} routed · {selectedBotData.raw.filteredToday} filtered · {selectedBotData.raw.rejectedToday} rejected
                    </span>
                  </div>
                  {selectedBotData.raw.lastErrorMessage && (
                    <div className="col-span-2 mt-2 p-2 rounded bg-bear/10 border border-bear/30 text-bear-light">
                      <span className="text-[9px] uppercase tracking-wider text-bear-light/70 block mb-1">Last error message</span>
                      <span className="break-all">{selectedBotData.raw.lastErrorMessage}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted">
                  This bot has no database config yet. Open its admin page (sidebar → Admin → Algo) to save a config, or wait for the first cron cycle.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Agent Details + Incident Log */}
        <div className="space-y-4">
          {/* Active Agent Detail */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">
              {activeAgent === "supervisor" && "Supervisor Agent"}
              {activeAgent === "performance" && "Performance Agent"}
              {activeAgent === "debug" && "Debug Agent"}
            </h3>
            {activeAgent === "supervisor" && (
              <div className="space-y-3 text-xs text-muted leading-relaxed">
                <div>
                  <p className="text-foreground font-medium mb-1">Uptime Monitoring</p>
                  <p>
                    Sends heartbeat pings to every active bot every 5 seconds. If a bot misses 3 consecutive
                    heartbeats, it is marked as offline and an alert is raised.
                  </p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Health Checks</p>
                  <p>
                    Validates that each bot&apos;s internal state is consistent: open positions match expected count,
                    PnL calculations are accurate, and no stuck orders exist.
                  </p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Auto-Recovery</p>
                  <p>
                    Attempts to restart unhealthy bots automatically. If restart fails 3 times, the bot is suspended
                    and the operator is notified.
                  </p>
                </div>
              </div>
            )}
            {activeAgent === "performance" && (
              <div className="space-y-3 text-xs text-muted leading-relaxed">
                <div>
                  <p className="text-foreground font-medium mb-1">Outcome Quality</p>
                  <p>
                    Evaluates each bot on win rate, average R:R achieved, profit factor, and maximum drawdown.
                    Generates daily and weekly performance reports.
                  </p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Comparative Analysis</p>
                  <p>
                    Ranks all bots by risk-adjusted return (Sharpe-like metric). Identifies which bots are
                    outperforming and which may need parameter adjustments.
                  </p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Execution Quality</p>
                  <p>
                    Measures slippage, fill rate, and latency for each bot. Flags bots with degraded execution
                    quality for investigation by the Debug Agent.
                  </p>
                </div>
              </div>
            )}
            {activeAgent === "debug" && (
              <div className="space-y-3 text-xs text-muted leading-relaxed">
                <div>
                  <p className="text-foreground font-medium mb-1">Malfunction Investigation</p>
                  <p>
                    When a bot is flagged, the Debug Agent traces the execution path, inspects order logs, and
                    identifies the root cause of the failure.
                  </p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Anomaly Detection</p>
                  <p>
                    Monitors for unusual patterns: unexpected position sizes, rapid sequential losses, or trades
                    outside configured parameters.
                  </p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Incident Reports</p>
                  <p>
                    Generates detailed incident reports with timeline, affected trades, root cause, and recommended
                    fix. Reports are stored for post-mortem review.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Incident Log */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Incident Log</h3>
            {incidentLog.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-xs text-muted-light">No incidents recorded.</div>
                <div className="text-[10px] text-muted mt-1">All systems operating normally.</div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {incidentLog.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-muted w-16 flex-shrink-0">{e.time}</span>
                    <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", sevColor(e.severity))} />
                    <span className="text-[10px] font-medium text-accent-light w-20 flex-shrink-0">{e.agent}</span>
                    <span className="text-muted-light">{e.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
