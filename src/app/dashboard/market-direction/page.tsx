"use client";

import { useState, useEffect, useCallback } from "react";
import { ALL_INSTRUMENTS, MARKET_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

type Direction = "bullish" | "bearish" | "neutral" | "transitioning";
type SetupType = "Pullback" | "Breakout" | "Continuation" | "Reversal" | "Range Break";
type SetupStyle = "aggressive" | "standard" | "conservative";
type SetupStatus = "fresh" | "active" | "near_entry" | "triggered" | "invalidated" | "expired";
type QualityGrade = "A+" | "A" | "B+" | "B" | "C+" | "C";

interface DirectionRow {
  symbol: string;
  displayName: string;
  category: string;
  price: number;
  changePercent: number;
  tfDirections: Record<string, Direction>;
  overallDirection: Direction;
  confidence: number;
  aligned: boolean;
}

interface SetupReason {
  key: string;
  text: string;
  weight: number;
  positive: boolean;
}

interface DirectionSetup {
  id: string;
  instrument: string;
  displayName: string;
  category: string;
  direction: "buy" | "sell";
  setupType: SetupType;
  setupStyle: SetupStyle;
  timeframe: string;
  entryZone: { low: number; high: number };
  stopLoss: number;
  targets: number[];
  riskReward: number;
  qualityScore: number;
  qualityGrade: QualityGrade;
  status: SetupStatus;
  reasons: SetupReason[];
  rationale: string;
  invalidation: string;
  directionContext: string;
  createdAt: number;
}

// ─── Direction Detection from Candles ─────────────────────────────────────────

function detectDirection(candles: Candle[]): { dir: Direction; confidence: number } {
  if (candles.length < 14) return { dir: "neutral", confidence: 20 };

  const recent = candles.slice(-10);
  const prior = candles.slice(-20, -10);
  const recentAvg = recent.reduce((s, c) => s + c.close, 0) / recent.length;
  const priorAvg = prior.length > 0 ? prior.reduce((s, c) => s + c.close, 0) / prior.length : recentAvg;

  const last = candles[candles.length - 1];
  const ref = candles[Math.max(0, candles.length - 5)];
  const momentum = (last.close - ref.close) / ref.close * 100;

  let hhCount = 0, llCount = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].high > recent[i - 1].high) hhCount++;
    if (recent[i].low < recent[i - 1].low) llCount++;
  }

  const trendBias = recentAvg > priorAvg ? 1 : -1;
  const structBias = hhCount > llCount ? 1 : llCount > hhCount ? -1 : 0;

  let dir: Direction;
  if (trendBias === 1 && structBias === 1 && momentum > 0.03) dir = "bullish";
  else if (trendBias === -1 && structBias === -1 && momentum < -0.03) dir = "bearish";
  else if (trendBias !== structBias) dir = "transitioning";
  else dir = "neutral";

  // Confidence
  const atr = candles.slice(-14).reduce((s, c) => s + (c.high - c.low), 0) / 14;
  const momStrength = Math.min(30, Math.abs(momentum) / (atr / last.close * 100) * 15);
  const bullCandles = recent.filter(c => c.close > c.open).length;
  const consistency = dir === "bullish" ? (bullCandles / recent.length) * 25 :
    dir === "bearish" ? ((recent.length - bullCandles) / recent.length) * 25 : 10;
  const conf = dir === "neutral" ? 25 : dir === "transitioning" ? 35 : Math.min(95, Math.round(40 + momStrength + consistency));

  return { dir, confidence: conf };
}

// ─── Setup Generation ─────────────────────────────────────────────────────────

