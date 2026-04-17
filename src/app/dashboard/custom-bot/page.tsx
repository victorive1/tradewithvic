"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const entryTypes = ["Breakout", "Pullback", "Reversal", "OB Retest"];
const timeframeOptions = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];
const sessionOptions = ["London", "New York", "Asia", "All Sessions"];
const slMethods = ["Fixed Pips", "ATR-Based", "Structure-Based", "Swing High/Low"];
const tpMethods = ["Fixed R:R", "Structure Target", "Trailing Stop", "Partial TP + Trail"];
const automationModes = ["Full Auto", "Semi Auto (Confirm)", "Signal Only"];

export default function CustomBotPage() {
  const [botName, setBotName] = useState("");
  const [entryType, setEntryType] = useState("Breakout");
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(["M15", "H1"]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>(["London", "New York"]);
  const [riskPerTrade, setRiskPerTrade] = useState("1.0");
  const [maxSpread, setMaxSpread] = useState("2.0");
  const [slMethod, setSlMethod] = useState("ATR-Based");
  const [tpMethod, setTpMethod] = useState("Fixed R:R");
  const [maxTradesPerDay, setMaxTradesPerDay] = useState("5");
  const [lotSize, setLotSize] = useState("0.10");
  const [automationMode, setAutomationMode] = useState("Signal Only");
  const [trailAfterBE, setTrailAfterBE] = useState(true);
  const [moveSLtoBE, setMoveSLtoBE] = useState(true);
  const [partialTP, setPartialTP] = useState(true);

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes((prev) => prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]);
  };

  const toggleSession = (sess: string) => {
    setSelectedSessions((prev) => prev.includes(sess) ? prev.filter((s) => s !== sess) : [...prev, sess]);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">Custom Bot Builder</h1>
          <span className="text-xs bg-accent/10 text-accent-light px-2.5 py-1 rounded-full border border-accent/20 font-medium">Demo</span>
        </div>
        <p className="text-sm text-muted">Configure your own algo bot with custom entry model, filters, risk parameters, and automation behavior</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Bot Name */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Bot Identity</h3>
            <div>
              <label className="text-xs text-muted-light mb-1.5 block">Bot Name</label>
              <input type="text" value={botName} onChange={(e) => setBotName(e.target.value)} placeholder="My Custom Bot" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder:text-muted" />
            </div>
          </div>

          {/* Entry Model */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Entry Model</h3>
            <div>
              <label className="text-xs text-muted-light mb-1.5 block">Entry Type</label>
              <div className="grid grid-cols-2 gap-2">
                {entryTypes.map((type) => (
                  <button key={type} onClick={() => setEntryType(type)}
                    className={cn("py-3 rounded-xl text-xs font-medium transition-smooth",
                      entryType === type ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>{type}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-light mb-1.5 block">Timeframes</label>
              <div className="flex flex-wrap gap-2">
                {timeframeOptions.map((tf) => (
                  <button key={tf} onClick={() => toggleTimeframe(tf)}
                    className={cn("px-3 py-2 rounded-lg text-xs font-medium transition-smooth",
                      selectedTimeframes.includes(tf) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{tf}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-light mb-1.5 block">Sessions</label>
              <div className="flex flex-wrap gap-2">
                {sessionOptions.map((sess) => (
                  <button key={sess} onClick={() => toggleSession(sess)}
                    className={cn("px-3 py-2 rounded-lg text-xs font-medium transition-smooth",
                      selectedSessions.includes(sess) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{sess}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Risk Model */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Risk Model</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Risk per Trade (%)</label>
                <input type="number" value={riskPerTrade} onChange={(e) => setRiskPerTrade(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Lot Size</label>
                <input type="number" value={lotSize} onChange={(e) => setLotSize(e.target.value)} step="0.01" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Spread (pips)</label>
                <input type="number" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} step="0.1" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Trades / Day</label>
                <input type="number" value={maxTradesPerDay} onChange={(e) => setMaxTradesPerDay(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* SL / TP Methods */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Stop Loss & Take Profit</h3>
            <div>
              <label className="text-xs text-muted-light mb-1.5 block">SL Method</label>
              <select value={slMethod} onChange={(e) => setSlMethod(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                {slMethods.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-light mb-1.5 block">TP Method</label>
              <select value={tpMethod} onChange={(e) => setTpMethod(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground">
                {tpMethods.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Trade Management */}
          <div className="glass-card p-6 space-y-3">
            <h3 className="text-sm font-semibold">Trade Management</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div><div className="text-xs font-medium text-foreground">Move SL to Break-Even</div><div className="text-[10px] text-muted">After reaching 1R profit</div></div>
                <div onClick={() => setMoveSLtoBE(!moveSLtoBE)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", moveSLtoBE ? "bg-accent" : "bg-surface-3")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", moveSLtoBE ? "left-5" : "left-0.5")} />
                </div>
              </div>
              <div className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div><div className="text-xs font-medium text-foreground">Partial Take Profit</div><div className="text-[10px] text-muted">Close 50% at TP1, trail remainder</div></div>
                <div onClick={() => setPartialTP(!partialTP)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", partialTP ? "bg-accent" : "bg-surface-3")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", partialTP ? "left-5" : "left-0.5")} />
                </div>
              </div>
              <div className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div><div className="text-xs font-medium text-foreground">Trail After BE</div><div className="text-[10px] text-muted">ATR-based trailing stop after break-even</div></div>
                <div onClick={() => setTrailAfterBE(!trailAfterBE)} className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth", trailAfterBE ? "bg-accent" : "bg-surface-3")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", trailAfterBE ? "left-5" : "left-0.5")} />
                </div>
              </div>
            </div>
          </div>

          {/* Automation */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Automation Behavior</h3>
            <div className="grid grid-cols-3 gap-2">
              {automationModes.map((mode) => (
                <button key={mode} onClick={() => setAutomationMode(mode)}
                  className={cn("py-3 rounded-xl text-xs font-medium transition-smooth",
                    automationMode === mode ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{mode}</button>
              ))}
            </div>
          </div>

          {/* Summary + Create */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Bot Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted">Entry</span><div className="text-foreground font-medium mt-0.5">{entryType}</div></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted">Timeframes</span><div className="text-foreground font-medium mt-0.5">{selectedTimeframes.join(", ") || "None"}</div></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted">Sessions</span><div className="text-foreground font-medium mt-0.5">{selectedSessions.join(", ") || "None"}</div></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted">Risk</span><div className="text-foreground font-medium mt-0.5">{riskPerTrade}% / trade</div></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted">SL / TP</span><div className="text-foreground font-medium mt-0.5">{slMethod} / {tpMethod}</div></div>
              <div className="bg-surface-2 rounded-lg p-3"><span className="text-muted">Mode</span><div className="text-foreground font-medium mt-0.5">{automationMode}</div></div>
            </div>
            <button className="w-full py-3 rounded-xl bg-accent text-white text-sm font-bold transition-smooth hover:bg-accent-light">
              Create Bot
            </button>
            <p className="text-[10px] text-muted text-center">Bot will be created in Paper Mode for testing before live deployment</p>
          </div>
        </div>
      </div>
    </div>
  );
}
