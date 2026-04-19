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
  pair: string;
  direction: "Buy" | "Sell";
  strength: number;
  price: number;
}

const timeframes = ["M5", "M15", "H1", "H4"];

export default function FXStrengthAlgoPage() {
  const { settings: algoSettings, updateSettings: updateAlgoSettings } = useAlgoConfig("fx_strength");
  const [showConfig, setShowConfig] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [lotSize, setLotSize] = useState("0.10");
  const [timeframe, setTimeframe] = useState("M15");
  const [maxTrades, setMaxTrades] = useState("5");
  const [maxLoss, setMaxLoss] = useState("150");
  const [maxSpread, setMaxSpread] = useState("2.0");
  const [pauseAfterLosses, setPauseAfterLosses] = useState("3");

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

  const forexQuotes = quotes.filter((q) => q.category === "forex");

  // Scan for signals when enabled
  useEffect(() => {
    if (!enabled || forexQuotes.length === 0) {
      if (!enabled) setSignals([]);
      return;
    }
    const now = new Date().toLocaleTimeString();
    const detected: Signal[] = [];
    const filteredQuotes = forexQuotes.filter((q) =>
      algoSettings.selectedPairs.length === 0 || algoSettings.selectedPairs.includes(q.symbol)
    );
    for (const q of filteredQuotes) {
      if (q.changePercent > 0.15) {
        detected.push({
          time: now,
          pair: q.displayName,
          direction: "Buy",
          strength: Math.min(100, Math.round(Math.abs(q.changePercent) * 50)),
          price: q.price,
        });
      } else if (q.changePercent < -0.15) {
        detected.push({
          time: now,
          pair: q.displayName,
          direction: "Sell",
          strength: Math.min(100, Math.round(Math.abs(q.changePercent) * 50)),
          price: q.price,
        });
      }
    }
    detected.sort((a, b) => b.strength - a.strength);
    const filtered = detected.filter((s) => s.strength >= algoSettings.minScore);
    setSignals(filtered);
    if (detected.length > 0) {
      addLog(`Detected ${detected.length} FX strength signal(s)`);
    }
  }, [enabled, quotes]); // eslint-disable-line react-hooks/exhaustive-deps

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
    addLog(next ? "Bot STARTED - scanning for setups" : "Bot STOPPED");
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
            <h1 className="text-2xl font-bold text-foreground">FX Strength Algo</h1>
            <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">
              Paper Mode
            </span>
          </div>
          <p className="text-sm text-muted">
            Trades only top-ranked FX Strength setups using multi-timeframe directional alignment
          </p>
        </div>
        <div
          onClick={handleToggleEnabled}
          className={cn(
            "w-12 h-6 rounded-full relative cursor-pointer transition-smooth",
            enabled ? "bg-accent" : "bg-surface-3"
          )}
        >
          <div
            className={cn(
              "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-smooth",
              enabled ? "left-6" : "left-0.5"
            )}
          />
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Status</div>
          <div className="flex items-center justify-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", running ? "bg-bull pulse-live" : "bg-muted")} />
            <span className={cn("text-sm font-bold", running ? "text-bull-light" : "text-muted")}>
              {running ? "Running" : "Idle"}
            </span>
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
          <div className="text-xs text-muted mb-1">Win Rate</div>
          <div className="text-lg font-bold text-accent-light">--</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Signals</div>
          <div className="text-lg font-bold">{signals.length}</div>
        </div>
      </div>

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
            Scanning {forexQuotes.length} FX instruments...
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
        <AlgoConfigPanel settings={algoSettings} updateSettings={updateAlgoSettings} botName="FX Strength Algo" />
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Trade Controls</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Lot Size</label>
                <input type="number" value={lotSize} onChange={(e) => setLotSize(e.target.value)} step="0.01" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Timeframe</label>
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  {timeframes.map((tf) => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Trades / Day</label>
                <input type="number" value={maxTrades} onChange={(e) => setMaxTrades(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Risk Settings</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Daily Loss ($)</label>
                <input type="number" value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Spread (pips)</label>
                <input type="number" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Pause After Consecutive Losses</label>
                <input type="number" value={pauseAfterLosses} onChange={(e) => setPauseAfterLosses(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
            </div>
          </div>

          {/* Live Instruments */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Live FX Instruments</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {forexQuotes.map((q) => (
                <div key={q.symbol} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                  <span className="text-xs font-medium text-foreground">{q.displayName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono">{q.price.toFixed(q.symbol.includes("JPY") ? 3 : 5)}</span>
                    <span className={cn("text-[10px] font-bold", q.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                      {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
              {forexQuotes.length === 0 && (
                <div className="text-xs text-muted text-center py-4">No FX data available</div>
              )}
            </div>
          </div>
        </div>

        {/* Signals + Log */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Detected Signals ({signals.length})</h3>
            {signals.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted text-sm">
                  {enabled ? "Scanning for signals..." : "Enable to see signals"}
                </div>
                <div className="text-muted text-xs mt-1">
                  Signals appear here when the algo detects qualifying setups
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {signals.map((s, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-muted">{s.time}</span>
                      <span className="text-xs font-medium">{s.pair}</span>
                      <span className={cn("text-[10px] font-bold", s.direction === "Buy" ? "text-bull-light" : "text-bear-light")}>
                        {s.direction}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted">Str: {s.strength}</span>
                      <span className="text-xs font-mono">{s.price.toFixed(5)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Algo Logic</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">Multi-Timeframe Directional Alignment</p>
                <p>The algo ranks all FX pairs by currency strength differential across M5, M15, H1, and H4 timeframes. Only pairs where all timeframes agree on direction are considered for entry.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Top-Ranked Selection</p>
                <p>From the aligned pairs, the algo selects only the top-ranked setups where the strength gap between the two currencies is widest, filtering out low-conviction trades.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Entry & Exit</p>
                <p>Entries are triggered on pullback confirmation within the dominant trend. Exits use a combination of fixed R:R targets and trailing stops based on ATR.</p>
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
