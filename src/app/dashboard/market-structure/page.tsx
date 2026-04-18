"use client";

import { useState, useEffect, useCallback } from "react";
import { ALL_INSTRUMENTS, MARKET_CATEGORIES } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface SwingPoint {
  type: "HH" | "HL" | "LH" | "LL" | "SH" | "SL";
  price: number;
  time: string;
  index: number;
}

type StructureState = "bullish" | "bearish" | "ranging" | "weakening" | "shifting" | "unclear";

interface StructureEvent {
  type: "BOS" | "MSS" | "INVALIDATION";
  direction: "bullish" | "bearish";
  price: number;
  time: string;
  description: string;
}

interface StructureSnapshot {
  instrument: string;
  timeframe: string;
  state: StructureState;
  confidence: number;
  swings: SwingPoint[];
  events: StructureEvent[];
  invalidationLevel: number | null;
  bias: string;
  quality: "clean" | "messy" | "transitional";
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
}

interface AlignmentData {
  instrument: string;
  timeframes: Record<string, { state: StructureState; confidence: number; bias: string }>;
  overallBias: string;
  aligned: boolean;
}

// ─── Swing Detection Engine ───────────────────────────────────────────────────

function detectSwings(candles: Candle[], lookback: number = 5): SwingPoint[] {
  const swings: SwingPoint[] = [];
  if (candles.length < lookback * 2 + 1) return swings;

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isSwingHigh = false;
      }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      swings.push({ type: "SH", price: candles[i].high, time: candles[i].datetime, index: i });
    }
    if (isSwingLow) {
      swings.push({ type: "SL", price: candles[i].low, time: candles[i].datetime, index: i });
    }
  }

  return swings;
}

// ─── Structure Classification Engine ──────────────────────────────────────────

function classifySwings(swings: SwingPoint[]): SwingPoint[] {
  if (swings.length < 2) return swings;

  const classified = [...swings];
  let lastHigh: number | null = null;
  let lastLow: number | null = null;

  for (const swing of classified) {
    if (swing.type === "SH") {
      if (lastHigh !== null) {
        swing.type = swing.price > lastHigh ? "HH" : "LH";
      }
      lastHigh = swing.price;
    } else if (swing.type === "SL") {
      if (lastLow !== null) {
        swing.type = swing.price > lastLow ? "HL" : "LL";
      }
      lastLow = swing.price;
    }
  }

  return classified;
}

function determineStructureState(swings: SwingPoint[]): { state: StructureState; confidence: number; quality: "clean" | "messy" | "transitional" } {
  if (swings.length < 4) return { state: "unclear", confidence: 0, quality: "messy" };

  const recent = swings.slice(-8);
  const highs = recent.filter(s => s.type === "HH" || s.type === "LH");
  const lows = recent.filter(s => s.type === "HL" || s.type === "LL");

  const hhCount = recent.filter(s => s.type === "HH").length;
  const hlCount = recent.filter(s => s.type === "HL").length;
  const lhCount = recent.filter(s => s.type === "LH").length;
  const llCount = recent.filter(s => s.type === "LL").length;

  const bullishScore = hhCount + hlCount;
  const bearishScore = lhCount + llCount;
  const total = bullishScore + bearishScore;

  if (total === 0) return { state: "unclear", confidence: 0, quality: "messy" };

  const bullishRatio = bullishScore / total;
  const bearishRatio = bearishScore / total;

  // Check quality - are swings clean or overlapping?
  let overlapping = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].type.includes("H") && recent[i - 1].type.includes("L")) {
      if (recent[i].price < recent[i - 1].price) overlapping++;
    }
  }
  const quality: "clean" | "messy" | "transitional" = overlapping === 0 ? "clean" : overlapping <= 1 ? "transitional" : "messy";

  if (bullishRatio >= 0.75) {
    return { state: "bullish", confidence: Math.round(bullishRatio * 100), quality };
  } else if (bearishRatio >= 0.75) {
    return { state: "bearish", confidence: Math.round(bearishRatio * 100), quality };
  } else if (Math.abs(bullishRatio - bearishRatio) < 0.2) {
    return { state: "ranging", confidence: Math.round((1 - Math.abs(bullishRatio - bearishRatio)) * 50), quality };
  } else {
    // Mixed but leaning one way
    const last3 = recent.slice(-3);
    const recentBullish = last3.filter(s => s.type === "HH" || s.type === "HL").length;
    const recentBearish = last3.filter(s => s.type === "LH" || s.type === "LL").length;

    if (bullishRatio > bearishRatio && recentBearish > recentBullish) {
      return { state: "weakening", confidence: 40, quality: "transitional" };
    } else if (bearishRatio > bullishRatio && recentBullish > recentBearish) {
      return { state: "shifting", confidence: 45, quality: "transitional" };
    }

    return { state: bullishRatio > bearishRatio ? "bullish" : "bearish", confidence: Math.round(Math.max(bullishRatio, bearishRatio) * 70), quality };
  }
}

