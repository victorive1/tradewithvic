"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AlgoConfigPanel, useAlgoConfig, AlgoAccountsCard } from "@/components/algo/AlgoConfig";
import { AlgoBotStatusPanel } from "@/components/algo/AlgoBotStatusPanel";

/* ───────── types ───────── */
type AlgoTab = "dashboard" | "strategies" | "settings" | "trades" | "analytics" | "config";
type BotStatus = "idle" | "running" | "paused";
type OpMode = "Full Auto" | "Semi Auto" | "Paper Trade" | "Demo Only";

interface MarketQuote {
  symbol: string;
  displayName: string;
  category: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
}

interface Strategy {
  id: string;
  name: string;
  category: string;
  symbols: number;
  frequency: string;
  risk: string;
  winRate: string;
  enabled: boolean;
  grade: string;
}

interface EventLogEntry {
  id: number;
  time: string;
  message: string;
  type: "info" | "warn" | "danger" | "success";
}

interface RiskSettings {
  maxDailyTrades: number;
  maxDailyLoss: number;
  maxOpenPositions: number;
  maxSpread: number;
  pauseAfterLosses: number;
  defaultLotSize: number;
}

const DEFAULT_STRATEGIES: Strategy[] = [
  { id: "epa", name: "Elite Price Action", category: "Multi-TF", symbols: 11, frequency: "3-8/day", risk: "Low", winRate: "68%", enabled: false, grade: "A+" },
  { id: "bfvg", name: "Breakout FVG", category: "Breakout", symbols: 8, frequency: "5-12/day", risk: "Medium", winRate: "62%", enabled: false, grade: "A" },
  { id: "lsweep", name: "Liquidity Sweep", category: "Reversal", symbols: 11, frequency: "2-5/day", risk: "Medium", winRate: "65%", enabled: false, grade: "A" },
  { id: "engulf", name: "Engulfing Strategy", category: "Pattern", symbols: 8, frequency: "4-8/day", risk: "Low", winRate: "71%", enabled: false, grade: "A+" },
  { id: "pullback", name: "Elite Pullback", category: "Continuation", symbols: 11, frequency: "3-6/day", risk: "Low", winRate: "66%", enabled: false, grade: "B+" },
];

const DEFAULT_RISK: RiskSettings = {
  maxDailyTrades: 10,
  maxDailyLoss: 200,
  maxOpenPositions: 3,
  maxSpread: 2.0,
  pauseAfterLosses: 3,
  defaultLotSize: 0.10,
};

let _eventId = 0;
function makeEvent(message: string, type: EventLogEntry["type"] = "info"): EventLogEntry {
  return { id: ++_eventId, time: new Date().toLocaleTimeString(), message, type };
}

/* ───────── loading skeleton ───────── */
function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass-card p-4 h-20 bg-surface-2 rounded-xl" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass-card p-8 h-40 bg-surface-2 rounded-xl" />
        <div className="glass-card p-8 h-40 bg-surface-2 rounded-xl" />
      </div>
    </div>
  );
}

