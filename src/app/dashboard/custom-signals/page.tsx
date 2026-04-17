"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const CONFLUENCES = [
  { id: "trend", label: "Trend Alignment" },
  { id: "structure", label: "Structure Break" },
  { id: "orderblock", label: "Order Block" },
  { id: "fvg", label: "FVG (Fair Value Gap)" },
  { id: "engulfing", label: "Engulfing" },
  { id: "liquidity", label: "Liquidity Sweep" },
  { id: "sr", label: "Support/Resistance" },
  { id: "momentum", label: "Momentum" },
] as const;

const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"] as const;
const SESSIONS = ["All Sessions", "London", "New York", "Asian", "London/NY Overlap"] as const;

interface SignalConfig {
  name: string;
  confluences: Record<string, boolean>;
  weights: Record<string, number>;
  timeframes: Record<string, boolean>;
  session: string;
  minScore: number;
}

export default function CustomSignalsPage() {
  const [config, setConfig] = useState<SignalConfig>({
    name: "",
    confluences: Object.fromEntries(CONFLUENCES.map((c) => [c.id, false])),
    weights: Object.fromEntries(CONFLUENCES.map((c) => [c.id, 50])),
    timeframes: Object.fromEntries(TIMEFRAMES.map((tf) => [tf, false])),
    session: "All Sessions",
    minScore: 70,
  });

  const [created, setCreated] = useState(false);

  const toggleConfluence = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      confluences: { ...prev.confluences, [id]: !prev.confluences[id] },
    }));
  };

  const setWeight = (id: string, value: number) => {
    setConfig((prev) => ({
      ...prev,
      weights: { ...prev.weights, [id]: value },
    }));
  };

  const toggleTimeframe = (tf: string) => {
    setConfig((prev) => ({
      ...prev,
      timeframes: { ...prev.timeframes, [tf]: !prev.timeframes[tf] },
    }));
  };

  const handleCreate = () => {
    setCreated(true);
    setTimeout(() => setCreated(false), 3000);
  };

  const activeConfluences = CONFLUENCES.filter((c) => config.confluences[c.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Custom Signal Builder</h1>
        <p className="text-sm text-muted mt-1">
          No-code signal design interface -- build your own confluence-based scoring engine
        </p>
      </div>

      {/* Builder Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Name */}
          <div className="glass-card p-5">
            <label className="text-sm font-semibold text-foreground block mb-2">Signal Name</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. London Breakout Scanner"
              className="w-full bg-surface-2 text-foreground text-sm rounded-lg border border-border/50 px-4 py-2.5 focus:outline-none focus:border-accent placeholder:text-muted"
            />
          </div>

          {/* Confluences */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Select Confluences</h3>
            <p className="text-xs text-muted mb-4">Choose which factors your signal engine evaluates</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {CONFLUENCES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleConfluence(c.id)}
                  className={cn(
                    "px-3 py-2.5 rounded-lg text-xs font-medium transition-smooth border text-left",
                    config.confluences[c.id]
                      ? "bg-accent/10 text-accent-light border-accent/50"
                      : "bg-surface-2 text-muted-light border-border/50 hover:border-border-light"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Weights */}
          {activeConfluences.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Scoring Weights</h3>
              <p className="text-xs text-muted mb-4">Adjust how much each confluence contributes to the final score (0-100)</p>
              <div className="space-y-4">
                {activeConfluences.map((c) => (
                  <div key={c.id} className="flex items-center gap-4">
                    <span className="text-xs text-muted-light w-36 shrink-0">{c.label}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={config.weights[c.id]}
                      onChange={(e) => setWeight(c.id, parseInt(e.target.value))}
                      className="flex-1 h-1.5 bg-surface-3 rounded-full appearance-none cursor-pointer accent-accent"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={config.weights[c.id]}
                      onChange={(e) => setWeight(c.id, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-14 bg-surface-2 text-foreground text-xs rounded border border-border/50 px-2 py-1.5 text-center font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeframe */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Timeframe Selection</h3>
            <div className="flex flex-wrap gap-2">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => toggleTimeframe(tf)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-medium transition-smooth border",
                    config.timeframes[tf]
                      ? "bg-accent/10 text-accent-light border-accent/50"
                      : "bg-surface-2 text-muted-light border-border/50 hover:border-border-light"
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Session + Threshold */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Session Filter</h3>
              <select
                value={config.session}
                onChange={(e) => setConfig((prev) => ({ ...prev, session: e.target.value }))}
                className="w-full bg-surface-2 text-foreground text-sm rounded-lg border border-border/50 px-3 py-2 focus:outline-none focus:border-accent"
              >
                {SESSIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Minimum Score Threshold</h3>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.minScore}
                  onChange={(e) => setConfig((prev) => ({ ...prev, minScore: parseInt(e.target.value) }))}
                  className="flex-1 h-1.5 bg-surface-3 rounded-full appearance-none cursor-pointer accent-accent"
                />
                <span className="text-sm font-bold font-mono text-accent-light w-10 text-center">{config.minScore}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Signal Preview</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Name</span>
                <span className="text-xs text-foreground font-medium">{config.name || "Untitled Signal"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Confluences</span>
                <span className="text-xs text-accent-light font-mono">{activeConfluences.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Timeframes</span>
                <span className="text-xs text-foreground">
                  {TIMEFRAMES.filter((tf) => config.timeframes[tf]).join(", ") || "None"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Session</span>
                <span className="text-xs text-foreground">{config.session}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Min Score</span>
                <span className="text-xs text-accent-light font-mono">{config.minScore}%</span>
              </div>
            </div>

            {activeConfluences.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="text-xs text-muted mb-2">Weight Distribution</div>
                <div className="space-y-2">
                  {activeConfluences.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-light w-24 truncate">{c.label}</span>
                      <div className="flex-1 h-1 rounded-full bg-surface-3 overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${config.weights[c.id]}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-muted-light w-6 text-right">{config.weights[c.id]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleCreate}
            disabled={!config.name || activeConfluences.length === 0}
            className={cn(
              "w-full py-3 rounded-lg text-sm font-semibold transition-smooth",
              config.name && activeConfluences.length > 0
                ? "bg-accent text-white hover:bg-accent/90"
                : "bg-surface-3 text-muted cursor-not-allowed"
            )}
          >
            {created ? "Signal Engine Created" : "Create Signal Engine"}
          </button>

          <p className="text-xs text-muted text-center">
            Your custom signals will appear in your profile
          </p>
        </div>
      </div>
    </div>
  );
}