// ─── Break & Shift Detection ─────────────────────────────────────────────────

function detectEvents(swings: SwingPoint[], candles: Candle[]): StructureEvent[] {
  const events: StructureEvent[] = [];
  if (swings.length < 4) return events;

  for (let i = 2; i < swings.length; i++) {
    const current = swings[i];
    const prev = swings[i - 2]; // same type (high vs high, low vs low)

    // Break of Structure (BOS) - continuation
    if (current.type === "HH" && prev.type === "HH") {
      events.push({
        type: "BOS",
        direction: "bullish",
        price: current.price,
        time: current.time,
        description: `Bullish BOS at ${current.price.toFixed(4)} — new higher high above ${prev.price.toFixed(4)}`,
      });
    } else if (current.type === "LL" && prev.type === "LL") {
      events.push({
        type: "BOS",
        direction: "bearish",
        price: current.price,
        time: current.time,
        description: `Bearish BOS at ${current.price.toFixed(4)} — new lower low below ${prev.price.toFixed(4)}`,
      });
    }

    // Market Structure Shift (MSS) - reversal
    if (i >= 3) {
      const prevPrev = swings[i - 3];
      if (current.type === "LH" && prevPrev.type === "HH") {
        events.push({
          type: "MSS",
          direction: "bearish",
          price: current.price,
          time: current.time,
          description: `Bearish MSS — failed to make higher high after ${prevPrev.price.toFixed(4)}`,
        });
      } else if (current.type === "HL" && prevPrev.type === "LL") {
        events.push({
          type: "MSS",
          direction: "bullish",
          price: current.price,
          time: current.time,
          description: `Bullish MSS — higher low formed after lower low at ${prevPrev.price.toFixed(4)}`,
        });
      }
    }
  }

  // Invalidation levels from most recent swings
  const lastHL = [...swings].reverse().find(s => s.type === "HL");
  const lastLH = [...swings].reverse().find(s => s.type === "LH");

  if (lastHL) {
    events.push({
      type: "INVALIDATION",
      direction: "bullish",
      price: lastHL.price,
      time: lastHL.time,
      description: `Bullish invalidation if price breaks below ${lastHL.price.toFixed(4)}`,
    });
  }
  if (lastLH) {
    events.push({
      type: "INVALIDATION",
      direction: "bearish",
      price: lastLH.price,
      time: lastLH.time,
      description: `Bearish invalidation if price breaks above ${lastLH.price.toFixed(4)}`,
    });
  }

  return events;
}

// ─── Full Analysis Pipeline ──────────────────────────────────────────────────

function analyzeStructure(candles: Candle[], instrument: string, timeframe: string, sensitivity: number = 5): StructureSnapshot {
  const rawSwings = detectSwings(candles, sensitivity);
  const swings = classifySwings(rawSwings);
  const { state, confidence, quality } = determineStructureState(swings);
  const events = detectEvents(swings, candles);

  const lastSH = [...swings].reverse().find(s => s.type === "HH" || s.type === "LH" || s.type === "SH");
  const lastSL = [...swings].reverse().find(s => s.type === "HL" || s.type === "LL" || s.type === "SL");

  const invalidation = events.find(e => e.type === "INVALIDATION");

  const biasMap: Record<StructureState, string> = {
    bullish: "Bullish — look for longs",
    bearish: "Bearish — look for shorts",
    ranging: "Neutral — wait for breakout",
    weakening: "Caution — trend losing momentum",
    shifting: "Alert — potential reversal forming",
    unclear: "No clear structure",
  };

  return {
    instrument,
    timeframe,
    state,
    confidence,
    swings,
    events,
    invalidationLevel: invalidation?.price ?? null,
    bias: biasMap[state],
    quality,
    lastSwingHigh: lastSH?.price ?? null,
    lastSwingLow: lastSL?.price ?? null,
  };
}

