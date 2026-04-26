"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { AlgoConfigPanel, useAlgoConfig, AlgoRoutingBadge, AlgoAccountsCard } from "@/components/algo/AlgoConfig";
import { AlgoBotStatusPanel } from "@/components/algo/AlgoBotStatusPanel";

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
  direction: "Bullish Breakout" | "Bearish Breakout";
  changePct: number;
  price: number;
  nearExtreme: string;
}

const breakoutTypes = [
  { name: "Structure Breakout", desc: "Break of key swing high/low with displacement", icon: "S", active: true },
  { name: "Momentum Breakout", desc: "Explosive move through consolidation with volume surge", icon: "M", active: true },
  { name: "Range Breakout", desc: "Price escapes defined range after accumulation phase", icon: "R", active: true },
  { name: "Trendline Breakout", desc: "Clean break of dynamic trendline with follow-through", icon: "T", active: false },
  { name: "Pattern Breakout", desc: "Triangle, wedge, flag, or pennant completion", icon: "P", active: false },
  { name: "FVG Breakout", desc: "Price displaces through Fair Value Gap with imbalance", icon: "F", active: true },
];

export default function BreakoutAlgoPage() {
  const { settings: algoSettings, updateSettings: updateAlgoSettings, serverState, setBotFlags } = useAlgoConfig("breakout");
  const [showConfig, setShowConfig] = useState(true);
  const enabled = serverState.enabled;
  const running = serverState.running;
  const [lotSize, setLotSize] = useState("0.10");
  const [maxTrades, setMaxTrades] = useState("6");
  const [maxLoss, setMaxLoss] = useState("200");
  const [maxSpread, setMaxSpread] = useState("2.5");
  const [slippage, setSlippage] = useState("1.0");
  const [retestPref, setRetestPref] = useState(true);
  const [trailingSL, setTrailingSL] = useState(true);
  const [activeTypes, setActiveTypes] = useState(breakoutTypes.map((b) => b.active));

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

  const toggleType = (index: number) => {
    setActiveTypes((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  // Signal logic: abs(changePercent) > 0.3 = potential breakout. High near range top or low near range bottom = breakout candidate
  useEffect(() => {
    if (!enabled || quotes.length === 0) {
      if (!enabled) setSignals([]);
      return;
    }
    const now = new Date().toLocaleTimeString();
    const detected: Signal[] = [];
    const filteredQuotes = quotes.filter((q) =>
      algoSettings.selectedPairs.length === 0 || algoSettings.selectedPairs.includes(q.symbol)
    );
    for (const q of filteredQuotes) {
      const absPct = Math.abs(q.changePercent);
      if (absPct > 0.3) {
        const range = q.high - q.low;
        const nearHigh = range > 0 ? (q.price - q.low) / range : 0;
        const nearLow = range > 0 ? (q.high - q.price) / range : 0;
        let nearExtreme = "";
        if (q.changePercent > 0 && nearHigh > 0.8) nearExtreme = "Near day high";
        else if (q.changePercent < 0 && nearLow > 0.8) nearExtreme = "Near day low";
        else nearExtreme = "Mid-range";

        detected.push({
          time: now,
          pair: q.displayName,
          direction: q.changePercent > 0 ? "Bullish Breakout" : "Bearish Breakout",
          changePct: q.changePercent,
          price: q.price,
          nearExtreme,
        });
      }
    }
    detected.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    const filtered = detected.filter((s) => Math.min(100, Math.round(Math.abs(s.changePct) * 50)) >= algoSettings.minScore);
    setSignals(filtered);
    if (detected.length > 0) {
      addLog(`Detected ${detected.length} breakout candidate(s)`);
    }
  }, [enabled, quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleEnabled = () => {
    const next = !enabled;
    addLog(next ? "Algo ENABLED" : "Algo DISABLED");
    if (next) {
      setBotFlags({ enabled: true });
    } else {
      setBotFlags({ enabled: false, running: false });
      addLog("Bot stopped (disabled)");
    }
  };

  const handleToggleRunning = () => {
    if (!enabled) return;
    const next = !running;
    addLog(next ? "Bot STARTED - server runtime will route matching setups" : "Bot STOPPED");
    setBotFlags({ running: next });
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
            <h1 className="text-2xl font-bold text-foreground">Breakout Algo</h1>
            <AlgoRoutingBadge selectedAccounts={algoSettings.selectedAccounts} />
          </div>
          <p className="text-sm text-muted">Handles trigger logic, retest preference, slippage/spread controls, position sizing, and exit management</p>
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
          <div className="text-lg font-bold text-muted">$0.00</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Trades Today</div>
          <div className="text-lg font-bold">0</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Breakouts</div>
          <div className="text-lg font-bold">{signals.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Active Types</div>
          <div className="text-lg font-bold text-accent-light">{activeTypes.filter(Boolean).length}/{breakoutTypes.length}</div>
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
        {!enabled && (
          <span className="text-xs text-muted">
            Enable the bot first using the toggle in the top right ↗
          </span>
        )}
        {enabled && (
          <span className="text-xs text-muted">
            Scanning {quotes.length} instruments...
          </span>
        )}
      </div>

      {/* Trading Accounts — hoisted from config so it's always visible */}
      <AlgoAccountsCard settings={algoSettings} updateSettings={updateAlgoSettings} />

      {/* Live server-routing activity */}
      <AlgoBotStatusPanel botId="breakout" />

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
        <AlgoConfigPanel settings={algoSettings} updateSettings={updateAlgoSettings} botName="Breakout Algo" />
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Breakout Types + Live Instruments */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Breakout Types</h3>
            <div className="space-y-2">
              {breakoutTypes.map((b, i) => (
                <div key={b.name} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
                      activeTypes[i] ? "bg-accent/20 text-accent-light" : "bg-surface-3 text-muted")}>{b.icon}</span>
                    <div>
                      <div className="text-xs font-medium text-foreground">{b.name}</div>
                      <div className="text-[10px] text-muted">{b.desc}</div>
                    </div>
                  </div>
                  <div onClick={() => toggleType(i)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", activeTypes[i] ? "bg-accent" : "bg-surface-3")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", activeTypes[i] ? "left-5" : "left-0.5")} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Instruments */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Live Instruments</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {quotes.map((q) => (
                <div key={q.symbol} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{q.displayName}</span>
                    {Math.abs(q.changePercent) > 0.3 && (
                      <span className="text-[9px] bg-warn/15 text-warn px-1.5 py-0.5 rounded">Breakout</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono">{q.price.toFixed(q.symbol.includes("JPY") ? 3 : q.category === "metals" ? 2 : q.category === "crypto" ? 1 : 5)}</span>
                    <span className={cn("text-[10px] font-bold", q.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                      {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
              {quotes.length === 0 && (
                <div className="text-xs text-muted text-center py-4">No data available</div>
              )}
            </div>
          </div>

          {/* Signals */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Detected Breakouts ({signals.length})</h3>
            {signals.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted text-sm">{enabled ? "Monitoring for breakout triggers..." : "Enable to see signals"}</div>
                <div className="text-muted text-xs mt-1">Breakout signals appear when price triggers through a qualified level</div>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {signals.map((s, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-muted">{s.time}</span>
                      <span className="text-xs font-medium">{s.pair}</span>
                      <span className={cn("text-[10px] font-bold", s.direction.includes("Bullish") ? "text-bull-light" : "text-bear-light")}>
                        {s.direction}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-[10px] font-bold", s.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>
                        {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                      </div>
                      <div className="text-[9px] text-muted">{s.nearExtreme}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Controls + Logic + Log */}
        <div className="space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Position Sizing & Execution</h3>
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
                <label className="text-xs text-muted-light mb-1.5 block">Max Slippage (pips)</label>
                <input type="number" value={slippage} onChange={(e) => setSlippage(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Spread (pips)</label>
                <input type="number" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Daily Loss ($)</label>
                <input type="number" value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 space-y-3">
            <h3 className="text-sm font-semibold">Exit Management</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div>
                  <div className="text-xs font-medium text-foreground">Retest Preference</div>
                  <div className="text-[10px] text-muted">Wait for breakout level retest before entering</div>
                </div>
                <div onClick={() => setRetestPref(!retestPref)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", retestPref ? "bg-accent" : "bg-surface-3")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", retestPref ? "left-5" : "left-0.5")} />
                </div>
              </div>
              <div className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div>
                  <div className="text-xs font-medium text-foreground">Trailing Stop Loss</div>
                  <div className="text-[10px] text-muted">ATR-based trailing SL after reaching 1R profit</div>
                </div>
                <div onClick={() => setTrailingSL(!trailingSL)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", trailingSL ? "bg-accent" : "bg-surface-3")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", trailingSL ? "left-5" : "left-0.5")} />
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Algo Logic</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">Trigger Logic</p>
                <p>Detects breakout candle close above/below the level with minimum displacement. Validates with volume confirmation and candle body-to-wick ratio.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Retest Entry</p>
                <p>When enabled, the algo waits for price to return to the broken level, confirms rejection (pin bar, engulfing), then enters with tight SL behind the retest.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Exit Strategy</p>
                <p>Partial TP at 1:1 R:R, move SL to break-even. Final TP at structure target or trailing stop triggered by ATR contraction.</p>
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
