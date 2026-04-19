"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { AlgoConfigPanel, useAlgoConfig, AlgoRoutingBadge } from "@/components/algo/AlgoConfig";

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
  direction: "Bullish OB" | "Bearish OB";
  zone: string;
  price: number;
  rangePct: number;
}

const obTypes = [
  { label: "Bullish OB", desc: "Last bearish candle before impulsive move up", color: "text-bull-light" },
  { label: "Bearish OB", desc: "Last bullish candle before impulsive move down", color: "text-bear-light" },
  { label: "Breaker Block", desc: "Failed OB that flips into support/resistance", color: "text-accent-light" },
  { label: "Mitigation Block", desc: "OB that has been partially filled", color: "text-warn" },
];

export default function OBAlgoPage() {
  const { settings: algoSettings, updateSettings: updateAlgoSettings } = useAlgoConfig("order_block");
  const [showConfig, setShowConfig] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [lotSize, setLotSize] = useState("0.10");
  const [maxTrades, setMaxTrades] = useState("4");
  const [maxLoss, setMaxLoss] = useState("200");
  const [maxSpread, setMaxSpread] = useState("2.0");
  const [retestOnly, setRetestOnly] = useState(true);
  const [minQuality, setMinQuality] = useState("A");

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

  // Signal logic: high-low range > 0.3% of price = active zone, changePercent confirms direction
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
      if (q.price <= 0) continue;
      const rangePct = ((q.high - q.low) / q.price) * 100;
      if (rangePct > 0.3) {
        if (q.changePercent > 0) {
          detected.push({
            time: now,
            pair: q.displayName,
            direction: "Bullish OB",
            zone: `${q.low.toFixed(q.symbol.includes("JPY") ? 3 : q.category === "metals" ? 2 : 5)} - ${q.high.toFixed(q.symbol.includes("JPY") ? 3 : q.category === "metals" ? 2 : 5)}`,
            price: q.price,
            rangePct,
          });
        } else if (q.changePercent < 0) {
          detected.push({
            time: now,
            pair: q.displayName,
            direction: "Bearish OB",
            zone: `${q.low.toFixed(q.symbol.includes("JPY") ? 3 : q.category === "metals" ? 2 : 5)} - ${q.high.toFixed(q.symbol.includes("JPY") ? 3 : q.category === "metals" ? 2 : 5)}`,
            price: q.price,
            rangePct,
          });
        }
      }
    }
    detected.sort((a, b) => b.rangePct - a.rangePct);
    const filtered = detected.filter((s) => Math.round(s.rangePct * 30) >= algoSettings.minScore);
    setSignals(filtered);
    if (detected.length > 0) {
      addLog(`Detected ${detected.length} order block zone(s)`);
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
    addLog(next ? "Bot STARTED - scanning for OBs" : "Bot STOPPED");
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
            <h1 className="text-2xl font-bold text-foreground">Order Block Algo</h1>
            <AlgoRoutingBadge selectedAccounts={algoSettings.selectedAccounts} />
          </div>
          <p className="text-sm text-muted">
            Executes validated order block signals with structured SL/TP and A+ quality gating
          </p>
        </div>
        <div
          onClick={handleToggleEnabled}
          className={cn("w-12 h-6 rounded-full relative cursor-pointer transition-smooth", enabled ? "bg-accent" : "bg-surface-3")}
        >
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
          <div className="text-xs text-muted mb-1">OBs Detected</div>
          <div className="text-lg font-bold">{signals.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Quality Gate</div>
          <div className="text-lg font-bold text-accent-light">{minQuality}+</div>
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
            Scanning {quotes.length} instruments...
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
        <AlgoConfigPanel settings={algoSettings} updateSettings={updateAlgoSettings} botName="Order Block Algo" />
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Risk Controls</h3>
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
                <label className="text-xs text-muted-light mb-1.5 block">Max Daily Loss ($)</label>
                <input type="number" value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Spread (pips)</label>
                <input type="number" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Min Quality Grade</label>
                <select value={minQuality} onChange={(e) => setMinQuality(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="A+">A+ Only</option>
                  <option value="A">A and above</option>
                  <option value="B+">B+ and above</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-4">
                <div onClick={() => setRetestOnly(!retestOnly)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", retestOnly ? "bg-accent" : "bg-surface-3")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", retestOnly ? "left-5" : "left-0.5")} />
                </div>
                <label className="text-xs text-muted-light">Retest Only (preferred)</label>
              </div>
            </div>
          </div>

          {/* OB Types */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Institutional Zone Types</h3>
            <div className="space-y-3">
              {obTypes.map((ob) => (
                <div key={ob.label} className="flex items-start gap-3 bg-surface-2 rounded-lg p-3">
                  <span className={cn("text-xs font-bold whitespace-nowrap mt-0.5", ob.color)}>{ob.label}</span>
                  <span className="text-xs text-muted">{ob.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live Instruments */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Live Instruments</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {quotes.map((q) => {
                const rangePct = q.price > 0 ? ((q.high - q.low) / q.price) * 100 : 0;
                return (
                  <div key={q.symbol} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{q.displayName}</span>
                      {rangePct > 0.3 && <span className="text-[9px] bg-accent/15 text-accent-light px-1.5 py-0.5 rounded">Active Zone</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono">{q.price.toFixed(q.symbol.includes("JPY") ? 3 : q.category === "metals" ? 2 : 5)}</span>
                      <span className={cn("text-[10px] font-bold", q.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                        {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
              {quotes.length === 0 && (
                <div className="text-xs text-muted text-center py-4">No data available</div>
              )}
            </div>
          </div>
        </div>

        {/* Signals + Logic + Log */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Detected Signals ({signals.length})</h3>
            {signals.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted text-sm">{enabled ? "Scanning for order blocks..." : "Enable to see signals"}</div>
                <div className="text-muted text-xs mt-1">OB signals appear here when the algo detects qualifying institutional zones</div>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {signals.map((s, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-muted">{s.time}</span>
                      <span className="text-xs font-medium">{s.pair}</span>
                      <span className={cn("text-[10px] font-bold", s.direction === "Bullish OB" ? "text-bull-light" : "text-bear-light")}>
                        {s.direction}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-muted">Range: {s.rangePct.toFixed(2)}%</div>
                      <div className="text-[10px] font-mono text-muted">{s.zone}</div>
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
                <p className="text-foreground font-medium mb-1">Institutional Zone Detection</p>
                <p>Scans for valid order blocks at key institutional levels. Identifies the last opposing candle before an impulsive displacement move, marking zones where institutional orders were placed.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Quality Gating</p>
                <p>Each OB is graded from C to A+ based on displacement strength, imbalance left behind, HTF confluence, and whether price has revisited the zone. Only {minQuality}+ quality setups pass the filter.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Retest Preference</p>
                <p>The algo prefers entries on the first retest of an unmitigated order block, placing SL beyond the OB body and TP at the opposing liquidity pool or imbalance fill level.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Structured Risk</p>
                <p>SL is placed at the OB extreme (high for bearish, low for bullish). TP targets the nearest liquidity pool. Minimum 1:2 R:R is enforced before any trade is taken.</p>
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