function generateSetups(
  candles: Candle[],
  inst: typeof ALL_INSTRUMENTS[number],
  direction: Direction,
  confidence: number,
  aligned: boolean,
  tf: string
): DirectionSetup[] {
  if (candles.length < 20 || direction === "neutral") return [];

  const setups: DirectionSetup[] = [];
  const last = candles[candles.length - 1];
  const atr = candles.slice(-14).reduce((s, c) => s + (c.high - c.low), 0) / 14;
  const dec = inst.decimals;
  const rd = (v: number) => Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);

  const isBull = direction === "bullish" || (direction === "transitioning" && last.close > last.open);
  const tradeDir: "buy" | "sell" = isBull ? "buy" : "sell";

  const configs: { type: SetupType; style: SetupStyle }[] =
    direction === "transitioning"
      ? [{ type: "Reversal", style: "aggressive" }, { type: "Range Break", style: "standard" }]
      : [{ type: "Pullback", style: "standard" }, { type: "Continuation", style: "conservative" }, { type: "Breakout", style: "aggressive" }];

  for (const { type, style } of configs) {
    const reasons: SetupReason[] = [];
    let eLow: number, eHigh: number, sl: number, tp1: number, tp2: number, tp3: number;

    switch (type) {
      case "Pullback": {
        const pd = atr * 0.5;
        eLow = isBull ? last.close - pd : last.close + pd * 0.3;
        eHigh = isBull ? last.close - pd * 0.3 : last.close + pd;
        sl = isBull ? eLow - atr * 0.8 : eHigh + atr * 0.8;
        tp1 = isBull ? last.close + atr * 1.2 : last.close - atr * 1.2;
        tp2 = isBull ? last.close + atr * 2.0 : last.close - atr * 2.0;
        tp3 = isBull ? last.close + atr * 3.0 : last.close - atr * 3.0;
        reasons.push(
          { key: "trend", text: `${isBull ? "Bullish" : "Bearish"} trend intact — pullback into value`, weight: 25, positive: true },
          { key: "structure", text: "Structure supports continuation after correction", weight: 20, positive: true },
        );
        break;
      }
      case "Continuation": {
        eLow = last.close;
        eHigh = isBull ? last.close + atr * 0.2 : last.close - atr * 0.2;
        sl = isBull ? last.low - atr * 0.5 : last.high + atr * 0.5;
        tp1 = isBull ? last.close + atr * 1.5 : last.close - atr * 1.5;
        tp2 = isBull ? last.close + atr * 2.5 : last.close - atr * 2.5;
        tp3 = isBull ? last.close + atr * 3.5 : last.close - atr * 3.5;
        reasons.push(
          { key: "momentum", text: "Momentum aligned with directional bias", weight: 20, positive: true },
          { key: "trend", text: "Trend continuation expected", weight: 25, positive: true },
        );
        break;
      }
      case "Breakout": {
        const sHi = Math.max(...candles.slice(-20).map(c => c.high));
        const sLo = Math.min(...candles.slice(-20).map(c => c.low));
        eLow = isBull ? sHi : sLo - atr * 0.3;
        eHigh = isBull ? sHi + atr * 0.3 : sLo;
        sl = isBull ? sHi - atr * 0.8 : sLo + atr * 0.8;
        tp1 = isBull ? sHi + atr * 1.5 : sLo - atr * 1.5;
        tp2 = isBull ? sHi + atr * 2.5 : sLo - atr * 2.5;
        tp3 = isBull ? sHi + atr * 4.0 : sLo - atr * 4.0;
        reasons.push(
          { key: "breakout", text: `Breaking ${isBull ? "above" : "below"} structural level`, weight: 30, positive: true },
          { key: "direction", text: "Breakout matches higher-timeframe bias", weight: 20, positive: true },
        );
        break;
      }
      case "Reversal": {
        eLow = last.close;
        eHigh = isBull ? last.close + atr * 0.3 : last.close - atr * 0.3;
        sl = isBull ? last.low - atr : last.high + atr;
        tp1 = isBull ? last.close + atr : last.close - atr;
        tp2 = isBull ? last.close + atr * 2 : last.close - atr * 2;
        tp3 = isBull ? last.close + atr * 3 : last.close - atr * 3;
        reasons.push(
          { key: "shift", text: "Structure shift detected", weight: 20, positive: true },
          { key: "caution", text: "Transitioning direction — reduced conviction", weight: -10, positive: false },
        );
        break;
      }
      case "Range Break": {
        const rHi = Math.max(...candles.slice(-15).map(c => c.high));
        const rLo = Math.min(...candles.slice(-15).map(c => c.low));
        const rng = rHi - rLo;
        eLow = isBull ? rHi : rLo - atr * 0.2;
        eHigh = isBull ? rHi + atr * 0.2 : rLo;
        sl = isBull ? rLo + rng * 0.3 : rHi - rng * 0.3;
        tp1 = isBull ? rHi + rng : rLo - rng;
        tp2 = isBull ? rHi + rng * 1.5 : rLo - rng * 1.5;
        tp3 = tp2;
        reasons.push({ key: "range", text: `Range break ${isBull ? "upside" : "downside"} expected`, weight: 20, positive: true });
        break;
      }
      default: {
        eLow = last.close; eHigh = last.close + atr * 0.1;
        sl = isBull ? last.close - atr : last.close + atr;
        tp1 = isBull ? last.close + atr * 1.5 : last.close - atr * 1.5;
        tp2 = tp1; tp3 = tp1;
      }
    }

    if (aligned) reasons.push({ key: "alignment", text: "Multi-timeframe alignment confirmed", weight: 15, positive: true });
    else reasons.push({ key: "alignment", text: "Timeframes not aligned — reduced weight", weight: -5, positive: false });
    if (confidence >= 70) reasons.push({ key: "confidence", text: `High directional confidence (${confidence}%)`, weight: 10, positive: true });

    const totalWeight = reasons.reduce((s, r) => s + r.weight, 0);
    const score = Math.max(30, Math.min(98, 50 + totalWeight));
    const grade: QualityGrade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B+" : score >= 60 ? "B" : score >= 50 ? "C+" : "C";

    const mid = (Math.min(eLow, eHigh) + Math.max(eLow, eHigh)) / 2;
    const slDist = Math.abs(mid - sl);
    const rr = slDist > 0 ? Math.round((Math.abs(tp1 - mid) / slDist) * 10) / 10 : 0;

    setups.push({
      id: `mds_${inst.symbol}_${type}_${Date.now()}`,
      instrument: inst.symbol,
      displayName: inst.displayName,
      category: inst.category,
      direction: tradeDir,
      setupType: type,
      setupStyle: style,
      timeframe: tf,
      entryZone: { low: rd(Math.min(eLow, eHigh)), high: rd(Math.max(eLow, eHigh)) },
      stopLoss: rd(sl),
      targets: [rd(tp1), rd(tp2), rd(tp3)],
      riskReward: rr,
      qualityScore: score,
      qualityGrade: grade,
      status: "fresh",
      reasons,
      rationale: `${inst.displayName} ${isBull ? "bullish" : "bearish"} ${type.toLowerCase()} on ${tf}. Direction engine shows ${direction} bias at ${confidence}% confidence. ${aligned ? "All timeframes aligned." : "Mixed timeframe alignment."} ${style.charAt(0).toUpperCase() + style.slice(1)} entry with ${rr}:1 R:R.`,
      invalidation: `Invalidated if price ${tradeDir === "buy" ? "closes below" : "closes above"} ${rd(sl)}`,
      directionContext: `${inst.displayName}: ${direction} direction, ${confidence}% confidence`,
      createdAt: Date.now(),
    });
  }

  return setups.sort((a, b) => b.qualityScore - a.qualityScore);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTD(s: string): string {
  const m: Record<string, string> = {
    EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", USDCHF: "USD/CHF",
    AUDUSD: "AUD/USD", NZDUSD: "NZD/USD", USDCAD: "USD/CAD", EURJPY: "EUR/JPY",
    GBPJPY: "GBP/JPY", EURGBP: "EUR/GBP", AUDJPY: "AUD/JPY",
    XAUUSD: "XAU/USD", XAGUSD: "XAG/USD", BTCUSD: "BTC/USD", ETHUSD: "ETH/USD", SOLUSD: "SOL/USD", XRPUSD: "XRP/USD",
  };
  return m[s] || s;
}
const TF_API: Record<string, string> = { "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day" };