/* ───────── main page ───────── */
export default function AlgoHubPage() {
  const { settings: algoSettings, updateSettings: updateAlgoSettings, serverState, setBotFlags } = useAlgoConfig("hub");
  const [tab, setTab] = useState<AlgoTab>("dashboard");
  const [botStatus, setBotStatus] = useState<BotStatus>("idle");
  const [opMode, setOpMode] = useState<OpMode>("Paper Trade");
  const [strategies, setStrategies] = useState<Strategy[]>(DEFAULT_STRATEGIES);
  const [risk, setRisk] = useState<RiskSettings>(DEFAULT_RISK);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>(() => [makeEvent("Algo Hub initialized", "info")]);
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [loading, setLoading] = useState(true);

  const addEvent = useCallback((msg: string, type: EventLogEntry["type"] = "info") => {
    setEventLog((prev) => [makeEvent(msg, type), ...prev].slice(0, 50));
  }, []);

  /* ── fetch quotes ── */
  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/market/quotes");
      const data = await res.json();
      if (data.quotes && data.quotes.length > 0) {
        setQuotes(data.quotes);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
    const iv = setInterval(fetchQuotes, 60_000);
    return () => clearInterval(iv);
  }, [fetchQuotes]);

  /* ── derived stats ── */
  const enabledCount = strategies.filter((s) => s.enabled).length;
  const monitoredSymbols = new Set(strategies.filter((s) => s.enabled).flatMap((s) => {
    // approximate: if symbols is 11 use full list, if 8 use subset
    const full = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "XAGUSD", "US30", "USOIL", "NAS100", "USDCHF", "GBPJPY"];
    return s.symbols >= 11 ? full : full.slice(0, s.symbols);
  }));

  /* ── actions ── */
  function toggleBot() {
    if (botStatus === "running") {
      setBotStatus("idle");
      addEvent("Bot stopped by user", "warn");
    } else {
      if (enabledCount === 0) {
        addEvent("Cannot start bot -- no strategies enabled", "warn");
        return;
      }
      setBotStatus("running");
      addEvent("Bot started in " + opMode + " mode", "success");
    }
  }

  function killSwitch() {
    if (!confirm("KILL SWITCH: This will disable ALL strategies and stop the bot immediately. Continue?")) return;
    setStrategies((prev) => prev.map((s) => ({ ...s, enabled: false })));
    setBotStatus("idle");
    addEvent("KILL SWITCH ACTIVATED -- all strategies disabled, bot stopped", "danger");
  }

  function toggleStrategy(id: string) {
    setStrategies((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = !s.enabled;
        addEvent(`Strategy "${s.name}" ${next ? "enabled" : "disabled"}`, next ? "success" : "warn");
        return { ...s, enabled: next };
      })
    );
  }

  function changeMode(mode: OpMode) {
    setOpMode(mode);
    addEvent(`Operating mode changed to ${mode}`, "info");
  }

  /* ── tabs config ── */
  const tabs: { id: AlgoTab; label: string }[] = [
    { id: "dashboard", label: "Bot Dashboard" },
    { id: "strategies", label: "Strategies" },
    { id: "settings", label: "Risk & Settings" },
    { id: "trades", label: "Trade History" },
    { id: "analytics", label: "Analytics" },
    { id: "config", label: "Algo Config" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Algo Trading Hub</h1>
          <span className={cn(
            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border",
            botStatus === "running"
              ? "bg-bull/10 text-bull-light border-bull/20"
              : botStatus === "paused"
              ? "bg-warn/10 text-warn border-warn/20"
              : "bg-surface-2 text-muted border-border/30"
          )}>
            <span className={cn(
              "w-2 h-2 rounded-full",
              botStatus === "running" ? "bg-bull animate-pulse" : "bg-muted"
            )} />
            {botStatus === "running" ? "Running" : botStatus === "paused" ? "Paused" : "Idle"}
          </span>
          <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">
            {opMode}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleBot}
            className={cn(
              "px-5 py-2 rounded-xl text-sm font-bold transition-smooth",
              botStatus === "running"
                ? "bg-bear text-white hover:bg-bear-light"
                : "bg-bull text-white hover:bg-bull-light"
            )}
          >
            {botStatus === "running" ? "Stop Bot" : "Start Bot"}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">
        {enabledCount} strategies enabled | {monitoredSymbols.size} symbols monitored | {quotes.length} live quotes loaded
      </p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
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
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "dashboard" && (
        loading ? <Skeleton /> : (
          <DashboardPanel
            botStatus={botStatus}
            enabledCount={enabledCount}
            monitoredCount={monitoredSymbols.size}
            quotes={quotes}
            eventLog={eventLog}
          />
        )
      )}
      {tab === "strategies" && (
        <StrategiesPanel strategies={strategies} onToggle={toggleStrategy} />
      )}
      {tab === "settings" && (
        <SettingsPanel
          risk={risk}
          setRisk={setRisk}
          opMode={opMode}
          changeMode={changeMode}
          killSwitch={killSwitch}
        />
      )}
      {tab === "trades" && (
        <div className="glass-card p-6 text-center text-muted">
          Full trade history with filters coming soon
        </div>
      )}
      {tab === "analytics" && (
        <div className="glass-card p-6 text-center text-muted">
          Performance analytics by strategy, symbol, and session coming soon
        </div>
      )}
      {tab === "config" && (
        <div className="space-y-4">
          <AlgoAccountsCard settings={algoSettings} updateSettings={updateAlgoSettings} />
          <AlgoBotStatusPanel botId="hub" />
          <div className="glass-card p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">Server routing</div>
              <div className="text-xs text-muted">
                {serverState.enabled && serverState.running
                  ? "Routing matching A/A+ setups to linked MT accounts"
                  : "Disabled — toggle on to route matching setups to linked MT accounts"}
              </div>
            </div>
            <button
              onClick={() => {
                const next = !(serverState.enabled && serverState.running);
                setBotFlags({ enabled: next, running: next });
              }}
              className={cn(
                "w-12 h-6 rounded-full relative transition-smooth",
                serverState.enabled && serverState.running ? "bg-accent" : "bg-surface-3",
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-smooth",
                  serverState.enabled && serverState.running ? "left-6" : "left-0.5",
                )}
              />
            </button>
          </div>
          <AlgoConfigPanel settings={algoSettings} updateSettings={updateAlgoSettings} botName="Algo Hub" />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Dashboard Panel
   ═══════════════════════════════════════════════════════════════ */
function DashboardPanel({
  botStatus,
  enabledCount,
  monitoredCount,
  quotes,
  eventLog,
}: {
  botStatus: BotStatus;
  enabledCount: number;
  monitoredCount: number;
  quotes: MarketQuote[];
  eventLog: EventLogEntry[];
}) {
  const avgChange = quotes.length > 0
    ? (quotes.reduce((sum, q) => sum + q.changePercent, 0) / quotes.length)
    : 0;

  return (
    <div className="space-y-4">
      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Status</div>
          <div className="flex items-center justify-center gap-2">
            <span className={cn("w-2.5 h-2.5 rounded-full", botStatus === "running" ? "bg-bull animate-pulse" : "bg-muted")} />
            <span className={cn("text-sm font-bold capitalize", botStatus === "running" ? "text-bull-light" : "text-muted")}>{botStatus}</span>
          </div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Today P&L</div>
          <div className="text-lg font-bold text-muted">$0.00</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Trades Today</div>
          <div className="text-lg font-bold">0</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Active Strategies</div>
          <div className={cn("text-lg font-bold", enabledCount > 0 ? "text-bull-light" : "text-muted")}>{enabledCount}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Monitored Symbols</div>
          <div className="text-lg font-bold">{monitoredCount}</div>
        </div>
      </div>

      {/* Live prices strip */}
      {quotes.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold mb-3">Live Prices</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {quotes.slice(0, 12).map((q) => (
              <div key={q.symbol} className="bg-surface-2 rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-muted">{q.symbol}</div>
                <div className="text-sm font-bold text-foreground">{q.price.toFixed(q.symbol.includes("JPY") ? 3 : q.price > 100 ? 2 : 5)}</div>
                <div className={cn("text-[10px] font-medium", q.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                  {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-muted text-right">
            Avg market move: <span className={cn(avgChange >= 0 ? "text-bull-light" : "text-bear-light")}>{avgChange >= 0 ? "+" : ""}{avgChange.toFixed(3)}%</span>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent trades */}
        <div className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Recent Trades</h3>
          <p className="text-sm text-muted">
            No trades yet — enable strategies and start the bot to see activity here.
          </p>
        </div>

        {/* Event log */}
        <div className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Event Log</h3>
          {eventLog.length === 0 ? (
            <p className="text-sm text-muted">No events yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1.5 scrollbar-thin">
              {eventLog.map((e) => (
                <div key={e.id} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-light shrink-0 font-mono">{e.time}</span>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                    e.type === "success" ? "bg-bull" : e.type === "danger" ? "bg-bear" : e.type === "warn" ? "bg-warn" : "bg-accent"
                  )} />
                  <span className={cn(
                    e.type === "danger" ? "text-bear-light font-bold" : "text-muted-light"
                  )}>
                    {e.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Strategies Panel
   ═══════════════════════════════════════════════════════════════ */
function StrategiesPanel({
  strategies,
  onToggle,
}: {
  strategies: Strategy[];
  onToggle: (id: string) => void;
}) {
  const enabled = strategies.filter((s) => s.enabled).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Strategy Library</h3>
        <span className="text-xs text-muted">{enabled}/{strategies.length} enabled</span>
      </div>
      {strategies.map((s) => (
        <div key={s.id} className={cn("glass-card p-5 transition-all", s.enabled && "border-l-2 border-l-bull")}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-bold">{s.name}</h4>
              <span className="text-xs bg-surface-2 px-2 py-0.5 rounded">{s.category}</span>
              <span className={cn(
                "text-xs font-bold px-2 py-0.5 rounded",
                s.grade.startsWith("A") ? "bg-bull/10 text-bull-light" : "bg-warn/10 text-warn"
              )}>
                {s.grade}
              </span>
            </div>
            <button
              onClick={() => onToggle(s.id)}
              className={cn(
                "w-11 h-6 rounded-full relative transition-smooth cursor-pointer",
                s.enabled ? "bg-accent" : "bg-surface-3"
              )}
            >
              <div className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-smooth",
                s.enabled ? "left-[22px]" : "left-0.5"
              )} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div><span className="text-muted">Symbols</span><div className="text-foreground">{s.symbols}</div></div>
            <div><span className="text-muted">Frequency</span><div className="text-foreground">{s.frequency}</div></div>
            <div><span className="text-muted">Risk</span><div className="text-foreground">{s.risk}</div></div>
            <div><span className="text-muted">Win Rate</span><div className="text-bull-light font-medium">{s.winRate}</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Settings Panel
   ═══════════════════════════════════════════════════════════════ */
function SettingsPanel({
  risk,
  setRisk,
  opMode,
  changeMode,
  killSwitch,
}: {
  risk: RiskSettings;
  setRisk: React.Dispatch<React.SetStateAction<RiskSettings>>;
  opMode: OpMode;
  changeMode: (m: OpMode) => void;
  killSwitch: () => void;
}) {
  const inputCls = "w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground";

  function updateField(field: keyof RiskSettings, raw: string) {
    const val = parseFloat(raw);
    if (!isNaN(val)) setRisk((prev) => ({ ...prev, [field]: val }));
  }

  return (
    <div className="max-w-2xl space-y-5">
      <h3 className="text-lg font-semibold">Global Automation Settings</h3>

      <div className="glass-card p-6 space-y-4">
        <h4 className="text-sm font-semibold">Risk Controls</h4>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Max Daily Trades</label>
            <input type="number" value={risk.maxDailyTrades} onChange={(e) => updateField("maxDailyTrades", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Max Daily Loss ($)</label>
            <input type="number" value={risk.maxDailyLoss} onChange={(e) => updateField("maxDailyLoss", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Max Open Positions</label>
            <input type="number" value={risk.maxOpenPositions} onChange={(e) => updateField("maxOpenPositions", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Max Spread (pips)</label>
            <input type="number" value={risk.maxSpread} step="0.1" onChange={(e) => updateField("maxSpread", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Pause After Losses</label>
            <input type="number" value={risk.pauseAfterLosses} onChange={(e) => updateField("pauseAfterLosses", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Default Lot Size</label>
            <input type="number" value={risk.defaultLotSize} step="0.01" onChange={(e) => updateField("defaultLotSize", e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h4 className="text-sm font-semibold">Operating Mode</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(["Full Auto", "Semi Auto", "Paper Trade", "Demo Only"] as OpMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => changeMode(mode)}
              className={cn(
                "py-3 rounded-xl text-xs font-medium transition-smooth",
                opMode === mode
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-bear-light">Emergency Kill Switch</h4>
            <p className="text-xs text-muted mt-1">Stop all trading immediately and disable all strategies</p>
          </div>
          <button
            onClick={killSwitch}
            className="px-6 py-3 rounded-xl bg-bear text-white text-sm font-bold transition-smooth hover:bg-bear-light"
          >
            KILL SWITCH
          </button>
        </div>
      </div>
    </div>
  );
}
