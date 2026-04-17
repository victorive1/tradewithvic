"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type AgentType = "supervisor" | "performance" | "debug";

const agents: { id: AgentType; name: string; desc: string; status: "active" | "idle" }[] = [
  { id: "supervisor", name: "Supervisor Agent", desc: "Monitors uptime, health checks, heartbeat intervals, and auto-restarts unhealthy bots", status: "active" },
  { id: "performance", name: "Performance Agent", desc: "Compares bots by outcome quality, risk-adjusted returns, and execution efficiency", status: "active" },
  { id: "debug", name: "Debug Agent", desc: "Investigates malfunctions, logs anomalies, traces execution paths, and generates incident reports", status: "idle" },
];

const bots = [
  { name: "FX Strength Algo", status: "healthy" as const, lastHeartbeat: "2s ago", winRate: "--", trades: 0, incidents: 0 },
  { name: "Order Block Algo", status: "healthy" as const, lastHeartbeat: "3s ago", winRate: "--", trades: 0, incidents: 0 },
  { name: "Market Direction Algo", status: "healthy" as const, lastHeartbeat: "1s ago", winRate: "--", trades: 0, incidents: 0 },
  { name: "Breakout Algo", status: "warning" as const, lastHeartbeat: "15s ago", winRate: "--", trades: 0, incidents: 1 },
  { name: "US30 Algo", status: "healthy" as const, lastHeartbeat: "2s ago", winRate: "--", trades: 0, incidents: 0 },
  { name: "Silver & Gold Algo", status: "healthy" as const, lastHeartbeat: "4s ago", winRate: "--", trades: 0, incidents: 0 },
  { name: "Algo Trading Hub", status: "healthy" as const, lastHeartbeat: "1s ago", winRate: "80%", trades: 0, incidents: 0 },
  { name: "Algo Vic", status: "offline" as const, lastHeartbeat: "5m ago", winRate: "--", trades: 0, incidents: 2 },
];

const incidentLog = [
  { time: "09:12", agent: "Supervisor", severity: "warning", msg: "Breakout Algo heartbeat delayed >10s - monitoring" },
  { time: "08:45", agent: "Debug", severity: "error", msg: "Algo Vic connection timeout - WebSocket reconnect failed" },
  { time: "08:44", agent: "Supervisor", severity: "error", msg: "Algo Vic marked offline after 3 consecutive missed heartbeats" },
  { time: "08:30", agent: "Performance", severity: "info", msg: "Daily performance snapshot captured for all active bots" },
  { time: "08:00", agent: "Supervisor", severity: "info", msg: "Morning health check complete - 7/8 bots healthy" },
];