function dirColor(d: Direction) { return d === "bullish" ? "text-emerald-400" : d === "bearish" ? "text-red-400" : d === "transitioning" ? "text-purple-400" : "text-yellow-400"; }
function dirBg(d: Direction) { return d === "bullish" ? "bg-emerald-500/10 border-emerald-500/30" : d === "bearish" ? "bg-red-500/10 border-red-500/30" : d === "transitioning" ? "bg-purple-500/10 border-purple-500/30" : "bg-yellow-500/10 border-yellow-500/30"; }
function dirBadge(d: Direction) { return d === "bullish" ? "badge-bull" : d === "bearish" ? "badge-bear" : "bg-surface-2 text-muted"; }
function gradeColor(g: QualityGrade) { return g === "A+" || g === "A" ? "text-emerald-400" : g === "B+" || g === "B" ? "text-yellow-400" : "text-muted"; }
function gradeBg(g: QualityGrade) { return g === "A+" || g === "A" ? "bg-emerald-500/20" : g === "B+" || g === "B" ? "bg-yellow-500/20" : "bg-surface-2"; }

function statusBadge(s: SetupStatus) {
  const st: Record<string, string> = { fresh: "bg-blue-500/20 text-blue-400", active: "bg-emerald-500/20 text-emerald-400", near_entry: "bg-yellow-500/20 text-yellow-400", triggered: "bg-accent/20 text-accent-light", invalidated: "bg-red-500/20 text-red-400", expired: "bg-surface-2 text-muted" };
  const lb: Record<string, string> = { fresh: "Fresh", active: "Active", near_entry: "Near Entry", triggered: "Triggered", invalidated: "Invalidated", expired: "Expired" };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${st[s]}`}>{lb[s]}</span>;
}
function styleBadge(s: SetupStyle) {
  const st: Record<string, string> = { aggressive: "bg-red-500/15 text-red-300", standard: "bg-blue-500/15 text-blue-300", conservative: "bg-emerald-500/15 text-emerald-300" };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full ${st[s]}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MarketDirectionPage() {
  const [tab, setTab] = useState<"matrix" | "setups" | "detail" | "history" | "preferences">("matrix");
  const [category, setCategory] = useState("all");
  const [rows, setRows] = useState<DirectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  // Setup generation state
  const [selectedInstrument, setSelectedInstrument] = useState("EURUSD");
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
  const [setupList, setSetupList] = useState<DirectionSetup[]>([]);
  const [setupLoading, setSetupLoading] = useState(false);
  const [expandedSetup, setExpandedSetup] = useState<string | null>(null);
  const [minQuality, setMinQuality] = useState(50);
  const [setupHistory, setSetupHistory] = useState<DirectionSetup[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const filteredInstruments = category === "all" ? ALL_INSTRUMENTS : ALL_INSTRUMENTS.filter(i => i.category === category);

  // ─── Load Direction Matrix from live quotes ─────────────────────────────────
  const loadMatrix = useCallback(async () => {
    try {
      const res = await fetch("/api/market/quotes");
      const data = await res.json();
      if (!data.quotes) return;

      const built: DirectionRow[] = data.quotes.map((q: any) => {
        const pct = q.changePercent ?? 0;
        // Derive per-timeframe direction from price action heuristics
        const tfDirs: Record<string, Direction> = {};
        const tfs = ["5m", "15m", "1h", "4h"];
        const factors = [0.3, 0.6, 1.0, 1.4];
        for (let i = 0; i < tfs.length; i++) {
          const adj = pct * factors[i];
          tfDirs[tfs[i]] = adj > 0.15 ? "bullish" : adj < -0.15 ? "bearish" : "neutral";
        }
        const dirs = Object.values(tfDirs).filter(d => d !== "neutral");
        const bullCount = dirs.filter(d => d === "bullish").length;
        const bearCount = dirs.filter(d => d === "bearish").length;
        const aligned = (bullCount === dirs.length || bearCount === dirs.length) && dirs.length >= 3;
        const overall: Direction = bullCount > bearCount + 1 ? "bullish" : bearCount > bullCount + 1 ? "bearish" : bullCount > 0 && bearCount > 0 ? "transitioning" : "neutral";
        const conf = aligned ? Math.min(90, 50 + Math.abs(pct) * 20) : Math.min(60, 30 + Math.abs(pct) * 10);

        return {
          symbol: q.symbol,
          displayName: q.displayName || q.symbol,
          category: q.category || "forex",
          price: q.price,
          changePercent: pct,
          tfDirections: tfDirs,
          overallDirection: overall,
          confidence: Math.round(conf),
          aligned,
        };
      });
      setRows(built);
      setLastUpdated(new Date(data.timestamp).toLocaleTimeString());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadMatrix(); }, [loadMatrix]);

  // ─── Generate Setups for selected instrument ───────────────────────────────
  const fetchCandles = useCallback(async (symbol: string, tf: string): Promise<Candle[]> => {
    try {
      const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(toTD(symbol))}&interval=${TF_API[tf] || "1h"}&outputsize=100`);
      if (!res.ok) return [];
      const data = await res.json();
      if (data.values) return data.values.reverse().map((v: any) => ({ datetime: v.datetime, open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close) }));
      return [];
    } catch { return []; }
  }, []);

  const scanSetups = useCallback(async () => {
    setSetupLoading(true);
    try {
      const candles = await fetchCandles(selectedInstrument, selectedTimeframe);
      if (candles.length < 20) { setSetupList([]); return; }

      const { dir, confidence } = detectDirection(candles);

      // Check alignment via additional TFs
      const otherTFs = ["1h", "4h", "1d"].filter(t => t !== selectedTimeframe).slice(0, 2);
      const alignDirs: Direction[] = [dir];
      for (const tf of otherTFs) {
        const tfC = await fetchCandles(selectedInstrument, tf);
        if (tfC.length >= 14) alignDirs.push(detectDirection(tfC).dir);
      }
      const nonNeutral = alignDirs.filter(d => d !== "neutral");
      const aligned = nonNeutral.length >= 2 && nonNeutral.every(d => d === nonNeutral[0]);

      const inst = ALL_INSTRUMENTS.find(i => i.symbol === selectedInstrument);
      if (inst) {
        const newSetups = generateSetups(candles, inst, dir, confidence, aligned, selectedTimeframe);
        setSetupList(newSetups);
        setSetupHistory(prev => [...newSetups, ...prev].slice(0, 50));
      }
    } catch {} finally { setSetupLoading(false); }
  }, [selectedInstrument, selectedTimeframe, fetchCandles]);

  useEffect(() => {
    if (tab === "setups" || tab === "detail") scanSetups();
  }, [tab, scanSetups]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { loadMatrix(); if (tab === "setups") scanSetups(); }, 120000);
    return () => clearInterval(id);
  }, [autoRefresh, loadMatrix, scanSetups, tab]);

  const visibleSetups = setupList.filter(s => s.qualityScore >= minQuality);
  const filteredRows = category === "all" ? rows : rows.filter(r => r.category === category);
  const strongBias = rows.filter(r => r.confidence >= 60);

  const tabs = [
    { id: "matrix" as const, label: "Direction Matrix" },
    { id: "setups" as const, label: "Trade Setups" },
    { id: "detail" as const, label: "Direction Detail" },
    { id: "history" as const, label: "Setup History" },
    { id: "preferences" as const, label: "Preferences" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Market Direction</h1>
          <p className="text-sm text-muted mt-1">
            Directional bias engine with execution-ready trade setups
          </p>
          {lastUpdated && <p className="text-xs text-muted mt-1">Live data · {lastUpdated}</p>}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-accent" />
            Auto (2m)
          </label>
          <button onClick={() => { loadMatrix(); if (tab === "setups") scanSetups(); }} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80">
            Refresh
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {MARKET_CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${category === c.id ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-foreground"}`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${tab === t.id ? "border-accent text-accent-light" : "border-transparent text-muted hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface rounded-xl border border-border/50 p-3 text-center">
          <p className="text-xl font-bold">{rows.length}</p>
          <p className="text-xs text-muted">Instruments</p>
        </div>
        <div className="bg-surface rounded-xl border border-border/50 p-3 text-center">
          <p className="text-xl font-bold text-emerald-400">{rows.filter(r => r.overallDirection === "bullish").length}</p>
          <p className="text-xs text-muted">Bullish</p>
        </div>
        <div className="bg-surface rounded-xl border border-border/50 p-3 text-center">
          <p className="text-xl font-bold text-red-400">{rows.filter(r => r.overallDirection === "bearish").length}</p>
          <p className="text-xs text-muted">Bearish</p>
        </div>
        <div className="bg-surface rounded-xl border border-border/50 p-3 text-center">
          <p className="text-xl font-bold text-accent-light">{rows.filter(r => r.aligned).length}</p>
          <p className="text-xs text-muted">Fully Aligned</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ═══ MATRIX TAB ═══════════════════════════════════════════════ */}
      {!loading && tab === "matrix" && (
        <div className="bg-surface rounded-xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left text-xs text-muted font-medium px-4 py-3">Instrument</th>
                  {["5m", "15m", "1h", "4h"].map(tf => (
                    <th key={tf} className="text-center text-xs text-muted font-medium px-3 py-3">{tf.toUpperCase()}</th>
                  ))}
                  <th className="text-center text-xs text-muted font-medium px-3 py-3">Overall</th>
                  <th className="text-center text-xs text-muted font-medium px-3 py-3">Confidence</th>
                  <th className="text-center text-xs text-muted font-medium px-3 py-3">Aligned</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.symbol} className="border-b border-border/10 hover:bg-surface-2/50 transition-colors cursor-pointer" onClick={() => { setSelectedInstrument(row.symbol); setTab("setups"); }}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold">{row.displayName}</div>
                      <div className="text-xs text-muted capitalize">{row.category}</div>
                    </td>
                    {["5m", "15m", "1h", "4h"].map(tf => {
                      const d = row.tfDirections[tf] || "neutral";
                      return (
                        <td key={tf} className="px-3 py-3 text-center">
                          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", dirBadge(d))}>
                            {d === "bullish" ? "▲ Bull" : d === "bearish" ? "▼ Bear" : "— Neut"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center">
                      <span className={`text-sm font-bold ${dirColor(row.overallDirection)}`}>
                        {row.overallDirection.charAt(0).toUpperCase() + row.overallDirection.slice(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div className={`h-full rounded-full ${row.confidence >= 70 ? "bg-emerald-500" : row.confidence >= 50 ? "bg-accent" : "bg-yellow-500"}`} style={{ width: `${row.confidence}%` }} />
                        </div>
                        <span className="text-xs font-mono text-muted">{row.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {row.aligned ? (
                        <span className="text-xs text-emerald-400 font-semibold">Yes</span>
                      ) : (
                        <span className="text-xs text-muted">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRows.length === 0 && (
            <div className="p-12 text-center text-sm text-muted">No data available for selected category.</div>
          )}
        </div>
      )}

      {/* ═══ SETUPS TAB ═══════════════════════════════════════════════ */}
      {!loading && tab === "setups" && (
        <div className="space-y-4">
          {/* Instrument selector */}
          <div className="bg-surface rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {filteredInstruments.map(inst => (
                <button key={inst.symbol} onClick={() => setSelectedInstrument(inst.symbol)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedInstrument === inst.symbol ? "bg-accent/20 text-accent-light border border-accent/40" : "bg-surface-2 text-muted hover:text-foreground"}`}>
                  {inst.displayName}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted">Timeframe:</span>
              <div className="flex gap-2">
                {Object.keys(TF_API).map(tf => (
                  <button key={tf} onClick={() => setSelectedTimeframe(tf)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedTimeframe === tf ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-foreground"}`}>
                    {tf.toUpperCase()}
                  </button>
                ))}
              </div>
              <button onClick={scanSetups} disabled={setupLoading} className="ml-auto px-4 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/80 disabled:opacity-50">
                {setupLoading ? "Scanning..." : "Scan"}
              </button>
            </div>
          </div>

          {setupLoading && <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}

          {!setupLoading && visibleSetups.length === 0 && (
            <div className="bg-surface rounded-xl border border-border/50 p-12 text-center">
              <p className="text-muted text-sm">No direction-aligned setups for {ALL_INSTRUMENTS.find(i => i.symbol === selectedInstrument)?.displayName} on {selectedTimeframe.toUpperCase()}</p>
              <p className="text-xs text-muted mt-2">Direction may be neutral, or quality is below threshold ({minQuality}). Try another instrument or lower threshold.</p>
            </div>
          )}

          {!setupLoading && visibleSetups.map(setup => (
            <div key={setup.id} className="bg-surface rounded-xl border border-border/50 overflow-hidden">
              <button onClick={() => setExpandedSetup(expandedSetup === setup.id ? null : setup.id)} className="w-full p-4 flex items-center justify-between hover:bg-surface-2/30 transition-colors text-left">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${gradeBg(setup.qualityGrade)} ${gradeColor(setup.qualityGrade)}`}>
                    {setup.qualityGrade}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{setup.displayName}</span>
                      <span className={`text-xs font-semibold ${setup.direction === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                        {setup.direction === "buy" ? "▲ LONG" : "▼ SHORT"}
                      </span>
                      {statusBadge(setup.status)}
                      {styleBadge(setup.setupStyle)}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {setup.setupType} · {setup.timeframe.toUpperCase()} · {setup.riskReward}:1 R:R · Score {setup.qualityScore}/100
                    </p>
                  </div>
                </div>
                <svg className={`w-5 h-5 text-muted transition-transform ${expandedSetup === setup.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>

              {expandedSetup === setup.id && (
                <div className="border-t border-border/30 p-4 space-y-4">
                  <div className="bg-surface-2/50 rounded-lg p-3">
                    <p className="text-xs text-muted uppercase tracking-wider mb-1">Why This Setup</p>
                    <p className="text-sm text-muted-light">{setup.rationale}</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-surface-2/30 rounded-lg p-3">
                      <p className="text-[10px] text-muted uppercase">Entry Zone</p>
                      <p className="text-sm font-mono font-semibold">{setup.entryZone.low} — {setup.entryZone.high}</p>
                    </div>
                    <div className="bg-red-500/5 rounded-lg p-3">
                      <p className="text-[10px] text-red-400 uppercase">Stop Loss</p>
                      <p className="text-sm font-mono font-semibold text-red-400">{setup.stopLoss}</p>
                    </div>
                    <div className="bg-emerald-500/5 rounded-lg p-3">
                      <p className="text-[10px] text-emerald-400 uppercase">TP 1</p>
                      <p className="text-sm font-mono font-semibold text-emerald-400">{setup.targets[0]}</p>
                    </div>
                    <div className="bg-emerald-500/5 rounded-lg p-3">
                      <p className="text-[10px] text-emerald-400 uppercase">TP 2 / TP 3</p>
                      <p className="text-sm font-mono font-semibold text-emerald-300">{setup.targets[1]} / {setup.targets[2]}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted uppercase tracking-wider mb-2">Scoring Reasons</p>
                    <div className="flex flex-wrap gap-2">
                      {setup.reasons.map((r, idx) => (
                        <div key={idx} className={`px-3 py-1.5 rounded-lg text-xs ${r.positive ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
                          {r.positive ? "+" : ""}{r.weight} · {r.text}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                    <p className="text-xs text-yellow-400">{setup.invalidation}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ═══ DETAIL TAB ═══════════════════════════════════════════════ */}
      {!loading && tab === "detail" && (
        <div className="space-y-4">
          {/* Per-instrument direction detail */}
          <div className="bg-surface rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {filteredInstruments.map(inst => (
                <button key={inst.symbol} onClick={() => setSelectedInstrument(inst.symbol)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedInstrument === inst.symbol ? "bg-accent/20 text-accent-light border border-accent/40" : "bg-surface-2 text-muted hover:text-foreground"}`}>
                  {inst.displayName}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const row = rows.find(r => r.symbol === selectedInstrument);
            if (!row) return <div className="bg-surface rounded-xl border border-border/50 p-12 text-center text-muted text-sm">Select an instrument to see direction detail.</div>;

            return (
              <>
                <div className={`rounded-xl border p-6 ${dirBg(row.overallDirection)}`}>
                  <p className="text-xs text-muted uppercase tracking-wider mb-2">Directional Bias — {row.displayName}</p>
                  <h2 className={`text-3xl font-bold ${dirColor(row.overallDirection)}`}>{row.overallDirection.charAt(0).toUpperCase() + row.overallDirection.slice(1)}</h2>
                  <div className="mt-4 flex items-center gap-6">
                    <div><p className="text-xs text-muted">Confidence</p><p className={`text-2xl font-bold ${dirColor(row.overallDirection)}`}>{row.confidence}%</p></div>
                    <div><p className="text-xs text-muted">Aligned</p><p className={`text-lg font-semibold ${row.aligned ? "text-emerald-400" : "text-yellow-400"}`}>{row.aligned ? "All Timeframes" : "Mixed"}</p></div>
                    <div><p className="text-xs text-muted">Price</p><p className="text-lg font-semibold">{row.price}</p></div>
                    <div><p className="text-xs text-muted">Change</p><p className={`text-lg font-semibold ${row.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>{row.changePercent >= 0 ? "+" : ""}{row.changePercent.toFixed(2)}%</p></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(row.tfDirections).map(([tf, d]) => (
                    <div key={tf} className={`rounded-xl border p-4 ${dirBg(d)}`}>
                      <p className="text-xs text-muted uppercase mb-1">{tf.toUpperCase()}</p>
                      <p className={`text-lg font-bold ${dirColor(d)}`}>{d.charAt(0).toUpperCase() + d.slice(1)}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-surface rounded-xl border border-border/50 p-4">
                  <h3 className="text-sm font-semibold mb-2">How Direction Maps to Setups</h3>
                  <div className="space-y-2 text-xs text-muted-light">
                    <p><span className="text-emerald-400 font-semibold">Bullish</span> — pullback, continuation, and breakout long setups</p>
                    <p><span className="text-red-400 font-semibold">Bearish</span> — pullback, continuation, and breakout short setups</p>
                    <p><span className="text-purple-400 font-semibold">Transitioning</span> — reversal and range break setups only (aggressive)</p>
                    <p><span className="text-yellow-400 font-semibold">Neutral</span> — no setups generated until clearer signal forms</p>
                    <p>Multi-timeframe alignment adds +15 to quality score</p>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ═══ HISTORY TAB ═════════════════════════════════════════════ */}
      {!loading && tab === "history" && (
        <div className="bg-surface rounded-xl border border-border/50">
          <div className="p-4 border-b border-border/50 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Setup History</h3>
            <span className="text-xs text-muted">{setupHistory.length} setups recorded</span>
          </div>
          {setupHistory.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted">No history. Go to Trade Setups tab and scan an instrument.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted border-b border-border/30">
                    <th className="text-left p-3">Instrument</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Dir</th>
                    <th className="text-left p-3">Grade</th>
                    <th className="text-left p-3">R:R</th>
                    <th className="text-left p-3">Entry Zone</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {setupHistory.map((s, idx) => (
                    <tr key={idx} className="border-b border-border/10 hover:bg-surface-2/30">
                      <td className="p-3 font-medium">{s.displayName}</td>
                      <td className="p-3 text-muted">{s.setupType}</td>
                      <td className="p-3"><span className={s.direction === "buy" ? "text-emerald-400" : "text-red-400"}>{s.direction === "buy" ? "▲" : "▼"}</span></td>
                      <td className="p-3"><span className={`font-bold ${gradeColor(s.qualityGrade)}`}>{s.qualityGrade}</span></td>
                      <td className="p-3 font-mono">{s.riskReward}:1</td>
                      <td className="p-3 font-mono text-xs">{s.entryZone.low} — {s.entryZone.high}</td>
                      <td className="p-3">{statusBadge(s.status)}</td>
                      <td className="p-3 text-xs text-muted">{new Date(s.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ PREFERENCES TAB ═════════════════════════════════════════ */}
      {!loading && tab === "preferences" && (
        <div className="bg-surface rounded-xl border border-border/50 p-6 space-y-6 max-w-xl">
          <h3 className="text-sm font-semibold">Setup Preferences</h3>
          <div>
            <label className="text-sm text-muted-light block mb-2">Minimum Quality Score: {minQuality}</label>
            <input type="range" min={30} max={90} value={minQuality} onChange={e => setMinQuality(Number(e.target.value))} className="w-full accent-accent" />
            <div className="flex justify-between text-xs text-muted mt-1"><span>Show more (30)</span><span>Only best (90)</span></div>
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-sm">Auto Refresh</p><p className="text-xs text-muted">Re-scan every 2 minutes</p></div>
            <button onClick={() => setAutoRefresh(!autoRefresh)} className={`w-10 h-5 rounded-full transition-colors ${autoRefresh ? "bg-accent" : "bg-surface-2"}`}>
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${autoRefresh ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div className="bg-surface-2/50 rounded-lg p-3">
            <p className="text-xs text-muted">Preferences are session-based and take effect immediately.</p>
          </div>
        </div>
      )}
    </div>
  );
}
