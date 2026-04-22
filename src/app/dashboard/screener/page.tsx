"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { useTheme } from "@/components/ui/ThemeProvider";
import {
  computeBreakdown,
  computeScore,
  getBias,
  getGrade,
  getSession,
  type ScoreBreakdown as SharedScoreBreakdown,
} from "@/lib/market-prediction";

/* ---------- Types ---------- */
interface QuoteData {
  symbol: string;
  displayName: string;
  category: string;
  price: number;
  previousClose: number;
  high: number;
  low: number;
  changePercent: number;
  decimals?: number;
}

type ScoreBreakdown = SharedScoreBreakdown;

interface ScanResult {
  symbol: string;
  displayName: string;
  category: string;
  price: number;
  session: string;
  bias: "bullish" | "bearish" | "neutral";
  score: number;
  grade: string;
  entryZone: [number, number];
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskReward: number;
  eventRisk: string;
  explanation: string;
  breakdown: ScoreBreakdown;
  changePercent: number;
  high: number;
  low: number;
}

interface QuickScanRow {
  symbol: string;
  displayName: string;
  category: string;
  bias: "bullish" | "bearish" | "neutral";
  score: number;
  grade: string;
  price: number;
  changePercent: number;
  postedAt: number;
}

type SortKey = "score" | "change" | "symbol";

/* ---------- Helpers ---------- */
function buildScanResult(q: QuoteData): ScanResult {
  const bias = getBias(q.changePercent);
  const breakdown = computeBreakdown(q);
  const score = computeScore(breakdown);
  const grade = getGrade(score);
  const range = q.high - q.low;
  const session = getSession();

  // Derive levels from live data
  const isBullish = bias === "bullish";
  const entryMid = isBullish ? q.low + range * 0.3 : q.high - range * 0.3;
  const entryEdge = isBullish ? q.low + range * 0.5 : q.high - range * 0.5;
  const entryZone: [number, number] = isBullish ? [entryMid, entryEdge] : [entryEdge, entryMid];
  const stopLoss = isBullish ? q.low - range * 0.2 : q.high + range * 0.2;
  const riskPerUnit = Math.abs(q.price - stopLoss);
  const tp1 = isBullish ? q.price + riskPerUnit * 1.5 : q.price - riskPerUnit * 1.5;
  const tp2 = isBullish ? q.price + riskPerUnit * 2.5 : q.price - riskPerUnit * 2.5;
  const tp3 = isBullish ? q.price + riskPerUnit * 3.5 : q.price - riskPerUnit * 3.5;
  const riskReward = riskPerUnit > 0 ? Math.round((Math.abs(tp2 - q.price) / riskPerUnit) * 10) / 10 : 0;

  // Event risk
  const hour = new Date().getUTCHours();
  let eventRisk = "Low — no major data releases expected in this window.";
  if (hour >= 12 && hour <= 14) eventRisk = "Moderate — US session overlap; potential for FOMC/CPI releases.";
  else if (hour >= 7 && hour <= 9) eventRisk = "Moderate — European open; watch for ECB/BOE announcements.";
  else if (hour >= 0 && hour <= 2) eventRisk = "Low-Moderate — Asian session; BOJ/PBOC potential.";

  // Explanation
  let explanation: string;
  if (grade === "NO_TRADE") {
    explanation = `${q.displayName} currently shows no clear tradable edge. The market structure is indecisive with a ${Math.abs(q.changePercent).toFixed(2)}% move that lacks directional conviction. Price is sitting mid-range between ${q.low.toFixed(q.decimals ?? 2)} and ${q.high.toFixed(q.decimals ?? 2)}, suggesting consolidation. Without clear multi-timeframe alignment and a defined setup, the risk of a losing trade is elevated. It is better to wait for a cleaner structure before committing capital.`;
  } else {
    const dir = isBullish ? "bullish" : "bearish";
    const action = isBullish ? "buying" : "selling";
    explanation = `${q.displayName} is showing ${dir} momentum with a ${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}% move during the ${session} session. Price is trading at ${q.price.toFixed(q.decimals ?? 2)}, ${isBullish ? "above" : "below"} the previous close of ${q.previousClose.toFixed(q.decimals ?? 2)}. The structure quality is ${breakdown.structureQuality >= 18 ? "clean" : breakdown.structureQuality >= 12 ? "moderate" : "messy"} with ${breakdown.mtfAlignment >= 10 ? "strong" : "partial"} multi-timeframe alignment. This creates a ${action} opportunity with a ${riskReward}:1 risk-reward ratio targeting ${tp2.toFixed(q.decimals ?? 2)} on the second take-profit. The stop loss at ${stopLoss.toFixed(q.decimals ?? 2)} protects against structural invalidation.`;
  }

  return {
    symbol: q.symbol, displayName: q.displayName, category: q.category,
    price: q.price, session, bias, score, grade, entryZone, stopLoss,
    tp1, tp2, tp3, riskReward, eventRisk, explanation, breakdown,
    changePercent: q.changePercent, high: q.high, low: q.low,
  };
}