export default function BotAgentsPage() {
  const [activeAgent, setActiveAgent] = useState<AgentType>("supervisor");

  const statusColor = (s: "healthy" | "warning" | "offline") =>
    s === "healthy" ? "bg-bull" : s === "warning" ? "bg-warn" : "bg-bear";

  const statusText = (s: "healthy" | "warning" | "offline") =>
    s === "healthy" ? "text-bull-light" : s === "warning" ? "text-warn" : "text-bear-light";

  const statusBadge = (s: "healthy" | "warning" | "offline") =>
    s === "healthy" ? "badge-bull" : s === "warning" ? "bg-warn/10 text-warn" : "badge-bear";

  const sevColor = (sev: string) =>
    sev === "error" ? "bg-bear" : sev === "warning" ? "bg-warn" : "bg-accent";

  const healthyCount = bots.filter((b) => b.status === "healthy").length;
  const warningCount = bots.filter((b) => b.status === "warning").length;
  const offlineCount = bots.filter((b) => b.status === "offline").length;
  const totalIncidents = bots.reduce((sum, b) => sum + b.incidents, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">Bot Agents</h1>
          <span className="text-xs bg-accent/10 text-accent-light px-2.5 py-1 rounded-full border border-accent/20 font-medium">Supervisor</span>
          <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">Paper Mode</span>
        </div>
        <p className="text-sm text-muted">Management-agent architecture for monitoring, performance analysis, and debugging across all algo bots</p>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Total Bots</div>
          <div className="text-lg font-bold">{bots.length}</div>
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
        {agents.map((a) => (
          <div key={a.id} onClick={() => setActiveAgent(a.id)}
            className={cn("glass-card p-5 cursor-pointer transition-smooth border-2",
              activeAgent === a.id ? "border-accent/40" : "border-transparent hover:border-border-light")}>
            <div className="flex items-center justify-between mb-2">
              <h4 className={cn("text-sm font-bold", activeAgent === a.id ? "text-accent-light" : "text-foreground")}>{a.name}</h4>
              <span className={cn("flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full",
                a.status === "active" ? "bg-bull/10 text-bull-light" : "bg-surface-3 text-muted")}>
                <span className={cn("w-1.5 h-1.5 rounded-full", a.status === "active" ? "bg-bull" : "bg-muted")} />
                {a.status}
              </span>
            </div>
            <p className="text-[10px] text-muted leading-relaxed">{a.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Bot Health Dashboard */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-3">Bot Health Dashboard</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-6 gap-2 text-[10px] text-muted font-medium px-3 pb-1">
              <span className="col-span-2">Bot</span>
              <span>Status</span>
              <span>Heartbeat</span>
              <span>Win Rate</span>
              <span>Incidents</span>
            </div>
            {bots.map((bot) => (
              <div key={bot.name} className="grid grid-cols-6 gap-2 items-center bg-surface-2 rounded-lg p-3">
                <span className="col-span-2 text-xs font-medium text-foreground truncate">{bot.name}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded text-center", statusBadge(bot.status))}>
                  {bot.status}
                </span>
                <span className="text-[10px] font-mono text-muted">{bot.lastHeartbeat}</span>
                <span className={cn("text-[10px] font-medium", bot.winRate !== "--" ? "text-bull-light" : "text-muted")}>{bot.winRate}</span>
                <span className={cn("text-[10px] font-bold", bot.incidents > 0 ? "text-bear-light" : "text-muted")}>{bot.incidents}</span>
              </div>
            ))}
          </div>
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
                  <p>Sends heartbeat pings to every active bot every 5 seconds. If a bot misses 3 consecutive heartbeats, it is marked as offline and an alert is raised.</p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Health Checks</p>
                  <p>Validates that each bot&apos;s internal state is consistent: open positions match expected count, PnL calculations are accurate, and no stuck orders exist.</p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Auto-Recovery</p>
                  <p>Attempts to restart unhealthy bots automatically. If restart fails 3 times, the bot is suspended and the operator is notified.</p>
                </div>
              </div>
            )}
            {activeAgent === "performance" && (
              <div className="space-y-3 text-xs text-muted leading-relaxed">
                <div>
                  <p className="text-foreground font-medium mb-1">Outcome Quality</p>
                  <p>Evaluates each bot on win rate, average R:R achieved, profit factor, and maximum drawdown. Generates daily and weekly performance reports.</p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Comparative Analysis</p>
                  <p>Ranks all bots by risk-adjusted return (Sharpe-like metric). Identifies which bots are outperforming and which may need parameter adjustments.</p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Execution Quality</p>
                  <p>Measures slippage, fill rate, and latency for each bot. Flags bots with degraded execution quality for investigation by the Debug Agent.</p>
                </div>
              </div>
            )}
            {activeAgent === "debug" && (
              <div className="space-y-3 text-xs text-muted leading-relaxed">
                <div>
                  <p className="text-foreground font-medium mb-1">Malfunction Investigation</p>
                  <p>When a bot is flagged, the Debug Agent traces the execution path, inspects order logs, and identifies the root cause of the failure.</p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Anomaly Detection</p>
                  <p>Monitors for unusual patterns: unexpected position sizes, rapid sequential losses, or trades outside configured parameters.</p>
                </div>
                <div>
                  <p className="text-foreground font-medium mb-1">Incident Reports</p>
                  <p>Generates detailed incident reports with timeline, affected trades, root cause, and recommended fix. Reports are stored for post-mortem review.</p>
                </div>
              </div>
            )}
          </div>

          {/* Incident Log */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Incident Log</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {incidentLog.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="font-mono text-muted w-12 flex-shrink-0">{e.time}</span>
                  <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", sevColor(e.severity))} />
                  <span className="text-[10px] font-medium text-accent-light w-20 flex-shrink-0">{e.agent}</span>
                  <span className="text-muted-light">{e.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