// ─── TwelveData Symbol Mapping ────────────────────────────────────────────────

function toTwelveDataSymbol(symbol: string): string {
  const map: Record<string, string> = {
    EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", USDCHF: "USD/CHF",
    AUDUSD: "AUD/USD", NZDUSD: "NZD/USD", USDCAD: "USD/CAD", EURJPY: "EUR/JPY",
    GBPJPY: "GBP/JPY", EURGBP: "EUR/GBP", AUDJPY: "AUD/JPY",
    XAUUSD: "XAU/USD", XAGUSD: "XAG/USD",
    BTCUSD: "BTC/USD", ETHUSD: "ETH/USD", SOLUSD: "SOL/USD", XRPUSD: "XRP/USD",
  };
  return map[symbol] || symbol;
}

const TF_MAP: Record<string, string> = {
  "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day",
};

// ─── State Color Helpers ──────────────────────────────────────────────────────

function stateColor(state: StructureState): string {
  switch (state) {
    case "bullish": return "text-emerald-400";
    case "bearish": return "text-red-400";
    case "ranging": return "text-yellow-400";
    case "weakening": return "text-orange-400";
    case "shifting": return "text-purple-400";
    default: return "text-muted";
  }
}

function stateBg(state: StructureState): string {
  switch (state) {
    case "bullish": return "bg-emerald-500/10 border-emerald-500/30";
    case "bearish": return "bg-red-500/10 border-red-500/30";
    case "ranging": return "bg-yellow-500/10 border-yellow-500/30";
    case "weakening": return "bg-orange-500/10 border-orange-500/30";
    case "shifting": return "bg-purple-500/10 border-purple-500/30";
    default: return "bg-surface-2 border-border/50";
  }
}

