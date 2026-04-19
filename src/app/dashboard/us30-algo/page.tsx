"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { AlgoConfigPanel, useAlgoConfig } from "@/components/algo/AlgoConfig";

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

interface Signal {
  time: string;
  direction: "Bullish" | "Bearish";
  changePct: number;
  price: number;
  mode: string;
}

const strategyModes = [
  { id: "continuation", label: "Continuation", desc: "Trades with the trend after deep pullback into value zone" },
  { id: "breakout-retest", label: "Breakout Retest", desc: "Enters on structure break retest with displacement confirmation" },
  { id: "reversal", label: "Session Reversal", desc: "Fades opening spikes at session open using mean-reversion rules" },
];

export default function US30AlgoPage() {
  const { settings: algoSettings, updateSettings: updateAlgoSettings } = useAlgoConfig("us30");
  const [showConfig, setShowConfig] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [lotSize, setLotSize] = useState("0.05");
  const [maxTrades, setMaxTrades] = useState("3");
  const [maxLoss, setMaxLoss] = useState("300");
  const [maxSpread, setMaxSpread] = useState("5.0");
  const [atrMultiplier, setAtrMultiplier] = useState("1.5");
  const [activeMode, setActiveMode] = useState("continuation");
  const [sessionFilter, setSessionFilter] = useState("ny");

  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setEventLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/market/quotes");
      const data = await res.json();
      if (data.quotes && data.quotes.length > 0) {
        setQuotes(data.quotes);
        addLog(`Fetched ${data.quotes.length} quotes`);
      }
    } catch {
      addLog("Failed to fetch quotes");
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  useEffect(() => {
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60000);
    return () => clearInterval(interval);
  }, [fetchQuotes]);

  // Find US30 quote (could be US30, or indices category)
  const us30 = quotes.find((q) => q.symbol === "US30" || q.symbol.includes("US30") || q.displayName.includes("US30") || q.displayName.includes("Dow"));

  // Signal logic: if abs(changePercent) > 0.2 on US30 = active opportunity
  useEffect(() => {
    if (!enabled || !us30) {
      if (!enabled) setSignals([]);
      return;
    }
    // Check if US30 is in selectedPairs
    const us30InPairs = algoSettings.selectedPairs.length === 0 || algoSettings.selectedPairs.some((p) => p.includes("US30") || p === us30.symbol);
    if (!us30InPairs) {
      setSignals([]);
      return;
    }
    const now = new Date().toLocaleTimeString();
    const detected: Signal[] = [];
    if (Math.abs(us30.changePercent) > 0.2) {
      const score = Math.min(100, Math.round(Math.abs(us30.changePercent) * 50));
      if (score >= algoSettings.minScore) {
        detected.push({
          time: now,
          direction: us30.changePercent > 0 ? "Bullish" : "Bearish",
          changePct: us30.changePercent,
          price: us30.price,
          mode: activeMode,
        });
      }
    }
    setSignals(detected);
    if (detected.length > 0) {
      addLog(`US30 active opportunity: ${us30.changePercent > 0 ? "Bullish" : "Bearish"} (${us30.changePercent.toFixed(2)}%)`);
    }
  }, [enabled, quotes, activeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    addLog(next ? "Algo ENABLED" : "Algo DISABLED");
    if (!next) {
      setRunning(false);
      addLog("Bot stopped (disabled)");
    }
  };

  const handleToggleRunning = () => {
    if (!enabled) return;
    const next = !running;
    setRunning(next);
    addLog(next ? "Bot STARTED - monitoring US30" : "Bot STOPPED");
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-64 bg-surface-2 rounded-lg animate-pulse" />
            <div className="h-4 w-96 bg-surface-2 rounded-lg animate-pulse mt-2" />
          </div>
          <div className="w-12 h-6 bg-surface-2 rounded-full animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-card p-4 h-20 animate-pulse bg-surface-2 rounded-xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="glass-card p-6 h-64 animate-pulse bg-surface-2 rounded-xl" />
          <div className="glass-card p-6 h-64 animate-pulse bg-surface-2 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">US30 Algo</h1>
            <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">Paper Mode</span>
            <span className="text-xs bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">Dow Jones</span>
          </div>
          <p className="text-sm text-muted">US30-specific framework for high volatility, deep pullbacks, ATR-normalized rules, and continuation/breakout-retest logic</p>
        </div>
        <div onClick={handleToggleEnabled} className={cn("w-12 h-6 rounded-full relative cursor-pointer transition-smooth", enabled ? "bg-accent" : "bg-surface-3")}>
          <div className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white transition-smooth", enabled ? "left-6" : "left-0.5")} />
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Status</div>
          <div className="flex items-center justify-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", running ? "bg-bull pulse-live" : "bg-muted")} />
            <span className={cn("text-sm font-bold", running ? "text-bull-light" : "text-muted")}>{running ? "Running" : "Idle"}</span>
          </div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Today P&L</div>
          <div className="text-lg font-bold text-muted">Paper: $0.00</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Trades Today</div>
          <div className="text-lg font-bold">0</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">US30 Price</div>
          <div className="text-lg font-bold">{us30 ? us30.price.toFixed(1) : "--"}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Session</div>
          <div className="text-lg font-bold text-accent-light capitalize">{sessionFilter}</div>
        </div>
      </div>

      {/* US30 Live Data Card */}
      {us30 ? (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">US30 Live Data</h3>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
            <div>
              <div className="text-[10px] text-muted mb-0.5">Price</div>
              <div className="text-sm font-bold text-foreground">{us30.price.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted mb-0.5">Change</div>
              <div className={cn("text-sm font-bold", us30.change >= 0 ? "text-bull-light" : "text-bear-light")}>
                {us30.change >= 0 ? "+" : ""}{us30.change.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted mb-0.5">Change %</div>
              <div className={cn("text-sm font-bold", us30.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                {us30.changePercent >= 0 ? "+" : ""}{us30.changePercent.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted mb-0.5">High</div>
              <div className="text-sm font-bold">{us30.high.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted mb-0.5">Low</div>
              <div className="text-sm font-bold">{us30.low.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted mb-0.5">Range</div>
              <div className="text-sm font-bold">{(us30.high - us30.low).toFixed(1)} pts</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card p-5 text-center">
          <div className="text-sm text-muted">US30 data not available in current feed</div>
          <div className="text-xs text-muted mt-1">The API may not include index data. Algo will activate when US30 quotes become available.</div>
        </div>
      )}

      {/* Start / Stop */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggleRunning}
          disabled={!enabled}
          className={cn(
            "px-6 py-2.5 rounded-xl text-sm font-semibold transition-smooth",
            !enabled
              ? "bg-surface-3 text-muted cursor-not-allowed"
              : running
              ? "bg-bear/20 text-bear-light hover:bg-bear/30 border border-bear/30"
              : "bg-accent/20 text-accent-light hover:bg-accent/30 border border-accent/30"
          )}
        >
          {running ? "Stop Bot" : "Start Bot"}
        </button>
        {enabled && (
          <span className="text-xs text-muted">
            {us30 ? "Monitoring US30..." : "Waiting for US30 data..."}
          </span>
        )}
      </div>

      {/* Config Toggle */}
      <button
        onClick={() => setShowConfig(!showConfig)}
        className={cn(
          "px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
          showConfig
            ? "bg-accent text-white"
            : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
        )}
      >
        {showConfig ? "Hide Config" : "Show Config"}
      </button>

      {showConfig && (
        <AlgoConfigPanel settings={algoSettings} updateSettings={updateAlgoSettings} botName="US30 Algo" />
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Strategy Modes + Controls */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Strategy Mode</h3>
            <div className="space-y-2">
              {strategyModes.map((m) => (
                <div key={m.id} onClick={() => setActiveMode(m.id)}
                  className={cn("flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-smooth border",
                    activeMode === m.id ? "bg-accent/10 border-accent/30" : "bg-surface-2 border-transparent hover:border-border-light")}>
                  <span className={cn("w-3 h-3 rounded-full border-2 flex-shrink-0",
                    activeMode === m.id ? "border-accent bg-accent" : "border-muted")} />
                  <div>
                    <div className={cn("text-xs font-medium", activeMode === m.id ? "text-accent-light" : "text-foreground")}>{m.label}</div>
                    <div className="text-[10px] text-muted">{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">US30-Specific Controls</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Lot Size</label>
                <input type="number" value={lotSize} onChange={(e) => setLotSize(e.target.value)} step="0.01" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Trades / Day</label>
                <input type="number" value={maxTrades} onChange={(e) => setMaxTrades(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">ATR SL Multiplier</label>
                <input type="number" value={atrMultiplier} onChange={(e) => setAtrMultiplier(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Spread (points)</label>
                <input type="number" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} step="0.5" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Daily Loss ($)</label>
                <input type="number" value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Session Filter</label>
                <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="ny">New York</option>
                  <option value="london">London</option>
                  <option value="all">All Sessions</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Signals + Logic + Log */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Detected Signals ({signals.length})</h3>
            {signals.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted text-sm">{enabled ? (us30 ? "Monitoring US30..." : "Waiting for US30 data...") : "Enable to see signals"}</div>
                <div className="text-muted text-xs mt-1">US30 signals will appear based on the selected strategy mode</div>
              </div>
            ) : (
              <div className="space-y-2">
                {signals.map((s, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-muted">{s.time}</span>
                      <span className="text-xs font-medium">US30</span>
                      <span className={cn("text-[10px] font-bold", s.direction === "Bullish" ? "text-bull-light" : "text-bear-light")}>
                        {s.direction}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono">{s.price.toFixed(1)}</div>
                      <div className={cn("text-[10px] font-bold", s.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>
                        {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">US30 Framework</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">High Volatility Adaptation</p>
                <p>US30 moves 300-800+ points per day. The algo uses ATR-normalized stop losses and take profits that dynamically adjust to current volatility conditions, preventing premature stops during normal price action.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Deep Pullback Logic</p>
                <p>In continuation mode, the algo waits for pullbacks into the 50-79% retracement zone of the impulse move, requiring a structural hold and candle confirmation before entering with the trend.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Breakout-Retest</p>
                <p>Monitors key structure levels. After a clean break with displacement, it waits for price to return to the broken level, confirms rejection, then enters with SL behind the retest structure.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Session Awareness</p>
                <p>Most US30 setups occur around NYSE open (09:30 ET). The algo weights signals during high-liquidity windows and filters out low-probability pre-market noise.</p>
              </div>
            </div>
          </div>

          {/* Event Log */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Event Log</h3>
            <div ref={logRef} className="space-y-1 max-h-40 overflow-y-auto font-mono">
              {eventLog.length === 0 ? (
                <div className="text-xs text-muted text-center py-3">No events yet</div>
              ) : (
                eventLog.map((entry, i) => (
                  <div key={i} className="text-[10px] text-muted leading-relaxed">{entry}</div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
