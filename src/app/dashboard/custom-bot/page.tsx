"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const entryTypes = ["Breakout", "Pullback", "Reversal", "OB Retest"];
const timeframeOptions = ["5m", "15m", "1h", "4h"];
const sessionOptions = ["London", "New York", "Asia", "All"];
const slMethods = ["Fixed Pips", "ATR-based", "Structure-based"];
const tpMethods = ["Fixed Pips", "ATR-based", "Next Level", "2R", "3R"];
const automationModes = ["Full Auto", "Semi Auto", "Paper", "Signal Only"];

const STORAGE_KEY = "twv_custom_bot";

export default function CustomBotPage() {
  const [botName, setBotName] = useState("");
  const [entryType, setEntryType] = useState("Breakout");
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [riskPerTrade, setRiskPerTrade] = useState("1");
  const [maxSpread, setMaxSpread] = useState("2.0");
  const [slMethod, setSlMethod] = useState("Fixed Pips");
  const [tpMethod, setTpMethod] = useState("Fixed Pips");
  const [maxTradesPerDay, setMaxTradesPerDay] = useState("5");
  const [automationMode, setAutomationMode] = useState("Paper");
  const [moveSLtoBE, setMoveSLtoBE] = useState(false);
  const [partialTP, setPartialTP] = useState(false);
  const [trailAfterBE, setTrailAfterBE] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load saved config from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const config = JSON.parse(saved);
        if (config.botName) setBotName(config.botName);
        if (config.entryType) setEntryType(config.entryType);
        if (config.selectedTimeframes) setSelectedTimeframes(config.selectedTimeframes);
        if (config.selectedSessions) setSelectedSessions(config.selectedSessions);
        if (config.riskPerTrade) setRiskPerTrade(config.riskPerTrade);
        if (config.maxSpread) setMaxSpread(config.maxSpread);
        if (config.slMethod) setSlMethod(config.slMethod);
        if (config.tpMethod) setTpMethod(config.tpMethod);
        if (config.maxTradesPerDay) setMaxTradesPerDay(config.maxTradesPerDay);
        if (config.automationMode) setAutomationMode(config.automationMode);
        if (typeof config.moveSLtoBE === "boolean") setMoveSLtoBE(config.moveSLtoBE);
        if (typeof config.partialTP === "boolean") setPartialTP(config.partialTP);
        if (typeof config.trailAfterBE === "boolean") setTrailAfterBE(config.trailAfterBE);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes((prev) =>
      prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]
    );
  };

  const toggleSession = (sess: string) => {
    if (sess === "All") {
      setSelectedSessions((prev) =>
        prev.includes("All") ? [] : ["All"]
      );
      return;
    }
    setSelectedSessions((prev) => {
      const without = prev.filter((s) => s !== "All");
      return without.includes(sess)
        ? without.filter((s) => s !== sess)
        : [...without, sess];
    });
  };

  const resetAll = () => {
    setBotName("");
    setEntryType("Breakout");
    setSelectedTimeframes([]);
    setSelectedSessions([]);
    setRiskPerTrade("1");
    setMaxSpread("2.0");
    setSlMethod("Fixed Pips");
    setTpMethod("Fixed Pips");
    setMaxTradesPerDay("5");
    setAutomationMode("Paper");
    setMoveSLtoBE(false);
    setPartialTP(false);
    setTrailAfterBE(false);
    setStatusMessage(null);
  };

  const handleCreate = () => {
    const errors: string[] = [];
    if (!botName.trim()) errors.push("Bot name is required");
    if (selectedTimeframes.length === 0) errors.push("Select at least one timeframe");
    if (selectedSessions.length === 0) errors.push("Select at least one session");

    if (errors.length > 0) {
      setStatusMessage({ type: "error", text: errors.join(". ") + "." });
      return;
    }

    const config = {
      botName: botName.trim(),
      entryType,
      selectedTimeframes,
      selectedSessions,
      riskPerTrade,
      maxSpread,
      slMethod,
      tpMethod,
      maxTradesPerDay,
      automationMode,
      moveSLtoBE,
      partialTP,
      trailAfterBE,
      createdAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

      // Also store in a list of all bots for the bot-agents page
      const allBotsRaw = localStorage.getItem("twv_all_custom_bots");
      const allBots: Record<string, typeof config> = allBotsRaw ? JSON.parse(allBotsRaw) : {};
      allBots[config.botName] = config;
      localStorage.setItem("twv_all_custom_bots", JSON.stringify(allBots));

      setStatusMessage({
        type: "success",
        text: `Bot '${config.botName}' created in Paper Mode! Check the Algo Hub to enable it.`,
      });
    } catch {
      setStatusMessage({ type: "error", text: "Failed to save bot configuration." });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">Custom Bot Builder</h1>
          <span className="text-xs bg-accent/10 text-accent-light px-2.5 py-1 rounded-full border border-accent/20 font-medium">
            Builder
          </span>
        </div>
        <p className="text-sm text-muted">
          Configure your own algo bot with custom entry model, filters, risk parameters, and automation behavior
        </p>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div
          className={cn(
            "p-4 rounded-xl text-sm font-medium border",
            statusMessage.type === "success"
              ? "bg-bull/10 text-bull-light border-bull/20"
              : "bg-bear/10 text-bear-light border-bear/20"
          )}
        >
          {statusMessage.text}
          <button
            onClick={() => setStatusMessage(null)}
            className="ml-3 text-xs opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Bot Name */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Bot Identity</h3>
            <div>
              <label className="text-xs text-muted-light mb-1.5 block">Bot Name</label>
              <input
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder="e.g. My Breakout Scalper"
                className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder:text-muted"
              />
            </div>
          </div>

          {/* Entry Model */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Entry Model</h3>
            <div>
              <label className="text-xs text-muted-light mb-1.5 block">Entry Type</label>
              <div className="grid grid-cols-2 gap-2">
                {entryTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setEntryType(type)}
                    className={cn(
                      "py-3 rounded-xl text-xs font-medium transition-smooth",
                      entryType === type
                        ? "bg-accent text-white"
                        : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-light mb-1.5 block">Timeframes</label>
              <div className="flex flex-wrap gap-2">
                {timeframeOptions.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => toggleTimeframe(tf)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-medium transition-smooth",
                      selectedTimeframes.includes(tf)
                        ? "bg-accent text-white"
                        : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-light mb-1.5 block">Sessions</label>
              <div className="flex flex-wrap gap-2">
                {sessionOptions.map((sess) => (
                  <button
                    key={sess}
                    onClick={() => toggleSession(sess)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-medium transition-smooth",
                      selectedSessions.includes(sess)
                        ? "bg-accent text-white"
                        : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
                    )}
                  >
                    {sess}
                  </button>
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
                <input
                  type="number"
                  value={riskPerTrade}
                  onChange={(e) => setRiskPerTrade(e.target.value)}
                  step="0.1"
                  min="0.1"
                  max="10"
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Spread (pips)</label>
                <input
                  type="number"
                  value={maxSpread}
                  onChange={(e) => setMaxSpread(e.target.value)}
                  step="0.1"
                  min="0"
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Max Trades / Day</label>
                <input
                  type="number"
                  value={maxTradesPerDay}
                  onChange={(e) => setMaxTradesPerDay(e.target.value)}
                  min="1"
                  max="50"
                  className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* SL / TP Methods */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Stop Loss &amp; Take Profit</h3>
            <div>
              <label className="text-xs text-muted-light mb-1.5 block">SL Method</label>
              <select
                value={slMethod}
                onChange={(e) => setSlMethod(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
              >
                {slMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-light mb-1.5 block">TP Method</label>
              <select
                value={tpMethod}
                onChange={(e) => setTpMethod(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
              >
                {tpMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Trade Management Toggles */}
          <div className="glass-card p-6 space-y-3">
            <h3 className="text-sm font-semibold">Trade Management</h3>
            <div className="space-y-3">
              {/* Move SL to BE */}
              <div className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div>
                  <div className="text-xs font-medium text-foreground">Move SL to Break-Even</div>
                  <div className="text-[10px] text-muted">After reaching 1R profit</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={moveSLtoBE}
                  onClick={() => setMoveSLtoBE(!moveSLtoBE)}
                  className={cn(
                    "w-10 h-5 rounded-full relative cursor-pointer transition-smooth flex-shrink-0",
                    moveSLtoBE ? "bg-accent" : "bg-surface-3"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth",
                      moveSLtoBE ? "left-5" : "left-0.5"
                    )}
                  />
                </button>
              </div>

              {/* Partial TP */}
              <div className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div>
                  <div className="text-xs font-medium text-foreground">Partial Take Profit</div>
                  <div className="text-[10px] text-muted">Close 50% at TP1, trail remainder</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={partialTP}
                  onClick={() => setPartialTP(!partialTP)}
                  className={cn(
                    "w-10 h-5 rounded-full relative cursor-pointer transition-smooth flex-shrink-0",
                    partialTP ? "bg-accent" : "bg-surface-3"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth",
                      partialTP ? "left-5" : "left-0.5"
                    )}
                  />
                </button>
              </div>

              {/* Trail After BE */}
              <div className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div>
                  <div className="text-xs font-medium text-foreground">Trail After BE</div>
                  <div className="text-[10px] text-muted">ATR-based trailing stop after break-even</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={trailAfterBE}
                  onClick={() => setTrailAfterBE(!trailAfterBE)}
                  className={cn(
                    "w-10 h-5 rounded-full relative cursor-pointer transition-smooth flex-shrink-0",
                    trailAfterBE ? "bg-accent" : "bg-surface-3"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth",
                      trailAfterBE ? "left-5" : "left-0.5"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Automation Mode */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Automation Behavior</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {automationModes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAutomationMode(mode)}
                  className={cn(
                    "py-3 rounded-xl text-xs font-medium transition-smooth",
                    automationMode === mode
                      ? "bg-accent text-white"
                      : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Live Summary Card */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Bot Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-surface-2 rounded-lg p-3">
                <span className="text-muted">Name</span>
                <div className="text-foreground font-medium mt-0.5 truncate">
                  {botName.trim() || "Not set"}
                </div>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <span className="text-muted">Entry</span>
                <div className="text-foreground font-medium mt-0.5">{entryType}</div>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <span className="text-muted">Timeframes</span>
                <div className="text-foreground font-medium mt-0.5">
                  {selectedTimeframes.length > 0 ? selectedTimeframes.join(", ") : "None"}
                </div>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <span className="text-muted">Sessions</span>
                <div className="text-foreground font-medium mt-0.5">
                  {selectedSessions.length > 0 ? selectedSessions.join(", ") : "None"}
                </div>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <span className="text-muted">Risk</span>
                <div className="text-foreground font-medium mt-0.5">{riskPerTrade}% / trade</div>
              </div>
              <div className="bg-surface-2 rounded-lg p-3">
                <span className="text-muted">Mode</span>
                <div className="text-foreground font-medium mt-0.5">{automationMode}</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold transition-smooth hover:bg-accent-light"
              >
                Create Bot
              </button>
              <button
                onClick={resetAll}
                className="px-5 py-3 rounded-xl bg-surface-2 text-muted-light text-sm font-medium border border-border/50 transition-smooth hover:border-border-light hover:text-foreground"
              >
                Reset
              </button>
            </div>
            <p className="text-[10px] text-muted text-center">
              Bot will be created in Paper Mode for testing before live deployment
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