function qualityBadge(q: "clean" | "messy" | "transitional") {
  const styles = {
    clean: "bg-emerald-500/20 text-emerald-400",
    messy: "bg-red-500/20 text-red-400",
    transitional: "bg-yellow-500/20 text-yellow-400",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${styles[q]}`}>{q.charAt(0).toUpperCase() + q.slice(1)}</span>;
}

function swingBadge(type: string) {
  const colors: Record<string, string> = {
    HH: "bg-emerald-500/20 text-emerald-400",
    HL: "bg-emerald-500/10 text-emerald-300",
    LH: "bg-red-500/10 text-red-300",
    LL: "bg-red-500/20 text-red-400",
    SH: "bg-blue-500/10 text-blue-300",
    SL: "bg-blue-500/10 text-blue-300",
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${colors[type] || "bg-surface-2 text-muted"}`}>{type}</span>;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MarketStructurePage() {
  const [category, setCategory] = useState("all");
  const [selectedInstrument, setSelectedInstrument] = useState("EURUSD");
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
  const [sensitivity, setSensitivity] = useState(5);
  const [snapshot, setSnapshot] = useState<StructureSnapshot | null>(null);
  const [alignment, setAlignment] = useState<AlignmentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "swings" | "events" | "alignment" | "settings">("overview");
  const [showSwings, setShowSwings] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const filteredInstruments = category === "all"
    ? ALL_INSTRUMENTS
    : ALL_INSTRUMENTS.filter(i => i.category === category);

  const fetchCandles = useCallback(async (symbol: string, tf: string): Promise<Candle[]> => {
    try {
      const tdSymbol = toTwelveDataSymbol(symbol);
      const interval = TF_MAP[tf] || "1h";
      const res = await fetch(
        `/api/market/candles?symbol=${encodeURIComponent(tdSymbol)}&interval=${interval}&outputsize=100`
      );
      if (!res.ok) throw new Error("Failed to fetch candles");
      const data = await res.json();
      if (data.values) {
        return data.values.reverse().map((v: any) => ({
          datetime: v.datetime,
          open: parseFloat(v.open),
          high: parseFloat(v.high),
          low: parseFloat(v.low),
          close: parseFloat(v.close),
        }));
      }
      return [];
    } catch {
      return [];
    }
  }, []);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const candles = await fetchCandles(selectedInstrument, selectedTimeframe);
      if (candles.length < 20) {
        setError("Not enough candle data for structure analysis");
        setSnapshot(null);
        return;
      }
      const result = analyzeStructure(candles, selectedInstrument, selectedTimeframe, sensitivity);
      setSnapshot(result);
    } catch (e: any) {
      setError(e.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [selectedInstrument, selectedTimeframe, sensitivity, fetchCandles]);

  const analyzeAlignment = useCallback(async () => {
    const timeframes = ["15m", "1h", "4h", "1d"];
    const results: Record<string, { state: StructureState; confidence: number; bias: string }> = {};

    for (const tf of timeframes) {
      const candles = await fetchCandles(selectedInstrument, tf);
      if (candles.length >= 20) {
        const snap = analyzeStructure(candles, selectedInstrument, tf, sensitivity);
        results[tf] = { state: snap.state, confidence: snap.confidence, bias: snap.bias };
      } else {
        results[tf] = { state: "unclear", confidence: 0, bias: "No data" };
      }
    }

    const states = Object.values(results).map(r => r.state).filter(s => s !== "unclear");
    const bullishCount = states.filter(s => s === "bullish").length;
    const bearishCount = states.filter(s => s === "bearish").length;
    const aligned = bullishCount === states.length || bearishCount === states.length;

    let overallBias = "Mixed";
    if (bullishCount > bearishCount + 1) overallBias = "Bullish";
    else if (bearishCount > bullishCount + 1) overallBias = "Bearish";
    else if (aligned && bullishCount > 0) overallBias = "Strong Bullish";
    else if (aligned && bearishCount > 0) overallBias = "Strong Bearish";

    setAlignment({ instrument: selectedInstrument, timeframes: results, overallBias, aligned });
  }, [selectedInstrument, sensitivity, fetchCandles]);

  useEffect(() => {
    analyze();
  }, [analyze]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(analyze, 60000);
    return () => clearInterval(id);
  }, [autoRefresh, analyze]);

  const displayName = ALL_INSTRUMENTS.find(i => i.symbol === selectedInstrument)?.displayName || selectedInstrument;

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "swings" as const, label: "Swing Points" },
    { id: "events" as const, label: "BOS / MSS Events" },
    { id: "alignment" as const, label: "MTF Alignment" },
    { id: "settings" as const, label: "Preferences" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Market Structure Engine</h1>
          <p className="text-sm text-muted mt-1">
            Swing detection, structural bias, break of structure & shift events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="accent-accent"
            />
            Auto-refresh (60s)
          </label>
          <button
            onClick={analyze}
            disabled={loading}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </div>

      {/* Instrument & Timeframe Selectors */}
      <div className="bg-surface rounded-xl border border-border/50 p-4 space-y-4">
        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          {MARKET_CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                category === c.id
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Instruments */}
        <div className="flex flex-wrap gap-2">
          {filteredInstruments.map(inst => (
            <button
              key={inst.symbol}
              onClick={() => setSelectedInstrument(inst.symbol)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedInstrument === inst.symbol
                  ? "bg-accent/20 text-accent-light border border-accent/40"
                  : "bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {inst.displayName}
            </button>
          ))}
        </div>

        {/* Timeframes */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted">Timeframe:</span>
          <div className="flex gap-2">
            {Object.keys(TF_MAP).map(tf => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedTimeframe === tf
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-muted hover:text-foreground"
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              if (t.id === "alignment" && !alignment) analyzeAlignment();
            }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
              tab === t.id
                ? "border-accent text-accent-light"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Content */}
      {!loading && snapshot && (
        <>
          {/* ─── OVERVIEW TAB ──────────────────────────────────────────── */}
          {tab === "overview" && (
            <div className="space-y-6">
              {/* Bias Card */}
              <div className={`rounded-xl border p-6 ${stateBg(snapshot.state)}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wider mb-1">Structural Bias</p>
                    <h2 className={`text-3xl font-bold ${stateColor(snapshot.state)}`}>
                      {snapshot.state.charAt(0).toUpperCase() + snapshot.state.slice(1)}
                    </h2>
                    <p className="text-sm text-muted-light mt-1">{snapshot.bias}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-muted mb-1">Confidence</p>
                      <p className={`text-2xl font-bold ${stateColor(snapshot.state)}`}>{snapshot.confidence}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted mb-1">Quality</p>
                      {qualityBadge(snapshot.quality)}
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted mb-1">Swings</p>
                      <p className="text-lg font-semibold">{snapshot.swings.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Levels */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface rounded-xl border border-border/50 p-4">
                  <p className="text-xs text-muted mb-1">Last Swing High</p>
                  <p className="text-xl font-bold text-emerald-400">
                    {snapshot.lastSwingHigh?.toFixed(5) ?? "—"}
                  </p>
                </div>
                <div className="bg-surface rounded-xl border border-border/50 p-4">
                  <p className="text-xs text-muted mb-1">Last Swing Low</p>
                  <p className="text-xl font-bold text-red-400">
                    {snapshot.lastSwingLow?.toFixed(5) ?? "—"}
                  </p>
                </div>
                <div className="bg-surface rounded-xl border border-border/50 p-4">
                  <p className="text-xs text-muted mb-1">Invalidation Level</p>
                  <p className="text-xl font-bold text-yellow-400">
                    {snapshot.invalidationLevel?.toFixed(5) ?? "—"}
                  </p>
                </div>
              </div>

              {/* Recent Events Summary */}
              <div className="bg-surface rounded-xl border border-border/50 p-4">
                <h3 className="text-sm font-semibold mb-3">Recent Structure Events</h3>
                {snapshot.events.length === 0 ? (
                  <p className="text-sm text-muted">No structure events detected in current data window</p>
                ) : (
                  <div className="space-y-2">
                    {snapshot.events.slice(-5).map((e, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                          e.type === "BOS" ? "bg-blue-500/20 text-blue-400" :
                          e.type === "MSS" ? "bg-purple-500/20 text-purple-400" :
                          "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {e.type}
                        </span>
                        <span className={`text-xs ${e.direction === "bullish" ? "text-emerald-400" : "text-red-400"}`}>
                          {e.direction === "bullish" ? "▲" : "▼"}
                        </span>
                        <span className="text-muted-light flex-1">{e.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Swing Sequence Visual */}
              <div className="bg-surface rounded-xl border border-border/50 p-4">
                <h3 className="text-sm font-semibold mb-3">Swing Sequence</h3>
                <div className="flex flex-wrap gap-2">
                  {snapshot.swings.slice(-20).map((s, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-1">
                      {swingBadge(s.type)}
                      <span className="text-[10px] text-muted font-mono">{s.price.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
                {snapshot.swings.length === 0 && (
                  <p className="text-sm text-muted">No swings detected — try adjusting sensitivity</p>
                )}
              </div>
            </div>
          )}

          {/* ─── SWINGS TAB ────────────────────────────────────────────── */}
          {tab === "swings" && (
            <div className="bg-surface rounded-xl border border-border/50">
              <div className="p-4 border-b border-border/50 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Detected Swing Points — {displayName} ({selectedTimeframe.toUpperCase()})
                </h3>
                <span className="text-xs text-muted">{snapshot.swings.length} swings found</span>
              </div>
              {snapshot.swings.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted">
                  No swings detected. Try lowering the sensitivity value.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted border-b border-border/30">
                        <th className="text-left p-3">#</th>
                        <th className="text-left p-3">Type</th>
                        <th className="text-left p-3">Price</th>
                        <th className="text-left p-3">Time</th>
                        <th className="text-left p-3">Significance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.swings.map((s, idx) => (
                        <tr key={idx} className="border-b border-border/10 hover:bg-surface-2/50">
                          <td className="p-3 text-muted">{idx + 1}</td>
                          <td className="p-3">{swingBadge(s.type)}</td>
                          <td className="p-3 font-mono">{s.price.toFixed(5)}</td>
                          <td className="p-3 text-muted">{s.time}</td>
                          <td className="p-3">
                            {(s.type === "HH" || s.type === "LL") ? (
                              <span className="text-xs text-accent">Key level</span>
                            ) : (s.type === "LH" || s.type === "HL") ? (
                              <span className="text-xs text-yellow-400">Structure marker</span>
                            ) : (
                              <span className="text-xs text-muted">Pivot</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── EVENTS TAB ────────────────────────────────────────────── */}
          {tab === "events" && (
            <div className="space-y-4">
              <div className="bg-surface rounded-xl border border-border/50 p-4">
                <h3 className="text-sm font-semibold mb-1">Structure Events Legend</h3>
                <div className="flex flex-wrap gap-4 text-xs text-muted mt-2">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" /> BOS — Break of Structure (continuation)</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-purple-400 mr-1" /> MSS — Market Structure Shift (reversal)</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1" /> INV — Invalidation Level</span>
                </div>
              </div>

              <div className="bg-surface rounded-xl border border-border/50">
                <div className="p-4 border-b border-border/50">
                  <h3 className="text-sm font-semibold">
                    Events — {displayName} ({selectedTimeframe.toUpperCase()})
                  </h3>
                </div>
                {snapshot.events.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted">
                    No structure events detected in current data window.
                  </div>
                ) : (
                  <div className="divide-y divide-border/10">
                    {snapshot.events.map((e, idx) => (
                      <div key={idx} className="p-4 flex items-start gap-4 hover:bg-surface-2/50">
                        <div className={`mt-0.5 w-10 text-center py-1 rounded text-xs font-mono font-bold ${
                          e.type === "BOS" ? "bg-blue-500/20 text-blue-400" :
                          e.type === "MSS" ? "bg-purple-500/20 text-purple-400" :
                          "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {e.type === "INVALIDATION" ? "INV" : e.type}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm">{e.description}</p>
                          <p className="text-xs text-muted mt-1">
                            {e.direction === "bullish" ? "▲ Bullish" : "▼ Bearish"} · Price: {e.price.toFixed(5)} · {e.time}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── ALIGNMENT TAB ─────────────────────────────────────────── */}
          {tab === "alignment" && (
            <div className="space-y-4">
              {!alignment ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <p className="text-sm text-muted">Multi-timeframe alignment analysis not yet loaded</p>
                  <button
                    onClick={analyzeAlignment}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80"
                  >
                    Run MTF Analysis
                  </button>
                </div>
              ) : (
                <>
                  {/* Overall */}
                  <div className={`rounded-xl border p-5 ${alignment.aligned ? "bg-emerald-500/10 border-emerald-500/30" : "bg-surface border-border/50"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-1">Overall Structural Bias</p>
                        <h2 className="text-2xl font-bold">{alignment.overallBias}</h2>
                      </div>
                      {alignment.aligned && (
                        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium">
                          All Timeframes Aligned
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Timeframe Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(alignment.timeframes).map(([tf, data]) => (
                      <div key={tf} className={`rounded-xl border p-4 ${stateBg(data.state)}`}>
                        <p className="text-xs text-muted uppercase tracking-wider mb-2">{tf.toUpperCase()}</p>
                        <p className={`text-lg font-bold ${stateColor(data.state)}`}>
                          {data.state.charAt(0).toUpperCase() + data.state.slice(1)}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-muted">Confidence</span>
                          <span className="text-sm font-semibold">{data.confidence}%</span>
                        </div>
                        <p className="text-xs text-muted mt-1">{data.bias}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={analyzeAlignment}
                    className="px-4 py-2 bg-surface-2 text-foreground rounded-lg text-sm hover:bg-surface-2/80 border border-border/50"
                  >
                    Refresh Alignment
                  </button>
                </>
              )}
            </div>
          )}

          {/* ─── SETTINGS TAB ──────────────────────────────────────────── */}
          {tab === "settings" && (
            <div className="bg-surface rounded-xl border border-border/50 p-6 space-y-6 max-w-xl">
              <h3 className="text-sm font-semibold">Structure Preferences</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-light block mb-2">
                    Swing Sensitivity (lookback candles: {sensitivity})
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={10}
                    value={sensitivity}
                    onChange={e => setSensitivity(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                  <div className="flex justify-between text-xs text-muted mt-1">
                    <span>More sensitive (2)</span>
                    <span>Less sensitive (10)</span>
                  </div>
                  <p className="text-xs text-muted mt-2">
                    Lower values detect more swings (including noise). Higher values find only major pivots.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Show Swing Points</p>
                    <p className="text-xs text-muted">Display HH/HL/LH/LL markers</p>
                  </div>
                  <button
                    onClick={() => setShowSwings(!showSwings)}
                    className={`w-10 h-5 rounded-full transition-colors ${showSwings ? "bg-accent" : "bg-surface-2"}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showSwings ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Show Labels</p>
                    <p className="text-xs text-muted">Display price labels on swing points</p>
                  </div>
                  <button
                    onClick={() => setShowLabels(!showLabels)}
                    className={`w-10 h-5 rounded-full transition-colors ${showLabels ? "bg-accent" : "bg-surface-2"}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showLabels ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Auto Refresh</p>
                    <p className="text-xs text-muted">Re-analyze every 60 seconds</p>
                  </div>
                  <button
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className={`w-10 h-5 rounded-full transition-colors ${autoRefresh ? "bg-accent" : "bg-surface-2"}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${autoRefresh ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>

              <button
                onClick={analyze}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80"
              >
                Re-analyze with New Settings
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
