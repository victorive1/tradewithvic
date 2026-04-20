"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { AlgoConfigPanel, useAlgoConfig, AlgoRoutingBadge, AlgoAccountsCard } from "@/components/algo/AlgoConfig";

/* ───────── types ───────── */
const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "XAGUSD", "US30", "USOIL", "NAS100", "USDCHF", "GBPJPY"];

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

interface TrendInfo {
  dir: "bullish" | "bearish" | "neutral";
  score: number;
}

interface SymbolState {
  symbol: string;
  price: number;
  changePercent: number;
  mode: "BUY_ONLY" | "SELL_ONLY" | "NO_TRADE";
  trend5m: TrendInfo;
  trend15m: TrendInfo;
  trend1h: TrendInfo;
  candleColor: "GREEN" | "RED" | "NEUTRAL";
  status: "ENTRY READY" | "WAITING PULLBACK" | "WAITING ALIGNMENT" | "NO DATA";
  score: number;
  tradeOpen: boolean;
}

/* ───────── derive trends from changePercent ───────── */
// Simulate multi-timeframe by using different thresholds on the same changePercent value.
// 5m: tight threshold (small move = trend), 15m: medium, 1h: wide.
function deriveTrend(changePercent: number, threshold: number): TrendInfo {
  if (changePercent > threshold) {
    const score = Math.min(95, 55 + Math.round(Math.abs(changePercent) * 20));
    return { dir: "bullish", score };
  }
  if (changePercent < -threshold) {
    const score = Math.min(95, 55 + Math.round(Math.abs(changePercent) * 20));
    return { dir: "bearish", score };
  }
  return { dir: "neutral", score: 30 + Math.round(Math.abs(changePercent) * 10) };
}

function buildSymbolState(quote: MarketQuote): SymbolState {
  const cp = quote.changePercent;

  // 5m: threshold 0.02%, 15m: 0.08%, 1h: 0.20%
  const t5 = deriveTrend(cp, 0.02);
  const t15 = deriveTrend(cp, 0.08);
  const t1h = deriveTrend(cp, 0.20);

  const allBull = t5.dir === "bullish" && t15.dir === "bullish" && t1h.dir === "bullish";
  const allBear = t5.dir === "bearish" && t15.dir === "bearish" && t1h.dir === "bearish";
  const mode = allBull ? "BUY_ONLY" : allBear ? "SELL_ONLY" : "NO_TRADE";

  // Candle color: if current price > open-ish (use previousClose as proxy for candle open)
  const candleColor: "GREEN" | "RED" | "NEUTRAL" =
    quote.price > quote.previousClose ? "GREEN" :
    quote.price < quote.previousClose ? "RED" : "NEUTRAL";

  // Status logic
  const pullbackReady = (mode === "BUY_ONLY" && candleColor === "RED") || (mode === "SELL_ONLY" && candleColor === "GREEN");
  const waitingPullback = mode !== "NO_TRADE" && !pullbackReady;
  const status: SymbolState["status"] = pullbackReady
    ? "ENTRY READY"
    : waitingPullback
    ? "WAITING PULLBACK"
    : "WAITING ALIGNMENT";

  // Score: higher if all aligned, bonus for pullback
  let score = 40;
  if (t5.dir !== "neutral") score += 10;
  if (t15.dir !== "neutral") score += 10;
  if (t1h.dir !== "neutral") score += 10;
  if (mode !== "NO_TRADE") score += 15;
  if (pullbackReady) score += 10;
  score = Math.min(99, score + Math.round(Math.abs(cp) * 3));

  return {
    symbol: quote.symbol,
    price: quote.price,
    changePercent: cp,
    mode,
    trend5m: t5,
    trend15m: t15,
    trend1h: t1h,
    candleColor,
    status,
    score,
    tradeOpen: false,
  };
}

/* ───────── components ───────── */
function TrendBadge({ dir, score }: TrendInfo) {
  return (
    <div className={cn(
      "text-center px-2 py-1 rounded-lg text-[10px] font-medium",
      dir === "bullish" ? "bg-bull/10 text-bull-light" :
      dir === "bearish" ? "bg-bear/10 text-bear-light" :
      "bg-surface-3 text-muted"
    )}>
      {dir.charAt(0).toUpperCase()}{dir.slice(1)} <span className="opacity-70">{score}</span>
    </div>
  );
}

function formatCountdown(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass-card p-3 h-16 bg-surface-2 rounded-xl" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass-card p-4 h-20 bg-surface-2 rounded-xl" />
      ))}
    </div>
  );
}

