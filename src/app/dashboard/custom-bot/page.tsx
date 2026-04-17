"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

type BuildStep = 1 | 2 | 3 | 4 | 5 | 6;

interface BotDefinition {
  botName: string;
  botFamily: string;
  symbols: string[];
  primaryTimeframe: string;
  confirmationTimeframe: string;
  executionMode: string;
  entryModel: string[];
  confluenceFilters: string[];
  riskModel: string;
  fixedLot: number;
  riskPercent: number;
  slMethod: string;
  tpMethod: string;
  trailingStop: boolean;
  breakEven: boolean;
  partialClose: boolean;
  candleCloseExit: boolean;
  sessions: string[];
  maxSpread: number;
  maxOpenTrades: number;
  maxPerSymbol: number;
  dailyDrawdown: number;
  pauseAfterLosses: number;
  newsFilter: boolean;
  fridayProtection: boolean;
  preCloseBuffer: number;
  killSwitch: boolean;
  status: "draft" | "paper" | "live";
  createdAt: string;
}

const defaultBot: BotDefinition = {
  botName: "", botFamily: "", symbols: [], primaryTimeframe: "1h", confirmationTimeframe: "", executionMode: "paper",
  entryModel: [], confluenceFilters: [], riskModel: "fixed_lot", fixedLot: 0.10, riskPercent: 1.0,
  slMethod: "", tpMethod: "", trailingStop: false, breakEven: false, partialClose: false, candleCloseExit: false,
  sessions: ["london", "newyork"], maxSpread: 2.0, maxOpenTrades: 3, maxPerSymbol: 1, dailyDrawdown: 3.0,
  pauseAfterLosses: 3, newsFilter: true, fridayProtection: true, preCloseBuffer: 30, killSwitch: true,
  status: "draft", createdAt: "",
};

const botFamilies = [
  { id: "trend", label: "Trend Continuation", desc: "Follow established trends with pullback entries" },
  { id: "breakout", label: "Breakout", desc: "Catch momentum when price breaks key levels" },
  { id: "orderblock", label: "Order Block", desc: "Trade institutional supply/demand zones" },
  { id: "pullback", label: "Pullback", desc: "Enter on retracements within a trend" },
  { id: "scalp", label: "Scalp", desc: "Fast in-and-out trades on lower timeframes" },
  { id: "reversal", label: "Reversal", desc: "Catch trend changes at key levels" },
  { id: "hybrid", label: "Custom Hybrid", desc: "Mix multiple strategies together" },
];

const entryModels = [
  { id: "breakout_close", label: "Breakout Close", desc: "Enter when candle closes beyond a key level" },
  { id: "pullback_retest", label: "Pullback Retest", desc: "Wait for price to retest broken level before entry" },
  { id: "engulfing", label: "Engulfing Candle", desc: "Enter on confirmed engulfing pattern at key zone" },
  { id: "ob_retest", label: "Order Block Retest", desc: "Enter when price retests an institutional zone" },
  { id: "bos", label: "Break of Structure", desc: "Enter after confirmed BOS with momentum" },
  { id: "fvg_fill", label: "FVG Fill", desc: "Enter when price fills a fair value gap" },
  { id: "ema_cross", label: "EMA Cross", desc: "Enter on EMA crossover with trend confirmation" },
  { id: "liquidity_sweep", label: "Liquidity Sweep Reversal", desc: "Enter after stops are swept and price reverses" },
];

const confluenceOptions = [
  { id: "ema_alignment", label: "EMA Alignment", desc: "EMAs stacked in trend direction" },
  { id: "htf_bias", label: "Higher TF Bias", desc: "Trade only in direction of higher timeframe" },
  { id: "structure_bias", label: "Structure Bias", desc: "HH/HL for longs, LH/LL for shorts" },
  { id: "atr_filter", label: "ATR Range Filter", desc: "Only trade when volatility is in acceptable range" },
  { id: "session_filter", label: "Session Filter", desc: "Only trade during active session hours" },
  { id: "volume_confirm", label: "Volume Confirmation", desc: "Require above-average volume for entries" },
  { id: "rsi_filter", label: "RSI Filter", desc: "Avoid overbought/oversold extremes" },
  { id: "spread_check", label: "Spread Check", desc: "Reject entries when spread is too wide" },
  { id: "news_avoid", label: "News Avoidance", desc: "Skip entries around high-impact events" },
  { id: "correlation_check", label: "Correlation Check", desc: "Avoid correlated exposure" },
];

