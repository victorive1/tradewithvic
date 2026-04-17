"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const symbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "XAGUSD", "US30", "USOIL", "NAS100", "USDCHF", "GBPJPY"];

interface SymbolState {
  symbol: string;
  mode: "BUY_ONLY" | "SELL_ONLY" | "NO_TRADE";
  trend5m: { dir: string; score: number };
  trend15m: { dir: string; score: number };
  trend1h: { dir: string; score: number };
  candleColor: "GREEN" | "RED" | "NEUTRAL";
  countdown: number;
  status: string;
  score: number;
  tradeOpen: boolean;
}

function randomTrend(): { dir: string; score: number } {
  const r = Math.random();
  return r > 0.55 ? { dir: "bullish", score: 60 + Math.floor(Math.random() * 30) } : r > 0.2 ? { dir: "bearish", score: 60 + Math.floor(Math.random() * 30) } : { dir: "neutral", score: 30 + Math.floor(Math.random() * 20) };
}

function initSymbols(): SymbolState[] {
  return symbols.map((s) => {
    const t5 = randomTrend(), t15 = randomTrend(), t1h = randomTrend();
    const allBull = t5.dir === "bullish" && t15.dir === "bullish" && t1h.dir === "bullish";
    const allBear = t5.dir === "bearish" && t15.dir === "bearish" && t1h.dir === "bearish";
    const mode = allBull ? "BUY_ONLY" : allBear ? "SELL_ONLY" : "NO_TRADE";
    const color = Math.random() > 0.5 ? "GREEN" : "RED";
    const ready = (mode === "BUY_ONLY" && color === "RED") || (mode === "SELL_ONLY" && color === "GREEN");
    return {
      symbol: s, mode, trend5m: t5, trend15m: t15, trend1h: t1h, candleColor: color as any,
      countdown: Math.floor(Math.random() * 300),
      status: ready ? "ENTRY READY" : mode === "NO_TRADE" ? "WAITING ALIGNMENT" : "WAITING PULLBACK",
      score: Math.floor(40 + Math.random() * 55),
      tradeOpen: s === "XAUUSD",
    };
  });
}

function TrendBadge({ dir, score }: { dir: string; score: number }) {
  return (
    <div className={cn("text-center px-2 py-1 rounded-lg text-[10px] font-medium",
      dir === "bullish" ? "bg-bull/10 text-bull-light" : dir === "bearish" ? "bg-bear/10 text-bear-light" : "bg-surface-3 text-muted")}>
      {dir.charAt(0).toUpperCase()}{dir.slice(1)} <span className="opacity-70">{score}</span>
    </div>
  );
}

function formatCountdown(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function AlgoVicPage() {
  const [symbolStates, setSymbolStates] = useState(initSymbols);
  const [botMode, setBotMode] = useState<"signal" | "paper" | "live">("paper");

  // Simulate countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setSymbolStates((prev) => prev.map((s) => ({
        ...s,
        countdown: s.countdown <= 0 ? 300 : s.countdown - 1,
      })));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const ranked = [...symbolStates].sort((a, b) => {
    if (a.status === "ENTRY READY" && b.status !== "ENTRY READY") return -1;
    if (b.status === "ENTRY READY" && a.status !== "ENTRY READY") return 1;
    return b.score - a.score;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Algo Trading Vic</h1>
            <span className="text-xs bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">Admin Only</span>
          </div>
          <p className="text-sm text-muted">Multi-timeframe time-based scalping bot \u2014 5m/15m/1h alignment with candle color confirmation</p>
        </div>
        <div className="flex gap-2">
          {(["signal", "paper", "live"] as const).map((m) => (
            <button key={m} onClick={() => setBotMode(m)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-smooth",
                botMode === m ? (m === "live" ? "bg-bull text-white" : "bg-accent text-white") : "bg-surface-2 text-muted-light border border-border/50")}>{m}</button>
          ))}
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="glass-card p-3 text-center"><div className="text-[10px] text-muted mb-1">Mode</div><div className="text-sm font-bold capitalize text-accent-light">{botMode}</div></div>
        <div className="glass-card p-3 text-center"><div className="text-[10px] text-muted mb-1">Scanning</div><div className="text-sm font-bold">{symbols.length} pairs</div></div>
        <div className="glass-card p-3 text-center"><div className="text-[10px] text-muted mb-1">Ready</div><div className="text-sm font-bold text-bull-light">{symbolStates.filter((s) => s.status === "ENTRY READY").length}</div></div>
        <div className="glass-card p-3 text-center"><div className="text-[10px] text-muted mb-1">Aligned</div><div className="text-sm font-bold">{symbolStates.filter((s) => s.mode !== "NO_TRADE").length}</div></div>
        <div className="glass-card p-3 text-center"><div className="text-[10px] text-muted mb-1">Open Trades</div><div className="text-sm font-bold text-warn">{symbolStates.filter((s) => s.tradeOpen).length}</div></div>
        <div className="glass-card p-3 text-center"><div className="text-[10px] text-muted mb-1">Today P&L</div><div className="text-sm font-bold text-bull-light">+$142.50</div></div>
      </div>

      {/* Symbol cards */}
      <div className="space-y-3">
        {ranked.map((s) => (
          <div key={s.symbol} className={cn("glass-card p-4 transition-all",
            s.status === "ENTRY READY" ? "border-l-4 border-l-bull glow-bull" :
            s.tradeOpen ? "border-l-4 border-l-accent glow-accent" : "")}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-20">
                  <div className="text-sm font-bold">{s.symbol}</div>
                  <span className={cn("text-[10px] font-bold",
                    s.mode === "BUY_ONLY" ? "text-bull-light" : s.mode === "SELL_ONLY" ? "text-bear-light" : "text-muted")}>{s.mode.replace("_", " ")}</span>
                </div>

                <div className="flex gap-2">
                  <div><div className="text-[9px] text-muted mb-0.5">5m</div><TrendBadge {...s.trend5m} /></div>
                  <div><div className="text-[9px] text-muted mb-0.5">15m</div><TrendBadge {...s.trend15m} /></div>
                  <div><div className="text-[9px] text-muted mb-0.5">1h</div><TrendBadge {...s.trend1h} /></div>
                </div>

                <div className="text-center">
                  <div className="text-[9px] text-muted mb-0.5">5m Candle</div>
                  <span className={cn("text-xs font-bold px-2 py-0.5 rounded",
                    s.candleColor === "GREEN" ? "bg-bull/10 text-bull-light" : s.candleColor === "RED" ? "bg-bear/10 text-bear-light" : "bg-surface-3 text-muted")}>{s.candleColor}</span>
                </div>

                <div className="text-center">
                  <div className="text-[9px] text-muted mb-0.5">Countdown</div>
                  <span className={cn("text-sm font-mono font-bold", s.countdown <= 10 ? "text-warn" : "text-muted-light")}>{formatCountdown(s.countdown)}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-[9px] text-muted mb-0.5">Score</div>
                  <span className="text-sm font-bold text-foreground">{s.score}</span>
                </div>
                <span className={cn("text-[10px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap",
                  s.status === "ENTRY READY" ? "bg-bull/10 text-bull-light border border-bull/20" :
                  s.tradeOpen ? "bg-accent/10 text-accent-light border border-accent/20" :
                  s.status === "WAITING PULLBACK" ? "bg-warn/10 text-warn border border-warn/20" :
                  "bg-surface-3 text-muted border border-border/30")}>
                  {s.tradeOpen ? "TRADE OPEN" : s.status}
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
    </div>
  );
}