/* ───────── main page ───────── */
export default function AlgoVicPage() {
  const { settings: algoSettings, updateSettings: updateAlgoSettings } = useAlgoConfig("algo_vic");
  const [showConfig, setShowConfig] = useState(true);
  const [symbolStates, setSymbolStates] = useState<SymbolState[]>([]);
  const [botMode, setBotMode] = useState<"signal" | "live">("signal");
  const [scanning, setScanning] = useState(false);
  const [countdown, setCountdown] = useState(300);
  const [loading, setLoading] = useState(true);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── fetch quotes ── */
  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/market/quotes");
      const data = await res.json();
      if (data.quotes && data.quotes.length > 0) {
        const filteredSymbols = algoSettings.selectedPairs.length > 0
          ? SYMBOLS.filter((sym) => algoSettings.selectedPairs.includes(sym))
          : SYMBOLS;
        const mapped = filteredSymbols.map((sym) => {
          const q = data.quotes.find((quote: MarketQuote) => quote.symbol === sym);
          if (!q) return null;
          return buildSymbolState(q);
        }).filter(Boolean) as SymbolState[];

        // For symbols without live data, create placeholder
        const liveSyms = new Set(mapped.map((m) => m.symbol));
        const fallbacks = filteredSymbols.filter((s) => !liveSyms.has(s)).map((sym): SymbolState => ({
          symbol: sym,
          price: 0,
          changePercent: 0,
          mode: "NO_TRADE",
          trend5m: { dir: "neutral", score: 30 },
          trend15m: { dir: "neutral", score: 30 },
          trend1h: { dir: "neutral", score: 30 },
          candleColor: "NEUTRAL",
          status: "NO DATA",
          score: 0,
          tradeOpen: false,
        }));

        setSymbolStates([...mapped, ...fallbacks]);
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

  /* ── countdown timer ── */
  useEffect(() => {
    if (scanning) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => (prev <= 0 ? 300 : prev - 1));
      }, 1000);
    } else {
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [scanning]);

  function toggleScanning() {
    if (!scanning) {
      setCountdown(300);
    }
    setScanning((prev) => !prev);
  }

  /* ── ranking: entry ready first, then by score ── */
  const scoredStates = symbolStates.filter((s) => s.score >= algoSettings.minScore || s.status === "NO DATA");
  const ranked = [...scoredStates].sort((a, b) => {
    const statusPriority = (s: string) =>
      s === "ENTRY READY" ? 0 : s === "WAITING PULLBACK" ? 1 : s === "WAITING ALIGNMENT" ? 2 : 3;
    const diff = statusPriority(a.status) - statusPriority(b.status);
    if (diff !== 0) return diff;
    return b.score - a.score;
  });

  const readyCount = symbolStates.filter((s) => s.status === "ENTRY READY").length;
  const alignedCount = symbolStates.filter((s) => s.mode !== "NO_TRADE").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Algo Trading Vic</h1>
            <span className="text-xs bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">Admin Only</span>
            <AlgoRoutingBadge selectedAccounts={algoSettings.selectedAccounts} />
            {scanning && (
              <span className="flex items-center gap-1.5 text-xs bg-bull/10 text-bull-light px-2.5 py-1 rounded-full border border-bull/20 font-medium">
                <span className="w-2 h-2 rounded-full bg-bull animate-pulse" />
                Scanning
              </span>
            )}
          </div>
          <p className="text-sm text-muted">Multi-timeframe time-based scalping bot -- 5m/15m/1h alignment with candle color confirmation</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleScanning}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-smooth",
              scanning
                ? "bg-bear text-white hover:bg-bear-light"
                : "bg-bull text-white hover:bg-bull-light"
            )}
          >
            {scanning ? "Stop Scanning" : "Start Scanning"}
          </button>
          <div className="flex gap-1">
            {(["signal", "live"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setBotMode(m)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-smooth",
                  botMode === m
                    ? (m === "live" ? "bg-bull text-white" : "bg-accent text-white")
                    : "bg-surface-2 text-muted-light border border-border/50"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trading Accounts — hoisted from config so it's always visible */}
      <AlgoAccountsCard settings={algoSettings} updateSettings={updateAlgoSettings} />

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
        <AlgoConfigPanel settings={algoSettings} updateSettings={updateAlgoSettings} botName="Algo Trading Vic" />
      )}

      {loading ? <Skeleton /> : (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div className="glass-card p-3 text-center">
              <div className="text-[10px] text-muted mb-1">Mode</div>
              <div className="text-sm font-bold capitalize text-accent-light">{botMode}</div>
            </div>
            <div className="glass-card p-3 text-center">
              <div className="text-[10px] text-muted mb-1">Scanning</div>
              <div className="text-sm font-bold">{symbolStates.length} pairs</div>
            </div>
            <div className="glass-card p-3 text-center">
              <div className="text-[10px] text-muted mb-1">Ready</div>
              <div className={cn("text-sm font-bold", readyCount > 0 ? "text-bull-light" : "text-muted")}>{readyCount}</div>
            </div>
            <div className="glass-card p-3 text-center">
              <div className="text-[10px] text-muted mb-1">Aligned</div>
              <div className="text-sm font-bold">{alignedCount}</div>
            </div>
            <div className="glass-card p-3 text-center">
              <div className="text-[10px] text-muted mb-1">Countdown</div>
              <div className={cn(
                "text-sm font-mono font-bold",
                scanning ? (countdown <= 10 ? "text-warn animate-pulse" : "text-foreground") : "text-muted"
              )}>
                {scanning ? formatCountdown(countdown) : "--:--"}
              </div>
            </div>
            <div className="glass-card p-3 text-center">
              <div className="text-[10px] text-muted mb-1">Today P&L</div>
              <div className="text-sm font-bold text-muted">$0.00</div>
            </div>
          </div>

          {/* Symbol cards */}
          <div className="space-y-3">
            {ranked.map((s) => (
              <div
                key={s.symbol}
                className={cn(
                  "glass-card p-4 transition-all",
                  s.status === "ENTRY READY" ? "border-l-4 border-l-bull glow-bull" :
                  s.status === "WAITING PULLBACK" ? "border-l-4 border-l-warn" : ""
                )}
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="w-24">
                      <div className="text-sm font-bold">{s.symbol}</div>
                      <div className="text-[10px] text-muted font-mono">
                        {s.price > 0 ? s.price.toFixed(s.symbol.includes("JPY") ? 3 : s.price > 100 ? 2 : 5) : "---"}
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold",
                        s.mode === "BUY_ONLY" ? "text-bull-light" :
                        s.mode === "SELL_ONLY" ? "text-bear-light" : "text-muted"
                      )}>
                        {s.mode.replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <div>
                        <div className="text-[9px] text-muted mb-0.5">5m</div>
                        <TrendBadge {...s.trend5m} />
                      </div>
                      <div>
                        <div className="text-[9px] text-muted mb-0.5">15m</div>
                        <TrendBadge {...s.trend15m} />
                      </div>
                      <div>
                        <div className="text-[9px] text-muted mb-0.5">1h</div>
                        <TrendBadge {...s.trend1h} />
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-[9px] text-muted mb-0.5">5m Candle</div>
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded",
                        s.candleColor === "GREEN" ? "bg-bull/10 text-bull-light" :
                        s.candleColor === "RED" ? "bg-bear/10 text-bear-light" :
                        "bg-surface-3 text-muted"
                      )}>
                        {s.candleColor}
                      </span>
                    </div>

                    <div className="text-center">
                      <div className="text-[9px] text-muted mb-0.5">Countdown</div>
                      <span className={cn(
                        "text-sm font-mono font-bold",
                        scanning ? (countdown <= 10 ? "text-warn" : "text-muted-light") : "text-muted"
                      )}>
                        {scanning ? formatCountdown(countdown) : "--:--"}
                      </span>
                    </div>

                    <div className="text-center">
                      <div className="text-[9px] text-muted mb-0.5">Change</div>
                      <span className={cn(
                        "text-xs font-bold",
                        s.changePercent >= 0 ? "text-bull-light" : "text-bear-light"
                      )}>
                        {s.changePercent >= 0 ? "+" : ""}{s.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-[9px] text-muted mb-0.5">Score</div>
                      <span className="text-sm font-bold text-foreground">{s.score}</span>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap",
                      s.status === "ENTRY READY" ? "bg-bull/10 text-bull-light border border-bull/20" :
                      s.status === "WAITING PULLBACK" ? "bg-warn/10 text-warn border border-warn/20" :
                      s.status === "NO DATA" ? "bg-surface-3 text-muted border border-border/30" :
                      "bg-surface-3 text-muted border border-border/30"
                    )}>
                      {s.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Strategy rules */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Strategy Rules</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
              <div>
                <p className="text-foreground font-medium mb-1">Buy Setup</p>
                <p>5m + 15m + 1h all bullish. Wait for RED 5m candle. Enter at exactly 5 seconds before candle close. Exit at next candle close or extend one more candle if still red.</p>
              </div>
              <div>
                <p className="text-foreground font-medium mb-1">Sell Setup</p>
                <p>5m + 15m + 1h all bearish. Wait for GREEN 5m candle. Enter at exactly 5 seconds before candle close. Exit at next candle close or extend one more candle if still green.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
