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
  direction: "Bullish Aligned" | "Bearish Aligned" | "Gold Only" | "Silver Only";
  goldPct: number;
  silverPct: number;
  goldPrice: number;
  silverPrice: number;
}

const entryModels = [
  { name: "Trend Continuation", desc: "Enter pullbacks within a confirmed HTF trend", active: true },
  { name: "Pullback to Level", desc: "Enter at key horizontal support/resistance levels", active: true },
  { name: "Horizontal Level Bounce", desc: "React to price testing major historical levels", active: false },
  { name: "Confirmation-Based HTF", desc: "Wait for H4/D1 candle confirmation before entry", active: true },
];

export default function MetalsAlgoPage() {
  const { settings: algoSettings, updateSettings: updateAlgoSettings } = useAlgoConfig("metals");
  const [showConfig, setShowConfig] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [lotSize, setLotSize] = useState("0.10");
  const [maxTrades, setMaxTrades] = useState("3");
  const [maxLoss, setMaxLoss] = useState("250");
  const [maxSpread, setMaxSpread] = useState("3.0");
  const [htfTimeframe, setHtfTimeframe] = useState("H4");
  const [entryTimeframe, setEntryTimeframe] = useState("M15");
  const [activeInstruments, setActiveInstruments] = useState([true, true]); // Gold, Silver
  const [activeModels, setActiveModels] = useState(entryModels.map((m) => m.active));

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

  const toggleInstrument = (index: number) => {
    setActiveInstruments((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const toggleModel = (index: number) => {
    setActiveModels((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  // Find metals quotes
  const gold = quotes.find((q) => q.symbol === "XAUUSD" || q.symbol === "XAU/USD");
  const silver = quotes.find((q) => q.symbol === "XAGUSD" || q.symbol === "XAG/USD");

  // Check if metals are in selected pairs
  const goldInPairs = algoSettings.selectedPairs.length === 0 || algoSettings.selectedPairs.some((p) => p.includes("XAU"));
  const silverInPairs = algoSettings.selectedPairs.length === 0 || algoSettings.selectedPairs.some((p) => p.includes("XAG"));

  // Signal logic: if both metals moving same direction with changePercent > 0.1 = aligned signal
  useEffect(() => {
    if (!enabled) {
      setSignals([]);
      return;
    }
    const filteredGold = goldInPairs ? gold : undefined;
    const filteredSilver = silverInPairs ? silver : undefined;
    if (!filteredGold && !filteredSilver) return;

    const now = new Date().toLocaleTimeString();
    const detected: Signal[] = [];
    const goldPct = filteredGold?.changePercent ?? 0;
    const silverPct = filteredSilver?.changePercent ?? 0;

    if (filteredGold && filteredSilver && goldPct > 0.1 && silverPct > 0.1) {
      detected.push({
        time: now,
        direction: "Bullish Aligned",
        goldPct,
        silverPct,
        goldPrice: filteredGold.price,
        silverPrice: filteredSilver.price,
      });
    } else if (filteredGold && filteredSilver && goldPct < -0.1 && silverPct < -0.1) {
      detected.push({
        time: now,
        direction: "Bearish Aligned",
        goldPct,
        silverPct,
        goldPrice: filteredGold.price,
        silverPrice: filteredSilver.price,
      });
    } else {
      if (filteredGold && Math.abs(goldPct) > 0.1) {
        detected.push({
          time: now,
          direction: "Gold Only",
          goldPct,
          silverPct,
          goldPrice: filteredGold.price,
          silverPrice: filteredSilver?.price ?? 0,
        });
      }
      if (filteredSilver && Math.abs(silverPct) > 0.1) {
        detected.push({
          time: now,
          direction: "Silver Only",
          goldPct,
          silverPct,
          goldPrice: filteredGold?.price ?? 0,
          silverPrice: filteredSilver.price,
        });
      }
    }

    setSignals(detected);
    if (detected.length > 0) {
      addLog(`Metals signal: ${detected[0].direction}`);
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
    addLog(next ? "Bot STARTED - scanning metals" : "Bot STOPPED");
  };

  const instruments = [
    { symbol: "XAU/USD", name: "Gold", quote: gold },
    { symbol: "XAG/USD", name: "Silver", quote: silver },
  ];

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
            <h1 className="text-2xl font-bold text-foreground">Silver & Gold Algo</h1>
            <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20 font-medium">Paper Mode</span>
            <span className="text-xs bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">Metals</span>
          </div>
          <p className="text-sm text-muted">Metals-focused engine for XAU/USD and XAG/USD using trend continuation, pullbacks, horizontal levels, and confirmation-based entries on higher timeframes</p>
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
          <div className="text-xs text-muted mb-1">Active Pairs</div>
          <div className="text-lg font-bold text-accent-light">{activeInstruments.filter(Boolean).length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Signals</div>
          <div className="text-lg font-bold">{signals.length}</div>
        </div>
      </div>

      {/* Live Metals Prices */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Live Metals Prices</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {instruments.map((inst, i) => (
            <div key={inst.symbol} className={cn("bg-surface-2 rounded-xl p-4", !activeInstruments[i] && "opacity-50")}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{inst.symbol}</span>
                  <span className="text-[10px] text-muted">{inst.name}</span>
                </div>
                <div onClick={() => toggleInstrument(i)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", activeInstruments[i] ? "bg-accent" : "bg-surface-3")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", activeInstruments[i] ? "left-5" : "left-0.5")} />
                </div>
              </div>
              {inst.quote ? (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-[10px] text-muted">Price</div>
                    <div className="text-sm font-bold">{inst.quote.price.toFixed(inst.name === "Gold" ? 2 : 3)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted">Change</div>
                    <div className={cn("text-sm font-bold", inst.quote.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                      {inst.quote.changePercent >= 0 ? "+" : ""}{inst.quote.changePercent.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted">H / L</div>
                    <div className="text-[10px] font-mono">{inst.quote.high.toFixed(inst.name === "Gold" ? 2 : 3)} / {inst.quote.low.toFixed(inst.name === "Gold" ? 2 : 3)}</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted">Data unavailable</div>
              )}
            </div>
          ))}
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
            Scanning {activeInstruments.filter(Boolean).length} metals instruments...
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
        <AlgoConfigPanel settings={algoSettings} updateSettings={updateAlgoSettings} botName="Silver & Gold Algo" />
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Entry Models + Timeframe + Risk */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Entry Models</h3>
            <div className="space-y-2">
              {entryModels.map((m, i) => (
                <div key={m.name} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                  <div>
                    <div className="text-xs font-medium text-foreground">{m.name}</div>
                    <div className="text-[10px] text-muted">{m.desc}</div>
                  </div>
                  <div onClick={() => toggleModel(i)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", activeModels[i] ? "bg-accent" : "bg-surface-3")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", activeModels[i] ? "left-5" : "left-0.5")} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Timeframe Configuration</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">HTF Bias</label>
                <select value={htfTimeframe} onChange={(e) => setHtfTimeframe(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="H1">H1</option>
                  <option value="H4">H4</option>
                  <option value="D1">D1</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Entry Timeframe</label>
                <select value={entryTimeframe} onChange={(e) => setEntryTimeframe(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                  <option value="M5">M5</option>
                  <option value="M15">M15</option>
                  <option value="M30">M30</option>
                </select>
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
        </div>

        {/* Signals + Logic + Log */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Detected Signals ({signals.length})</h3>
            {signals.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted text-sm">{enabled ? "Scanning metals markets..." : "Enable to see signals"}</div>
                <div className="text-muted text-xs mt-1">Metals signals appear when the algo detects qualifying setups on XAU/USD or XAG/USD</div>
              </div>
            ) : (
              <div className="space-y-2">
                {signals.map((s, i) => (
                  <div key={i} className="bg-surface-2 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted">{s.time}</span>
                        <span className={cn("text-xs font-bold",
                          s.direction.includes("Bullish") ? "text-bull-light" :
                          s.direction.includes("Bearish") ? "text-bear-light" : "text-accent-light"
                        )}>
                          {s.direction}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted">Gold: </span>
                        <span className="font-mono">{s.goldPrice > 0 ? s.goldPrice.toFixed(2) : "--"}</span>
                        <span className={cn("ml-1 font-bold", s.goldPct >= 0 ? "text-bull-light" : "text-bear-light")}>
                          {s.goldPct >= 0 ? "+" : ""}{s.goldPct.toFixed(2)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted">Silver: </span>
                        <span className="font-mono">{s.silverPrice > 0 ? s.silverPrice.toFixed(3) : "--"}</span>
                        <span className={cn("ml-1 font-bold", s.silverPct >= 0 ? "text-bull-light" : "text-bear-light")}>
                          {s.silverPct >= 0 ? "+" : ""}{s.silverPct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Metals Logic</h3>
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">Gold Characteristics</p>
                <p>XAU/USD is highly sensitive to USD strength, real yields, and risk sentiment. The algo accounts for correlated moves with DXY and US10Y yields when filtering entries.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Silver Characteristics</p>
                <p>XAG/USD has wider spreads and higher volatility than gold. The algo uses wider SL buffers and requires stronger confirmation signals before entry on silver.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Aligned Signal</p>
                <p>When both gold and silver move in the same direction with significant momentum, the algo treats this as a high-conviction metals signal with increased confidence.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">HTF Confirmation</p>
                <p>Entries require confirmation on the {htfTimeframe} timeframe before drilling down to {entryTimeframe} for precise entry timing, reducing false breakouts common in metals.</p>
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