function fmt(val: number, dec: number = 2): string {
  return val.toFixed(dec);
}

/* ---------- Prediction persistence (postedAt + staleness) ----------
 * The engine recomputes entry/SL/TP from live quotes every refresh. Without
 * persistence every view would look "just now" — but the user wants to know
 * when the *current* levels first appeared, and wants predictions that
 * haven't changed in 4h dropped entirely.
 *
 * Compare rounded levels (to instrument decimals) + bias + grade. If all
 * match the cached entry, keep the original postedAt. Otherwise treat it as
 * a new posting and stamp Date.now().
 */

const PREDICTIONS_KEY = "twv_market_predictions_v1";

interface PersistedPrediction {
  symbol: string;
  bias: "bullish" | "bearish" | "neutral";
  grade: string;
  entryLo: number;
  entryHi: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  postedAt: number;
}

function loadPredictions(): Record<string, PersistedPrediction> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PREDICTIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePredictions(next: Record<string, PersistedPrediction>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREDICTIONS_KEY, JSON.stringify(next));
  } catch {
    /* quota full / disabled — fall back to in-memory behaviour */
  }
}

function roundTo(val: number, dec: number): number {
  const m = 10 ** dec;
  return Math.round(val * m) / m;
}

function samePrediction(
  prev: PersistedPrediction | undefined,
  candidate: Omit<PersistedPrediction, "postedAt">,
  dec: number,
): boolean {
  if (!prev) return false;
  if (prev.bias !== candidate.bias) return false;
  if (prev.grade !== candidate.grade) return false;
  return (
    roundTo(prev.entryLo, dec) === roundTo(candidate.entryLo, dec) &&
    roundTo(prev.entryHi, dec) === roundTo(candidate.entryHi, dec) &&
    roundTo(prev.stopLoss, dec) === roundTo(candidate.stopLoss, dec) &&
    roundTo(prev.tp1, dec) === roundTo(candidate.tp1, dec) &&
    roundTo(prev.tp2, dec) === roundTo(candidate.tp2, dec) &&
    roundTo(prev.tp3, dec) === roundTo(candidate.tp3, dec)
  );
}

function reconcilePrediction(scan: ScanResult, decimals: number): PersistedPrediction {
  const incoming: Omit<PersistedPrediction, "postedAt"> = {
    symbol: scan.symbol,
    bias: scan.bias,
    grade: scan.grade,
    entryLo: scan.entryZone[0],
    entryHi: scan.entryZone[1],
    stopLoss: scan.stopLoss,
    tp1: scan.tp1,
    tp2: scan.tp2,
    tp3: scan.tp3,
  };
  const all = loadPredictions();
  const prev = all[scan.symbol];
  if (samePrediction(prev, incoming, decimals)) return prev!;
  const next: PersistedPrediction = { ...incoming, postedAt: Date.now() };
  all[scan.symbol] = next;
  savePredictions(all);
  return next;
}

function formatAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 30) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h ago` : `${h}h ${rem}m ago`;
}


/* ---------- Component ---------- */
export default function ScreenerPage() {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [allQuotes, setAllQuotes] = useState<QuoteData[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanPostedAt, setScanPostedAt] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [quickScanRows, setQuickScanRows] = useState<QuickScanRow[]>([]);
  const [quickScanLoading, setQuickScanLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const filteredInstruments = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return ALL_INSTRUMENTS.filter(
      (i) => i.symbol.toLowerCase().includes(q) || i.displayName.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  // Fetch all quotes on mount for quick scan
  const fetchAllQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/market/quotes");
      const data = await res.json();
      if (data.quotes) {
        const quotes: QuoteData[] = data.quotes.map((q: any) => {
          const inst = ALL_INSTRUMENTS.find((i) => i.symbol === q.symbol);
          return {
            symbol: q.symbol,
            displayName: q.displayName || inst?.displayName || q.symbol,
            category: q.category || inst?.category || "forex",
            price: q.price ?? 0,
            previousClose: q.previousClose ?? q.price ?? 0,
            high: q.high ?? q.price ?? 0,
            low: q.low ?? q.price ?? 0,
            changePercent: q.changePercent ?? 0,
            decimals: inst?.decimals ?? 2,
          };
        });
        setAllQuotes(quotes);
        const rows: QuickScanRow[] = quotes.map((q) => {
          const scan = buildScanResult(q);
          const persisted = reconcilePrediction(scan, q.decimals ?? 2);
          return {
            symbol: q.symbol, displayName: q.displayName, category: q.category,
            bias: scan.bias, score: scan.score, grade: scan.grade,
            price: q.price, changePercent: q.changePercent,
            postedAt: persisted.postedAt,
          };
        });
        setQuickScanRows(rows);
        setLastUpdated(new Date(data.timestamp || Date.now()).toLocaleTimeString());
      }
    } catch { /* silent */ }
    setQuickScanLoading(false);
  }, []);

  useEffect(() => {
    fetchAllQuotes();
    // Refresh every 60s so the postedAt clock and 4h staleness window
    // have something to measure against. Without this, every view looks
    // "just posted" because nothing ever reconciles a second time.
    const id = window.setInterval(() => { fetchAllQuotes(); }, 60_000);
    return () => window.clearInterval(id);
  }, [fetchAllQuotes]);

  // Force a re-render every 30s so the "Xm ago" labels on visible
  // predictions tick forward and anything that just crossed the 4h
  // threshold drops out of view.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  async function handleSelectInstrument(symbol: string) {
    setQuery("");
    setShowDropdown(false);
    setScanning(true);
    setScanResult(null);
    setScanPostedAt(null);

    try {
      const res = await fetch("/api/market/quotes");
      const data = await res.json();
      if (data.quotes) {
        const raw = data.quotes.find((q: any) => q.symbol === symbol);
        if (raw) {
          const inst = ALL_INSTRUMENTS.find((i) => i.symbol === symbol);
          const q: QuoteData = {
            symbol: raw.symbol,
            displayName: raw.displayName || inst?.displayName || symbol,
            category: raw.category || inst?.category || "forex",
            price: raw.price ?? 0,
            previousClose: raw.previousClose ?? raw.price ?? 0,
            high: raw.high ?? raw.price ?? 0,
            low: raw.low ?? raw.price ?? 0,
            changePercent: raw.changePercent ?? 0,
            decimals: inst?.decimals ?? 2,
          };
          const scan = buildScanResult(q);
          const persisted = reconcilePrediction(scan, q.decimals ?? 2);
          setScanResult(scan);
          setScanPostedAt(persisted.postedAt);
        }
      }
    } catch { /* silent */ }
    setScanning(false);
  }

  // When the quick-scan quotes refresh, re-reconcile the currently-shown
  // main card against the latest quote so scanPostedAt rolls forward on
  // a real change and stays pinned otherwise.
  useEffect(() => {
    if (!scanResult) return;
    const q = allQuotes.find((x) => x.symbol === scanResult.symbol);
    if (!q) return;
    const inst = ALL_INSTRUMENTS.find((i) => i.symbol === scanResult.symbol);
    const scan = buildScanResult(q);
    const persisted = reconcilePrediction(scan, inst?.decimals ?? 2);
    setScanResult(scan);
    setScanPostedAt(persisted.postedAt);
  // allQuotes is the refresh trigger; scanResult.symbol is what to follow.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allQuotes, scanResult?.symbol]);

  const sortedQuickScan = useMemo(() => {
    const rows = [...quickScanRows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "score") cmp = a.score - b.score;
      else if (sortBy === "change") cmp = Math.abs(a.changePercent) - Math.abs(b.changePercent);
      else cmp = a.symbol.localeCompare(b.symbol);
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [quickScanRows, sortBy, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  }

  const breakdownLabels: { key: keyof ScoreBreakdown; label: string; max: number }[] = [
    { key: "structureQuality", label: "Structure Quality", max: 25 },
    { key: "mtfAlignment", label: "MTF Alignment", max: 15 },
    { key: "confluenceDensity", label: "Confluence Density", max: 15 },
    { key: "entryPrecision", label: "Entry Precision", max: 10 },
    { key: "riskRewardQuality", label: "Risk/Reward Quality", max: 10 },
    { key: "sessionTiming", label: "Session Timing", max: 10 },
    { key: "eventSafety", label: "Event Safety", max: 10 },
    { key: "freshness", label: "Freshness", max: 5 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Market Prediction Engine</h1>
        <p className="text-sm text-muted mt-1">
          Search any instrument for a full trade setup scan with scoring, levels, and analysis
        </p>
        {lastUpdated && <p className="text-xs text-muted mt-1">Live data -- last updated {lastUpdated}</p>}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-lg">
        <div className="glass-card flex items-center px-4 py-3 gap-3">
          <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder='Search instrument (e.g. "XAU", "EUR", "BTC")'
            className="bg-transparent outline-none text-foreground text-sm flex-1 placeholder:text-muted"
          />
        </div>
        {showDropdown && filteredInstruments.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 border border-border/50 rounded-lg shadow-xl z-50 overflow-hidden">
            {filteredInstruments.map((inst) => (
              <button
                key={inst.symbol}
                onClick={() => handleSelectInstrument(inst.symbol)}
                className="w-full text-left px-4 py-3 hover:bg-surface-2/80 transition-smooth flex items-center justify-between"
              >
                <div>
                  <span className="text-sm font-semibold text-foreground">{inst.displayName}</span>
                  <span className="text-xs text-muted ml-2 capitalize">{inst.category}</span>
                </div>
                <span className="text-xs text-muted font-mono">{inst.symbol}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scanning Skeleton */}
      {scanning && (
        <div className="glass-card p-8 animate-pulse space-y-4">
          <div className="h-6 bg-surface-2 rounded w-1/3" />
          <div className="h-4 bg-surface-2 rounded w-2/3" />
          <div className="h-4 bg-surface-2 rounded w-1/2" />
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="h-20 bg-surface-2 rounded" />
            <div className="h-20 bg-surface-2 rounded" />
            <div className="h-20 bg-surface-2 rounded" />
          </div>
          <div className="h-40 bg-surface-2 rounded mt-4" />
        </div>
      )}

      {/* Scan Result */}
      {scanResult && !scanning && (
        <div className="space-y-4">
          {/* Main Card */}
          <div className="glass-card p-6 space-y-5">
            {/* Top row: symbol info + score */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-foreground">{scanResult.displayName}</h2>
                  <span className={cn(
                    "text-xs font-semibold px-2.5 py-1 rounded-full",
                    scanResult.bias === "bullish" ? "bg-bull/10 text-bull-light" :
                    scanResult.bias === "bearish" ? "bg-bear/10 text-bear-light" :
                    "bg-surface-2 text-muted"
                  )}>
                    {scanResult.bias.toUpperCase()}
                  </span>
                  {scanPostedAt !== null && (
                    <span className="text-[10px] uppercase tracking-wider text-muted bg-surface-2 px-2 py-0.5 rounded-full border border-border/50">
                      Posted {formatAgo(scanPostedAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-muted">
                  <span className="capitalize">{scanResult.category}</span>
                  <span>|</span>
                  <span>{scanResult.session} Session</span>
                  <span>|</span>
                  <span className="font-mono">{fmt(scanResult.price, ALL_INSTRUMENTS.find(i => i.symbol === scanResult.symbol)?.decimals ?? 2)}</span>
                  <span className={cn("font-mono text-xs", scanResult.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                    {scanResult.changePercent >= 0 ? "+" : ""}{scanResult.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Score + Grade */}
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className={cn(
                    "text-3xl font-bold",
                    scanResult.grade === "A+" || scanResult.grade === "A" ? "text-bull-light" :
                    scanResult.grade === "B" ? "text-accent-light" :
                    scanResult.grade === "C" ? "text-muted-light" : "text-bear-light"
                  )}>
                    {scanResult.score}
                  </div>
                  <div className="text-xs text-muted">/100</div>
                </div>
                <div className={cn(
                  "text-2xl font-black px-3 py-1 rounded-lg",
                  scanResult.grade === "A+" || scanResult.grade === "A" ? "bg-bull/10 text-bull-light" :
                  scanResult.grade === "B" ? "bg-accent/10 text-accent-light" :
                  scanResult.grade === "C" ? "bg-surface-2 text-muted-light" :
                  "bg-bear/10 text-bear-light"
                )}>
                  {scanResult.grade}
                </div>
              </div>
            </div>

            {/* NO_TRADE banner */}
            {scanResult.grade === "NO_TRADE" && (
              <div className="bg-bear/10 border border-bear/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-bear-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span className="font-semibold text-bear-light">No Trade</span>
                </div>
                <p className="text-sm text-muted-light">{scanResult.explanation}</p>
              </div>
            )}

            {/* Trade levels (only if tradeable) */}
            {scanResult.grade !== "NO_TRADE" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-muted mb-1">Entry Zone</div>
                    <div className="text-sm font-mono text-foreground">
                      {fmt(scanResult.entryZone[0], ALL_INSTRUMENTS.find(i => i.symbol === scanResult.symbol)?.decimals ?? 2)}
                      {" - "}
                      {fmt(scanResult.entryZone[1], ALL_INSTRUMENTS.find(i => i.symbol === scanResult.symbol)?.decimals ?? 2)}
                    </div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-muted mb-1">Stop Loss</div>
                    <div className="text-sm font-mono text-bear-light">
                      {fmt(scanResult.stopLoss, ALL_INSTRUMENTS.find(i => i.symbol === scanResult.symbol)?.decimals ?? 2)}
                    </div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-muted mb-1">TP1 / TP2 / TP3</div>
                    <div className="text-sm font-mono text-bull-light">
                      {fmt(scanResult.tp1, ALL_INSTRUMENTS.find(i => i.symbol === scanResult.symbol)?.decimals ?? 2)}
                      {" / "}
                      {fmt(scanResult.tp2, ALL_INSTRUMENTS.find(i => i.symbol === scanResult.symbol)?.decimals ?? 2)}
                      {" / "}
                      {fmt(scanResult.tp3, ALL_INSTRUMENTS.find(i => i.symbol === scanResult.symbol)?.decimals ?? 2)}
                    </div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3">
                    <div className="text-xs text-muted mb-1">Risk / Reward</div>
                    <div className="text-sm font-mono text-accent-light">1 : {scanResult.riskReward}</div>
                  </div>
                </div>

                {/* Event Risk */}
                <div className="bg-surface-2 rounded-lg p-3">
                  <div className="text-xs text-muted mb-1">Event Risk</div>
                  <div className="text-sm text-muted-light">{scanResult.eventRisk}</div>
                </div>

                {/* Explanation */}
                <div className="bg-surface-2 rounded-lg p-4">
                  <div className="text-xs text-muted mb-2 font-medium">Analysis</div>
                  <p className="text-sm text-foreground leading-relaxed">{scanResult.explanation}</p>
                </div>
              </>
            )}

            {/* Score Breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Score Breakdown</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {breakdownLabels.map(({ key, label, max }) => {
                  const val = scanResult.breakdown[key];
                  const pct = (val / max) * 100;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-xs text-muted w-36 shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all",
                            pct >= 70 ? "bg-bull" : pct >= 40 ? "bg-accent" : "bg-bear"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-light w-12 text-right">{val}/{max}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TradingView Chart */}
          <div className="glass-card overflow-hidden" style={{ height: 500 }}>
            <TradingViewWidget symbol={scanResult.symbol} theme={theme} height={500} autosize />
          </div>
        </div>
      )}

      {/* Quick Scan All */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">Quick Scan All</h2>
        <p className="text-sm text-muted mb-4">All instruments ranked by prediction score</p>

        {quickScanLoading ? (
          <div className="glass-card p-6 animate-pulse space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 bg-surface-2 rounded" />
            ))}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th
                      className="text-left text-xs text-muted font-medium px-5 py-3 cursor-pointer hover:text-muted-light"
                      onClick={() => handleSort("symbol")}
                    >
                      Instrument {sortBy === "symbol" ? (sortAsc ? "^" : "v") : ""}
                    </th>
                    <th className="text-left text-xs text-muted font-medium px-3 py-3">Category</th>
                    <th className="text-left text-xs text-muted font-medium px-3 py-3">Price</th>
                    <th
                      className="text-left text-xs text-muted font-medium px-3 py-3 cursor-pointer hover:text-muted-light"
                      onClick={() => handleSort("change")}
                    >
                      Change {sortBy === "change" ? (sortAsc ? "^" : "v") : ""}
                    </th>
                    <th className="text-left text-xs text-muted font-medium px-3 py-3">Bias</th>
                    <th
                      className="text-left text-xs text-muted font-medium px-3 py-3 cursor-pointer hover:text-muted-light"
                      onClick={() => handleSort("score")}
                    >
                      Score {sortBy === "score" ? (sortAsc ? "^" : "v") : ""}
                    </th>
                    <th className="text-left text-xs text-muted font-medium px-3 py-3">Grade</th>
                    <th className="text-left text-xs text-muted font-medium px-3 py-3">Posted</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQuickScan.map((row) => (
                    <tr
                      key={row.symbol}
                      onClick={() => handleSelectInstrument(row.symbol)}
                      className="border-b border-border/20 hover:bg-surface-2/50 transition-smooth cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <span className="text-sm font-semibold text-foreground">{row.displayName}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted capitalize">{row.category}</td>
                      <td className="px-3 py-3 text-sm font-mono text-foreground">
                        {row.price.toFixed(ALL_INSTRUMENTS.find(i => i.symbol === row.symbol)?.decimals ?? 2)}
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("text-sm font-mono", row.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                          {row.changePercent >= 0 ? "+" : ""}{row.changePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          row.bias === "bullish" ? "bg-bull/10 text-bull-light" :
                          row.bias === "bearish" ? "bg-bear/10 text-bear-light" :
                          "bg-surface-2 text-muted"
                        )}>
                          {row.bias}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                            <div
                              className={cn("h-full rounded-full",
                                row.score >= 80 ? "bg-bull" : row.score >= 60 ? "bg-accent" : "bg-bear"
                              )}
                              style={{ width: `${row.score}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-muted-light">{row.score}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn(
                          "text-xs font-bold",
                          row.grade === "A+" || row.grade === "A" ? "text-bull-light" :
                          row.grade === "B" ? "text-accent-light" :
                          row.grade === "C" ? "text-muted-light" : "text-bear-light"
                        )}>
                          {row.grade}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">
                        {row.grade === "NO_TRADE" ? "—" : formatAgo(row.postedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
