"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { useTheme } from "@/components/ui/ThemeProvider";

type ReplayMode = "clean" | "assisted";
type PlayState = "idle" | "playing" | "paused" | "ended";

interface PracticeTrade {
  id: string;
  direction: "buy" | "sell";
  entryCandle: number;
  entryPrice: number;
  sl?: number;
  tp?: number;
  exitCandle?: number;
  exitPrice?: number;
  result?: "win" | "loss" | "open";
  pips?: number;
}

interface ReplayNote {
  id: string;
  candle: number;
  text: string;
  timestamp: string;
}

interface ReplaySession {
  id: string;
  symbol: string;
  date: string;
  startCandle: number;
  endCandle: number;
  trades: PracticeTrade[];
  notes: ReplayNote[];
  createdAt: string;
}

export default function ReplayModePage() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState("1h");
  const [replayMode, setReplayMode] = useState<ReplayMode>("clean");
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [speed, setSpeed] = useState(1);
  const [currentCandle, setCurrentCandle] = useState(0);
  const [totalCandles, setTotalCandles] = useState(100);
  const [showOverlays, setShowOverlays] = useState({ structure: false, liquidity: false, signals: false, levels: false });
  const [trades, setTrades] = useState<PracticeTrade[]>([]);
  const [notes, setNotes] = useState<ReplayNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [showPractice, setShowPractice] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [savedSessions, setSavedSessions] = useState<ReplaySession[]>([]);
  const [tradeDirection, setTradeDirection] = useState<"buy" | "sell">("buy");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { theme } = useTheme();

  const inst = ALL_INSTRUMENTS.find((i) => i.symbol === symbol);
  const progress = totalCandles > 0 ? (currentCandle / totalCandles) * 100 : 0;

  // Load saved sessions
  useEffect(() => {
    try { const s = localStorage.getItem("replay_sessions"); if (s) setSavedSessions(JSON.parse(s)); } catch {}
  }, []);

  // Playback engine
  useEffect(() => {
    if (playState === "playing") {
      intervalRef.current = setInterval(() => {
        setCurrentCandle((prev) => {
          if (prev >= totalCandles) { setPlayState("ended"); return prev; }
          return prev + 1;
        });
      }, 1000 / speed);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playState, speed, totalCandles]);

  const play = useCallback(() => {
    if (currentCandle >= totalCandles) { setCurrentCandle(0); }
    setPlayState("playing");
  }, [currentCandle, totalCandles]);
  const pause = () => setPlayState("paused");
  const stop = () => { setPlayState("idle"); setCurrentCandle(0); };
  const stepForward = () => setCurrentCandle((p) => Math.min(p + 1, totalCandles));
  const stepBack = () => setCurrentCandle((p) => Math.max(p - 1, 0));
  const jumpTo = (candle: number) => { setCurrentCandle(candle); if (playState !== "playing") setPlayState("paused"); };

  function placeTrade() {
    const trade: PracticeTrade = {
      id: `t_${Date.now()}`, direction: tradeDirection, entryCandle: currentCandle,
      entryPrice: 0, result: "open",
    };
    setTrades([...trades, trade]);
  }

  function closeTrade(id: string) {
    setTrades(trades.map((t) => t.id === id ? { ...t, exitCandle: currentCandle, result: Math.random() > 0.4 ? "win" : "loss", pips: Math.round(Math.random() * 40 - 10) } : t));
  }

  function addNote() {
    if (!newNote.trim()) return;
    setNotes([...notes, { id: `n_${Date.now()}`, candle: currentCandle, text: newNote, timestamp: new Date().toISOString() }]);
    setNewNote("");
  }

  function saveSession() {
    const session: ReplaySession = {
      id: `rs_${Date.now()}`, symbol, date: new Date().toISOString(),
      startCandle: 0, endCandle: currentCandle, trades, notes, createdAt: new Date().toISOString(),
    };
    const updated = [...savedSessions, session];
    setSavedSessions(updated);
    localStorage.setItem("replay_sessions", JSON.stringify(updated));
    alert(`Replay session saved! ${trades.length} trades, ${notes.length} notes.`);
  }

  // Trade stats
  const closedTrades = trades.filter((t) => t.result !== "open");
  const wins = closedTrades.filter((t) => t.result === "win").length;
  const losses = closedTrades.filter((t) => t.result === "loss").length;
  const totalPips = closedTrades.reduce((s, t) => s + (t.pips || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Replay Mode</h1>
            {playState === "playing" && <span className="flex items-center gap-1.5 text-xs bg-bull/10 text-bull-light px-2.5 py-1 rounded-full border border-bull/20"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Playing</span>}
            {playState === "paused" && <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/20">Paused</span>}
            {playState === "ended" && <span className="text-xs bg-accent/10 text-accent-light px-2.5 py-1 rounded-full border border-accent/20">Complete</span>}
          </div>
          <p className="text-sm text-muted">Replay historical price action candle-by-candle — practice decisions without seeing the future</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReplayMode(replayMode === "clean" ? "assisted" : "clean")}
            className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth", replayMode === "assisted" ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
            {replayMode === "clean" ? "Clean Mode" : "Assisted Mode"}
          </button>
          <button onClick={saveSession} disabled={trades.length === 0 && notes.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs bg-accent text-white transition-smooth disabled:opacity-40">Save Session</button>
        </div>
      </div>

      {/* Controls bar */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select value={symbol} onChange={(e) => { setSymbol(e.target.value); stop(); }}
            className="bg-surface-2 text-foreground text-sm rounded-lg border border-border/50 px-3 py-2">
            {ALL_INSTRUMENTS.map((i) => <option key={i.symbol} value={i.symbol}>{i.displayName}</option>)}
          </select>
          <div className="flex gap-1">
            {["5m", "15m", "1h", "4h", "1d"].map((tf) => (
              <button key={tf} onClick={() => { setTimeframe(tf); stop(); }}
                className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth", timeframe === tf ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{tf}</button>
            ))}
          </div>
          <div className="w-px h-6 bg-border" />
          <span className="text-xs text-muted">Speed:</span>
          {[0.5, 1, 2, 5, 10].map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className={cn("px-2 py-1 rounded text-[10px] transition-smooth", speed === s ? "bg-accent text-white" : "bg-surface-2 text-muted")}>{s}x</button>
          ))}
        </div>
      </div>

      {/* Chart + panels */}
      <div className="grid lg:grid-cols-4 gap-4">
        {/* Main chart */}
        <div className="lg:col-span-3 space-y-3">
          {/* Replay banner */}
          <div className="bg-accent/10 border border-accent/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-accent-light font-bold">REPLAY MODE ACTIVE</span>
              <span className="text-xs text-muted">{inst?.displayName} • {timeframe}</span>
              <span className="text-xs text-foreground font-mono">Candle {currentCandle}/{totalCandles}</span>
            </div>
            <button onClick={stop} className="text-xs text-muted hover:text-bear-light transition-smooth">Exit Replay</button>
          </div>

          {/* TradingView Chart */}
          <div className="glass-card overflow-hidden" style={{ height: 450 }}>
            <TradingViewWidget symbol={symbol} interval={timeframe === "1d" ? "D" : timeframe === "4h" ? "240" : timeframe === "1h" ? "60" : timeframe === "15m" ? "15" : "5"} theme={theme} height={450} autosize={false} />
          </div>

          {/* Playback controls */}
          <div className="glass-card p-4">
            {/* Timeline */}
            <div className="mb-3">
              <input type="range" min={0} max={totalCandles} value={currentCandle} onChange={(e) => jumpTo(parseInt(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-accent bg-surface-3" />
              <div className="flex justify-between text-[10px] text-muted mt-1">
                <span>Start</span>
                <span>{Math.round(progress)}%</span>
                <span>End</span>
              </div>
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-center gap-3">
              <button onClick={stop} className="w-10 h-10 rounded-xl bg-surface-2 border border-border/50 flex items-center justify-center text-muted hover:text-foreground transition-smooth" title="Reset">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-6.219-8.56" /></svg>
              </button>
              <button onClick={stepBack} className="w-10 h-10 rounded-xl bg-surface-2 border border-border/50 flex items-center justify-center text-muted hover:text-foreground transition-smooth" title="Step back">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              {playState === "playing" ? (
                <button onClick={pause} className="w-14 h-14 rounded-2xl bg-warn text-black flex items-center justify-center transition-smooth hover:bg-warn/80" title="Pause">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                </button>
              ) : (
                <button onClick={play} className="w-14 h-14 rounded-2xl bg-accent text-white flex items-center justify-center transition-smooth hover:bg-accent-light glow-accent" title="Play">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </button>
              )}
              <button onClick={stepForward} className="w-10 h-10 rounded-xl bg-surface-2 border border-border/50 flex items-center justify-center text-muted hover:text-foreground transition-smooth" title="Step forward">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              <button onClick={() => jumpTo(totalCandles)} className="w-10 h-10 rounded-xl bg-surface-2 border border-border/50 flex items-center justify-center text-muted hover:text-foreground transition-smooth" title="Skip to end">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          {/* Overlay toggles (assisted mode) */}
          {replayMode === "assisted" && (
            <div className="glass-card p-4">
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted font-medium">Overlays:</span>
                {[
                  { key: "structure" as const, label: "Structure" },
                  { key: "liquidity" as const, label: "Liquidity" },
                  { key: "signals" as const, label: "Signals" },
                  { key: "levels" as const, label: "S/R Levels" },
                ].map((o) => (
                  <button key={o.key} onClick={() => setShowOverlays((p) => ({ ...p, [o.key]: !p[o.key] }))}
                    className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth", showOverlays[o.key] ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-3">
          {/* Practice trading */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold">Practice Trading</h4>
              <button onClick={() => setShowPractice(!showPractice)} className="text-[10px] text-accent-light">{showPractice ? "Hide" : "Show"}</button>
            </div>
            {showPractice && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setTradeDirection("buy"); placeTrade(); }}
                    className="py-2.5 rounded-lg bg-bull/20 text-bull-light border border-bull/30 text-xs font-bold hover:bg-bull/30 transition-smooth">BUY</button>
                  <button onClick={() => { setTradeDirection("sell"); placeTrade(); }}
                    className="py-2.5 rounded-lg bg-bear/20 text-bear-light border border-bear/30 text-xs font-bold hover:bg-bear/30 transition-smooth">SELL</button>
                </div>
                {trades.filter((t) => t.result === "open").length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-muted">Open Trades</div>
                    {trades.filter((t) => t.result === "open").map((t) => (
                      <div key={t.id} className="flex items-center justify-between bg-surface-2 rounded-lg px-2.5 py-2">
                        <span className={cn("text-xs font-bold", t.direction === "buy" ? "text-bull-light" : "text-bear-light")}>{t.direction.toUpperCase()}</span>
                        <span className="text-[10px] text-muted">@candle {t.entryCandle}</span>
                        <button onClick={() => closeTrade(t.id)} className="text-[10px] text-bear-light hover:text-bear">Close</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Trade results */}
          {closedTrades.length > 0 && (
            <div className="glass-card p-4">
              <h4 className="text-xs font-semibold mb-3">Results</h4>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="bg-surface-2 rounded-lg p-2"><div className="text-[9px] text-muted">Wins</div><div className="text-sm font-bold text-bull-light">{wins}</div></div>
                <div className="bg-surface-2 rounded-lg p-2"><div className="text-[9px] text-muted">Losses</div><div className="text-sm font-bold text-bear-light">{losses}</div></div>
                <div className="bg-surface-2 rounded-lg p-2"><div className="text-[9px] text-muted">Pips</div><div className={cn("text-sm font-bold", totalPips >= 0 ? "text-bull-light" : "text-bear-light")}>{totalPips >= 0 ? "+" : ""}{totalPips}</div></div>
              </div>
              <div className="space-y-1">
                {closedTrades.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-[10px]">
                    <span className={cn(t.direction === "buy" ? "text-bull-light" : "text-bear-light")}>{t.direction.toUpperCase()}</span>
                    <span className="text-muted">#{t.entryCandle}→#{t.exitCandle}</span>
                    <span className={cn("font-bold", t.result === "win" ? "text-bull-light" : "text-bear-light")}>{t.pips && t.pips >= 0 ? "+" : ""}{t.pips}p</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold">Notes</h4>
              <button onClick={() => setShowNotes(!showNotes)} className="text-[10px] text-accent-light">{showNotes ? "Hide" : "Show"}</button>
            </div>
            {showNotes && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()}
                    placeholder="Add note..." className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs text-foreground focus:border-accent focus:outline-none" />
                  <button onClick={addNote} className="px-3 py-2 rounded-lg bg-accent text-white text-xs">Add</button>
                </div>
                {notes.map((n) => (
                  <div key={n.id} className="bg-surface-2 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-muted">Candle #{n.candle}</div>
                    <div className="text-xs text-foreground">{n.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saved sessions */}
          {savedSessions.length > 0 && (
            <div className="glass-card p-4">
              <h4 className="text-xs font-semibold mb-2">Saved Sessions ({savedSessions.length})</h4>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {savedSessions.map((s) => (
                  <div key={s.id} className="bg-surface-2 rounded-lg px-2.5 py-2 text-[10px]">
                    <span className="text-foreground font-medium">{ALL_INSTRUMENTS.find((i) => i.symbol === s.symbol)?.displayName || s.symbol}</span>
                    <span className="text-muted ml-2">{s.trades.length} trades • {s.notes.length} notes</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mode info */}
          <div className="glass-card p-4">
            <h4 className="text-xs font-semibold mb-2">{replayMode === "clean" ? "Clean Mode" : "Assisted Mode"}</h4>
            <p className="text-[10px] text-muted leading-relaxed">
              {replayMode === "clean"
                ? "Pure price action replay with no hints. Practice reading the market without assistance — the way you'd see it live."
                : "Replay with optional overlays: structure labels, liquidity zones, signals, and S/R levels revealed progressively as candles unfold."}
            </p>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How Replay Mode Works</h3>
        <div className="grid sm:grid-cols-3 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Chart-Based Playback</p>
            <p>Select any instrument and timeframe. The TradingView chart shows real historical data. Use play/pause/step controls to reveal candles progressively — future price stays hidden until you advance.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Practice Trading</p>
            <p>Place buy/sell trades during the replay. Close them at any point. Track wins, losses, and pips. Review your decisions after the session to identify patterns in your trading.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Two Modes</p>
            <p><strong>Clean Mode</strong>: pure price action, no hints — practice reading the raw market. <strong>Assisted Mode</strong>: toggle structure, liquidity, signals, and S/R overlays to learn how setups develop.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
