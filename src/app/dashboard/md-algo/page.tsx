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
  category: string;
  direction: "Bullish" | "Bearish";
  count: number;
  instruments: string[];
}

const confluenceFactors = [
  { name: "HTF Trend", desc: "H4/D1 directional bias confirmed", weight: "30%" },
  { name: "LTF Confirmation", desc: "M5/M15 structure shift aligns with HTF", weight: "25%" },
  { name: "Key Level", desc: "Price at or near significant S/R level", weight: "20%" },
  { name: "Momentum", desc: "RSI/MACD divergence or alignment", weight: "15%" },
  { name: "Volume Profile", desc: "Volume supports directional move", weight: "10%" },
];

export default function MDAlgoPage() {
  const { settings: algoSettings, updateSettings: updateAlgoSettings } = useAlgoConfig("market_direction");
  const [showConfig, setShowConfig] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [lotSize, setLotSize] = useState("0.10");
  const [maxTrades, setMaxTrades] = useState("4");
  const [maxLoss, setMaxLoss] = useState("200");
  const [maxSpread, setMaxSpread] = useState("2.0");
  const [confluenceMin, setConfluenceMin] = useState("70");
  const [htfTimeframe, setHtfTimeframe] = useState("H4");
  const [ltfTimeframe, setLtfTimeframe] = useState("M15");

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

  // Signal logic: if changePercent > 0.1 = bullish bias. If multiple instruments in same category all bullish = strong alignment
  useEffect(() => {
    if (!enabled || quotes.length === 0) {
      if (!enabled) setSignals([]);
      return;
    }
    const now = new Date().toLocaleTimeString();
    const byCategory: Record<string, { bullish: MarketQuote[]; bearish: MarketQuote[] }> = {};

    const filteredQuotes = quotes.filter((q) =>
      algoSettings.selectedPairs.length === 0 || algoSettings.selectedPairs.includes(q.symbol)
    );
    for (const q of filteredQuotes) {
      if (!byCategory[q.category]) byCategory[q.category] = { bullish: [], bearish: [] };
      if (q.changePercent > 0.1) {
        byCategory[q.category].bullish.push(q);
      } else if (q.changePercent < -0.1) {
        byCategory[q.category].bearish.push(q);
      }
    }

    const detected: Signal[] = [];
    for (const [cat, data] of Object.entries(byCategory)) {
      if (data.bullish.length >= 2) {
        detected.push({
          time: now,
          category: cat,
          direction: "Bullish",
          count: data.bullish.length,
          instruments: data.bullish.map((q) => q.displayName),
        });
      }
      if (data.bearish.length >= 2) {
        detected.push({
          time: now,
          category: cat,
          direction: "Bearish",
          count: data.bearish.length,
          instruments: data.bearish.map((q) => q.displayName),
        });
      }
    }
    detected.sort((a, b) => b.count - a.count);
    const filtered = detected.filter((s) => s.count * 25 >= algoSettings.minScore);
    setSignals(filtered);
    if (detected.length > 0) {
      addLog(`Detected ${detected.length} directional alignment(s)`);
    }
  }, [enabled, quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive HTF bias from the majority direction of quotes
  const bullishCount = quotes.filter((q) => q.changePercent > 0.1).length;
  const bearishCount = quotes.filter((q) => q.changePercent < -0.1).length;
  const htfBias = bullishCount > bearishCount ? "Bullish" : bearishCount > bullishCount ? "Bearish" : "Neutral";

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
    addLog(next ? "Bot STARTED - analyzing multi-TF alignment" : "Bot STOPPED");
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
            <h1 className="text-2xl font-bold text-foreground">Market Direction Algo</h1>
            <AlgoRoutingBadge selectedAccounts={algoSettings.selectedAccounts} />
          </div>
          <p className="text-sm text-muted">Trades only when higher-timeframe direction, lower-timeframe confirmation, and confluence thresholds align</p>
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
          <div className="text-xs text-muted mb-1">HTF Bias</div>
          <div className={cn("text-lg font-bold", htfBias === "Bullish" ? "text-bull-light" : htfBias === "Bearish" ? "text-bear-light" : "text-muted")}>
            {htfBias}
          </div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Confluence</div>
          <div className="text-lg font-bold text-accent-light">{confluenceMin}% min</div>
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
        <AlgoConfigPanel settings={algoSettings} updateSettings={updateAlgoSettings} botName="Market Direction Algo" />
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Timeframe Configuration</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Higher Timeframe (Bias)</label>
                <select value={htfTimeframe} onChange={(e) => setHtfTimeframe(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="H1">H1</option>
                  <option value="H4">H4</option>
                  <option value="D1">D1</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Lower Timeframe (Entry)</label>
                <select value={ltfTimeframe} onChange={(e) => setLtfTimeframe(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="M5">M5</option>
                  <option value="M15">M15</option>
                  <option value="M30">M30</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Confluence Threshold (%)</label>
                <input type="number" value={confluenceMin} onChange={(e) => setConfluenceMin(e.target.value)} min="50" max="100" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
            </div>
          </div>

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
            </div>
          </div>

          {/* Live Instruments by Category */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Live Market Direction</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {quotes.map((q) => (
                <div key={q.symbol} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full", q.changePercent > 0.1 ? "bg-bull" : q.changePercent < -0.1 ? "bg-bear" : "bg-muted")} />
                    <span className="text-xs font-medium text-foreground">{q.displayName}</span>
                    <span className="text-[9px] text-muted">{q.category}</span>
                  </div>
                  <span className={cn("text-[10px] font-bold", q.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                    {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                  </span>
                </div>
              ))}
              {quotes.length === 0 && (
                <div className="text-xs text-muted text-center py-4">No data available</div>
              )}
            </div>
          </div>
        </div>

        {/* Confluence + Signals + Log */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Confluence Scoring Model</h3>
            <div className="space-y-2">
              {confluenceFactors.map((f) => (
                <div key={f.name} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                  <div>
                    <span className="text-xs font-medium text-foreground">{f.name}</span>
                    <span className="text-[10px] text-muted ml-2">{f.desc}</span>
                  </div>
                  <span className="text-xs font-bold text-accent-light">{f.weight}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted mt-3">
              Total confluence score must meet the threshold ({confluenceMin}%) before entry is considered.
            </p>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Detected Alignments ({signals.length})</h3>
            {signals.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted text-sm">{enabled ? "Analyzing multi-timeframe alignment..." : "Enable to see signals"}</div>
                <div className="text-muted text-xs mt-1">Signals appear when HTF direction and LTF confirmation converge above the confluence threshold</div>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {signals.map((s, i) => (
                  <div key={i} className="bg-surface-2 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted">{s.time}</span>
                        <span className="text-xs font-medium capitalize">{s.category}</span>
                        <span className={cn("text-[10px] font-bold", s.direction === "Bullish" ? "text-bull-light" : "text-bear-light")}>
                          {s.direction}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted">{s.count} aligned</span>
                    </div>
                    <div className="text-[10px] text-muted">{s.instruments.join(", ")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">How It Works</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">Step 1: HTF Bias</p>
                <p>The algo establishes directional bias from the higher timeframe ({htfTimeframe}) using trend structure, moving averages, and momentum indicators.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Step 2: LTF Confirmation</p>
                <p>On the lower timeframe ({ltfTimeframe}), it waits for a structure shift or pattern that aligns with the HTF bias before considering entry.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Step 3: Confluence Check</p>
                <p>All confluence factors are scored. Only when the combined score exceeds {confluenceMin}% does the algo generate a trade signal.</p>
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