const slMethods = ["Fixed Pips", "ATR-based (1.5x ATR)", "Structure-based (swing low/high)", "Percentage of price", "Recent candle low/high"];
const tpMethods = ["Fixed Pips", "ATR-based (2x ATR)", "Next key level", "2R (2x risk)", "3R (3x risk)", "Trailing only", "Session close"];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => (
        <div key={step} className="flex items-center gap-2">
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-smooth",
            step === current ? "bg-accent text-white" : step < current ? "bg-bull text-white" : "bg-surface-3 text-muted")}>
            {step < current ? "✓" : step}
          </div>
          {step < total && <div className={cn("w-8 h-0.5 rounded-full", step < current ? "bg-bull" : "bg-surface-3")} />}
        </div>
      ))}
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between bg-surface-2 rounded-xl p-3">
      <span className="text-xs text-foreground">{label}</span>
      <button onClick={() => onChange(!value)} className={cn("w-10 h-5 rounded-full relative transition-smooth", value ? "bg-accent" : "bg-surface-3")}>
        <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", value ? "left-5" : "left-0.5")} />
      </button>
    </div>
  );
}

export default function CustomBotPage() {
  const [step, setStep] = useState<BuildStep>(1);
  const [bot, setBot] = useState<BotDefinition>(defaultBot);
  const [savedBots, setSavedBots] = useState<BotDefinition[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("custom_bots");
    if (saved) try { setSavedBots(JSON.parse(saved)); } catch {}
  }, []);

  function update(partial: Partial<BotDefinition>) { setBot((prev) => ({ ...prev, ...partial })); }
  function toggleArray(arr: string[], item: string) { return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]; }

  function validate(): string[] {
    const errs: string[] = [];
    if (!bot.botName.trim()) errs.push("Bot name is required");
    if (!bot.botFamily) errs.push("Select a strategy family");
    if (bot.symbols.length === 0) errs.push("Select at least one instrument");
    if (bot.entryModel.length === 0) errs.push("Select at least one entry model");
    if (!bot.slMethod) errs.push("Stop loss method is required for any execution mode");
    if (!bot.tpMethod) errs.push("Take profit method is required");
    if (bot.sessions.length === 0) errs.push("Select at least one trading session");
    if (!bot.trailingStop && !bot.breakEven && !bot.partialClose && !bot.candleCloseExit && bot.tpMethod === "Trailing only") errs.push("Enable at least one exit/protection rule");
    return errs;
  }

  function saveDraft() {
    const draft = { ...bot, status: "draft" as const, createdAt: new Date().toISOString() };
    const updated = [...savedBots, draft];
    setSavedBots(updated);
    localStorage.setItem("custom_bots", JSON.stringify(updated));
    // Also register in bot registry for bot-agents
    const registry = JSON.parse(localStorage.getItem("custom_bot_registry") || "[]");
    registry.push({ name: draft.botName, family: draft.botFamily, status: draft.status, createdAt: draft.createdAt });
    localStorage.setItem("custom_bot_registry", JSON.stringify(registry));
    alert(`Bot "${bot.botName}" saved as draft!`);
  }

  function publish() {
    const errs = validate();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    const published = { ...bot, status: "paper" as const, createdAt: new Date().toISOString() };
    const updated = [...savedBots, published];
    setSavedBots(updated);
    localStorage.setItem("custom_bots", JSON.stringify(updated));
    const registry = JSON.parse(localStorage.getItem("custom_bot_registry") || "[]");
    registry.push({ name: published.botName, family: published.botFamily, status: "paper", createdAt: published.createdAt });
    localStorage.setItem("custom_bot_registry", JSON.stringify(registry));
    alert(`Bot "${bot.botName}" published in Paper Mode! Go to the Algo Hub to monitor it.`);
    setBot(defaultBot);
    setStep(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custom Bot Builder</h1>
          <p className="text-sm text-muted mt-1">Assemble a trading bot from modular strategy pieces — no code required</p>
        </div>
        <button onClick={() => setShowSaved(!showSaved)} className="px-4 py-2 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-xs font-medium hover:border-border-light transition-smooth">
          {showSaved ? "Hide" : "My Bots"} ({savedBots.length})
        </button>
      </div>

      {/* Saved bots */}
      {showSaved && savedBots.length > 0 && (
        <div className="space-y-3">
          {savedBots.map((b, i) => (
            <div key={i} className="glass-card p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{b.botName}</div>
                <div className="text-xs text-muted capitalize">{b.botFamily} • {b.symbols.length} pairs • {b.status}</div>
              </div>
              <div className="flex gap-2">
                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", b.status === "paper" ? "bg-warn/10 text-warn" : b.status === "live" ? "bg-bull/10 text-bull-light" : "bg-surface-3 text-muted")}>{b.status}</span>
                <button onClick={() => { setBot(b); setStep(1); setShowSaved(false); }} className="text-xs text-accent-light hover:text-accent">Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <StepIndicator current={step} total={6} />

      {errors.length > 0 && (
        <div className="bg-bear/10 border border-bear/20 rounded-xl p-4 space-y-1">
          {errors.map((e, i) => <p key={i} className="text-xs text-bear-light">• {e}</p>)}
        </div>
      )}

      {/* STEP 1: Name & Family */}
      {step === 1 && (
        <div className="space-y-5">
          <h3 className="text-lg font-semibold">Step 1: Bot Identity</h3>
          <div><label className="text-xs text-muted-light mb-1.5 block">Bot Name</label>
            <input type="text" value={bot.botName} onChange={(e) => update({ botName: e.target.value })} placeholder="e.g. Gold Breakout Bot" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
          <div>
            <label className="text-xs text-muted-light mb-2 block">Strategy Family</label>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {botFamilies.map((f) => (
                <button key={f.id} onClick={() => update({ botFamily: f.id })}
                  className={cn("text-left p-4 rounded-xl transition-smooth border", bot.botFamily === f.id ? "bg-accent/10 border-accent/30" : "bg-surface-2 border-border/50 hover:border-border-light")}>
                  <div className="text-sm font-semibold text-foreground">{f.label}</div>
                  <div className="text-[10px] text-muted mt-1">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setStep(2)} disabled={!bot.botName.trim() || !bot.botFamily}
            className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium transition-smooth disabled:opacity-40">Next: Instruments →</button>
        </div>
      )}

      {/* STEP 2: Symbols, TF, Mode */}
      {step === 2 && (
        <div className="space-y-5">
          <h3 className="text-lg font-semibold">Step 2: Instruments & Timeframes</h3>
          <div>
            <label className="text-xs text-muted-light mb-2 block">Select Instruments ({bot.symbols.length})</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_INSTRUMENTS.map((inst) => (
                <button key={inst.symbol} onClick={() => update({ symbols: toggleArray(bot.symbols, inst.symbol) })}
                  className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth", bot.symbols.includes(inst.symbol) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
                  {inst.displayName}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => update({ symbols: ALL_INSTRUMENTS.map((i) => i.symbol) })} className="text-[10px] text-accent-light">Select All</button>
              <button onClick={() => update({ symbols: [] })} className="text-[10px] text-muted">Clear</button>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-xs text-muted-light mb-1.5 block">Primary Timeframe</label>
              <div className="flex gap-2">{["5m", "15m", "1h", "4h"].map((tf) => (
                <button key={tf} onClick={() => update({ primaryTimeframe: tf })} className={cn("flex-1 py-2.5 rounded-xl text-xs font-medium transition-smooth", bot.primaryTimeframe === tf ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{tf}</button>
              ))}</div></div>
            <div><label className="text-xs text-muted-light mb-1.5 block">Confirmation Timeframe (optional)</label>
              <div className="flex gap-2">{["none", "15m", "1h", "4h", "1d"].map((tf) => (
                <button key={tf} onClick={() => update({ confirmationTimeframe: tf === "none" ? "" : tf })} className={cn("flex-1 py-2.5 rounded-xl text-xs font-medium transition-smooth capitalize", (tf === "none" ? !bot.confirmationTimeframe : bot.confirmationTimeframe === tf) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{tf}</button>
              ))}</div></div>
          </div>
          <div><label className="text-xs text-muted-light mb-1.5 block">Execution Mode</label>
            <div className="flex gap-2">{["signal", "paper", "live"].map((m) => (
              <button key={m} onClick={() => update({ executionMode: m })} className={cn("flex-1 py-2.5 rounded-xl text-xs font-medium capitalize transition-smooth", bot.executionMode === m ? (m === "live" ? "bg-bull text-white" : "bg-accent text-white") : "bg-surface-2 text-muted-light border border-border/50")}>{m === "signal" ? "Signal Only" : m === "paper" ? "Paper Trade" : "Live Trade"}</button>
            ))}</div>
            {bot.executionMode === "live" && <p className="text-[10px] text-warn mt-1">⚠ Live mode requires admin approval and full validation before publishing</p>}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">← Back</button>
            <button onClick={() => setStep(3)} disabled={bot.symbols.length === 0} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40">Next: Entry Logic →</button>
          </div>
        </div>
      )}

      {/* STEP 3: Entry & Confluence */}
      {step === 3 && (
        <div className="space-y-5">
          <h3 className="text-lg font-semibold">Step 3: Entry Models & Confluence</h3>
          <div>
            <label className="text-xs text-muted-light mb-2 block">Entry Trigger Models (select one or more)</label>
            <div className="grid sm:grid-cols-2 gap-2">
              {entryModels.map((em) => (
                <button key={em.id} onClick={() => update({ entryModel: toggleArray(bot.entryModel, em.id) })}
                  className={cn("text-left p-3 rounded-xl transition-smooth border", bot.entryModel.includes(em.id) ? "bg-accent/10 border-accent/30" : "bg-surface-2 border-border/50")}>
                  <div className="text-xs font-semibold text-foreground">{em.label}</div>
                  <div className="text-[10px] text-muted">{em.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-light mb-2 block">Confluence Filters</label>
            <div className="grid sm:grid-cols-2 gap-2">
              {confluenceOptions.map((cf) => (
                <button key={cf.id} onClick={() => update({ confluenceFilters: toggleArray(bot.confluenceFilters, cf.id) })}
                  className={cn("text-left p-3 rounded-xl transition-smooth border", bot.confluenceFilters.includes(cf.id) ? "bg-bull/10 border-bull/30" : "bg-surface-2 border-border/50")}>
                  <div className="text-xs font-semibold text-foreground">{cf.label}</div>
                  <div className="text-[10px] text-muted">{cf.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="px-6 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">← Back</button>
            <button onClick={() => setStep(4)} disabled={bot.entryModel.length === 0} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40">Next: Risk & Management →</button>
          </div>
        </div>
      )}

      {/* STEP 4: Risk, Sessions, Trade Mgmt */}
      {step === 4 && (
        <div className="space-y-5">
          <h3 className="text-lg font-semibold">Step 4: Risk, Sessions & Trade Management</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-xs text-muted-light mb-1.5 block">Risk Model</label>
              <div className="flex gap-2">{[{id: "fixed_lot", l: "Fixed Lot"}, {id: "risk_percent", l: "Risk %"}, {id: "vol_adjusted", l: "Volatility Adjusted"}].map((r) => (
                <button key={r.id} onClick={() => update({ riskModel: r.id })} className={cn("flex-1 py-2.5 rounded-xl text-xs font-medium transition-smooth", bot.riskModel === r.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{r.l}</button>
              ))}</div></div>
            <div><label className="text-xs text-muted-light mb-1.5 block">{bot.riskModel === "fixed_lot" ? "Lot Size" : "Risk %"}</label>
              <input type="number" step="0.01" value={bot.riskModel === "fixed_lot" ? bot.fixedLot : bot.riskPercent}
                onChange={(e) => bot.riskModel === "fixed_lot" ? update({ fixedLot: parseFloat(e.target.value) || 0.01 }) : update({ riskPercent: parseFloat(e.target.value) || 1 })}
                className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-xs text-muted-light mb-1.5 block">Stop Loss Method</label>
              <select value={bot.slMethod} onChange={(e) => update({ slMethod: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border text-sm text-foreground">
                <option value="">Select...</option>{slMethods.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
            <div><label className="text-xs text-muted-light mb-1.5 block">Take Profit Method</label>
              <select value={bot.tpMethod} onChange={(e) => update({ tpMethod: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border text-sm text-foreground">
                <option value="">Select...</option>{tpMethods.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          </div>
          <div><label className="text-xs text-muted-light mb-2 block">Trade Management</label>
            <div className="grid sm:grid-cols-2 gap-2">
              <Toggle value={bot.trailingStop} onChange={(v) => update({ trailingStop: v })} label="Trailing Stop" />
              <Toggle value={bot.breakEven} onChange={(v) => update({ breakEven: v })} label="Move SL to Break-Even" />
              <Toggle value={bot.partialClose} onChange={(v) => update({ partialClose: v })} label="Partial Close at TP1" />
              <Toggle value={bot.candleCloseExit} onChange={(v) => update({ candleCloseExit: v })} label="Candle Close Exit" />
            </div></div>
          <div><label className="text-xs text-muted-light mb-2 block">Sessions</label>
            <div className="flex gap-2">{["london", "newyork", "asia", "overlap"].map((s) => (
              <button key={s} onClick={() => update({ sessions: toggleArray(bot.sessions, s) })} className={cn("px-4 py-2 rounded-xl text-xs font-medium capitalize transition-smooth", bot.sessions.includes(s) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{s === "newyork" ? "New York" : s}</button>
            ))}</div></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className="text-xs text-muted-light mb-1 block">Max Spread</label><input type="number" step="0.1" value={bot.maxSpread} onChange={(e) => update({ maxSpread: parseFloat(e.target.value) || 2 })} className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
            <div><label className="text-xs text-muted-light mb-1 block">Max Open</label><input type="number" value={bot.maxOpenTrades} onChange={(e) => update({ maxOpenTrades: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
            <div><label className="text-xs text-muted-light mb-1 block">Daily DD %</label><input type="number" step="0.5" value={bot.dailyDrawdown} onChange={(e) => update({ dailyDrawdown: parseFloat(e.target.value) || 3 })} className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
            <div><label className="text-xs text-muted-light mb-1 block">Pause After Losses</label><input type="number" value={bot.pauseAfterLosses} onChange={(e) => update({ pauseAfterLosses: parseInt(e.target.value) || 3 })} className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <Toggle value={bot.newsFilter} onChange={(v) => update({ newsFilter: v })} label="News Filter" />
            <Toggle value={bot.fridayProtection} onChange={(v) => update({ fridayProtection: v })} label="Friday Close Protection" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="px-6 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">← Back</button>
            <button onClick={() => setStep(5)} disabled={!bot.slMethod || !bot.tpMethod} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40">Next: Preview →</button>
          </div>
        </div>
      )}

      {/* STEP 5: Preview */}
      {step === 5 && (
        <div className="space-y-5">
          <h3 className="text-lg font-semibold">Step 5: Bot Preview</h3>
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-foreground">{bot.botName}</h4>
              <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full capitalize", bot.executionMode === "live" ? "bg-bull/10 text-bull-light" : bot.executionMode === "paper" ? "bg-warn/10 text-warn" : "bg-surface-3 text-muted")}>{bot.executionMode}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">Family</span><span className="text-foreground capitalize">{bot.botFamily}</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">Instruments</span><span className="text-foreground">{bot.symbols.length} pairs</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">Timeframe</span><span className="text-foreground">{bot.primaryTimeframe}{bot.confirmationTimeframe ? ` + ${bot.confirmationTimeframe}` : ""}</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">Entry Models</span><span className="text-foreground">{bot.entryModel.length} selected</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">Filters</span><span className="text-foreground">{bot.confluenceFilters.length} active</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">Risk</span><span className="text-foreground">{bot.riskModel === "fixed_lot" ? `${bot.fixedLot} lots` : `${bot.riskPercent}%`}</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">SL Method</span><span className="text-foreground">{bot.slMethod}</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">TP Method</span><span className="text-foreground">{bot.tpMethod}</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">Sessions</span><span className="text-foreground capitalize">{bot.sessions.join(", ")}</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">Max Open</span><span className="text-foreground">{bot.maxOpenTrades}</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">Daily DD</span><span className="text-foreground">{bot.dailyDrawdown}%</span></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted block mb-1">Protections</span><span className="text-foreground">{[bot.newsFilter && "News", bot.fridayProtection && "Friday", bot.trailingStop && "Trail", bot.breakEven && "BE"].filter(Boolean).join(", ") || "None"}</span></div>
            </div>

            {/* Human-readable logic */}
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
              <h5 className="text-xs font-semibold text-accent-light mb-2">Bot Logic Summary</h5>
              <p className="text-xs text-muted-light leading-relaxed">
                <strong>{bot.botName}</strong> is a <strong className="capitalize">{bot.botFamily}</strong> bot that scans <strong>{bot.symbols.length} instruments</strong> on the <strong>{bot.primaryTimeframe}</strong> timeframe
                {bot.confirmationTimeframe ? ` with ${bot.confirmationTimeframe} confirmation` : ""}. It uses <strong>{bot.entryModel.map((e) => entryModels.find((m) => m.id === e)?.label).join(", ")}</strong> for entries
                {bot.confluenceFilters.length > 0 ? `, filtered by ${bot.confluenceFilters.map((f) => confluenceOptions.find((c) => c.id === f)?.label).join(", ")}` : ""}.
                Risk is managed with <strong>{bot.riskModel === "fixed_lot" ? `${bot.fixedLot} lot fixed size` : `${bot.riskPercent}% risk per trade`}</strong>,
                SL via <strong>{bot.slMethod}</strong>, TP via <strong>{bot.tpMethod}</strong>.
                Trading is allowed during <strong className="capitalize">{bot.sessions.join(", ")}</strong> sessions only, with max <strong>{bot.maxOpenTrades}</strong> open positions and <strong>{bot.dailyDrawdown}%</strong> daily drawdown limit.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="px-6 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">← Back</button>
            <button onClick={() => setStep(6)} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium">Next: Validate & Publish →</button>
          </div>
        </div>
      )}

      {/* STEP 6: Validate & Publish */}
      {step === 6 && (
        <div className="space-y-5">
          <h3 className="text-lg font-semibold">Step 6: Validate & Publish</h3>

          {/* Validation checks */}
          <div className="glass-card p-5 space-y-2">
            <h4 className="text-sm font-semibold mb-3">Validation Checks</h4>
            {[
              { label: "Bot name set", pass: !!bot.botName.trim() },
              { label: "Strategy family selected", pass: !!bot.botFamily },
              { label: "At least one instrument", pass: bot.symbols.length > 0 },
              { label: "Entry model selected", pass: bot.entryModel.length > 0 },
              { label: "Stop loss method defined", pass: !!bot.slMethod },
              { label: "Take profit method defined", pass: !!bot.tpMethod },
              { label: "At least one session", pass: bot.sessions.length > 0 },
              { label: "Exit/protection rule active", pass: bot.trailingStop || bot.breakEven || bot.partialClose || bot.candleCloseExit || bot.tpMethod !== "Trailing only" },
              { label: "Risk model configured", pass: bot.riskModel === "fixed_lot" ? bot.fixedLot > 0 : bot.riskPercent > 0 },
            ].map((check) => (
              <div key={check.label} className="flex items-center gap-3">
                <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold", check.pass ? "bg-bull/20 text-bull-light" : "bg-bear/20 text-bear-light")}>{check.pass ? "✓" : "✗"}</span>
                <span className="text-xs text-foreground">{check.label}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(5)} className="px-6 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">← Back</button>
            <button onClick={saveDraft} className="px-6 py-3 rounded-xl bg-surface-2 text-foreground border border-border/50 text-sm font-medium hover:border-border-light transition-smooth">Save as Draft</button>
            <button onClick={publish} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-bold transition-smooth glow-accent hover:bg-accent-light">Publish Bot (Paper Mode)</button>
          </div>
        </div>
      )}
    </div>
  );
}
