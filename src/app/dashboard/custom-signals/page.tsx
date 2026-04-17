"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// All possible confluences the system can suggest
const ALL_CONFLUENCES = [
  { id: "trend_alignment", label: "Trend Alignment", desc: "Price moving in direction of higher-timeframe trend", category: "Trend", weight: 15 },
  { id: "structure_break", label: "Break of Structure (BOS)", desc: "Confirmed break of recent swing high or low", category: "Structure", weight: 12 },
  { id: "change_of_character", label: "Change of Character (CHoCH)", desc: "First sign of trend reversal in market structure", category: "Structure", weight: 10 },
  { id: "order_block", label: "Order Block Zone", desc: "Price at institutional supply or demand zone", category: "Smart Money", weight: 14 },
  { id: "fvg", label: "Fair Value Gap (FVG)", desc: "Imbalance in price creating a gap to be filled", category: "Smart Money", weight: 10 },
  { id: "liquidity_sweep", label: "Liquidity Sweep", desc: "Stop hunt above/below key level before reversal", category: "Smart Money", weight: 13 },
  { id: "engulfing", label: "Engulfing Candle", desc: "Strong reversal candle fully engulfing previous", category: "Pattern", weight: 11 },
  { id: "rejection_wick", label: "Rejection Wick", desc: "Long wick showing strong rejection at a level", category: "Pattern", weight: 8 },
  { id: "ema_alignment", label: "EMA Alignment", desc: "EMAs stacked and sloping in trade direction", category: "Indicator", weight: 9 },
  { id: "momentum_confirm", label: "Momentum Confirmation", desc: "RSI/momentum supporting directional bias", category: "Indicator", weight: 8 },
  { id: "sr_level", label: "Support/Resistance Level", desc: "Price reacting at a proven historical level", category: "Level", weight: 12 },
  { id: "round_number", label: "Round Number / Psychological Level", desc: "Price near a major round number (e.g. 1.0800)", category: "Level", weight: 5 },
  { id: "session_timing", label: "Session Timing", desc: "Trade during high-liquidity session (London/NY)", category: "Context", weight: 8 },
  { id: "volume_spike", label: "Volume Expansion", desc: "Above-average volume confirming the move", category: "Context", weight: 7 },
  { id: "htf_bias", label: "Higher Timeframe Bias", desc: "Daily/4H trend aligning with entry direction", category: "Trend", weight: 14 },
  { id: "pullback_fib", label: "Fibonacci Retracement", desc: "Pullback to 50-78.6% fib zone before continuation", category: "Level", weight: 9 },
  { id: "divergence", label: "RSI Divergence", desc: "Price makes new high/low but RSI doesn't confirm", category: "Indicator", weight: 10 },
  { id: "multi_tf_confirm", label: "Multi-Timeframe Confirmation", desc: "Setup aligns across 2+ timeframes", category: "Trend", weight: 13 },
  { id: "news_clear", label: "News Clear Zone", desc: "No high-impact news in the next 30 minutes", category: "Context", weight: 6 },
  { id: "spread_acceptable", label: "Acceptable Spread", desc: "Spread within normal range for the instrument", category: "Context", weight: 5 },
];

// Strategy keywords to detect what the user is describing
const strategyPatterns: { keywords: string[]; confluences: string[]; label: string }[] = [
  { keywords: ["breakout", "break", "breaking", "breaks through"], confluences: ["structure_break", "momentum_confirm", "volume_spike", "sr_level", "session_timing", "htf_bias"], label: "Breakout Strategy" },
  { keywords: ["pullback", "retrace", "retracement", "pull back", "dip buy"], confluences: ["trend_alignment", "pullback_fib", "ema_alignment", "sr_level", "htf_bias", "session_timing"], label: "Pullback Strategy" },
  { keywords: ["reversal", "reverse", "turn", "flip", "counter"], confluences: ["change_of_character", "liquidity_sweep", "divergence", "engulfing", "rejection_wick", "sr_level"], label: "Reversal Strategy" },
  { keywords: ["order block", "ob", "institutional", "smart money", "supply", "demand"], confluences: ["order_block", "liquidity_sweep", "fvg", "structure_break", "htf_bias", "multi_tf_confirm"], label: "Smart Money / Order Block Strategy" },
  { keywords: ["scalp", "quick", "fast", "5 min", "5m", "short term"], confluences: ["momentum_confirm", "ema_alignment", "session_timing", "spread_acceptable", "volume_spike", "trend_alignment"], label: "Scalping Strategy" },
  { keywords: ["trend", "continuation", "follow", "momentum", "riding"], confluences: ["trend_alignment", "htf_bias", "ema_alignment", "multi_tf_confirm", "momentum_confirm", "pullback_fib"], label: "Trend Continuation Strategy" },
  { keywords: ["engulfing", "candle", "candlestick", "pattern"], confluences: ["engulfing", "sr_level", "session_timing", "trend_alignment", "rejection_wick", "volume_spike"], label: "Candlestick Pattern Strategy" },
  { keywords: ["liquidity", "sweep", "stop hunt", "grab", "trap"], confluences: ["liquidity_sweep", "order_block", "structure_break", "rejection_wick", "htf_bias", "fvg"], label: "Liquidity Sweep Strategy" },
  { keywords: ["support", "resistance", "level", "bounce", "reject"], confluences: ["sr_level", "rejection_wick", "engulfing", "trend_alignment", "session_timing", "spread_acceptable"], label: "Support/Resistance Strategy" },
  { keywords: ["fvg", "fair value", "imbalance", "gap"], confluences: ["fvg", "trend_alignment", "structure_break", "order_block", "htf_bias", "momentum_confirm"], label: "Fair Value Gap Strategy" },
];

interface SavedSignal {
  name: string;
  description: string;
  detectedStrategy: string;
  interpretation: string;
  confluences: { id: string; label: string; weight: number; enabled: boolean }[];
  timeframes: string[];
  session: string;
  minScore: number;
  createdAt: string;
}

export default function CustomSignalsPage() {
  const [step, setStep] = useState<"describe" | "interpret" | "configure" | "done">("describe");
  const [strategyDescription, setStrategyDescription] = useState("");
  const [signalName, setSignalName] = useState("");
  const [detectedStrategy, setDetectedStrategy] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [suggestedConfluences, setSuggestedConfluences] = useState<typeof ALL_CONFLUENCES>([]);
  const [activeConfluences, setActiveConfluences] = useState<{ id: string; label: string; weight: number; enabled: boolean }[]>([]);
  const [timeframes, setTimeframes] = useState<string[]>(["1h"]);
  const [session, setSession] = useState("All Sessions");
  const [minScore, setMinScore] = useState(70);
  const [analyzing, setAnalyzing] = useState(false);
  const [savedSignals, setSavedSignals] = useState<SavedSignal[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("custom_signals");
    if (saved) try { setSavedSignals(JSON.parse(saved)); } catch {}
  }, []);

  function analyzeStrategy() {
    if (!strategyDescription.trim()) return;
    setAnalyzing(true);

    setTimeout(() => {
      const lower = strategyDescription.toLowerCase();

      // Find matching strategy patterns
      let bestMatch = strategyPatterns[0];
      let bestScore = 0;
      for (const pattern of strategyPatterns) {
        const score = pattern.keywords.filter((k) => lower.includes(k)).length;
        if (score > bestScore) { bestScore = score; bestMatch = pattern; }
      }

      // If no strong match, detect from common words
      if (bestScore === 0) {
        // Default to trend continuation
        bestMatch = strategyPatterns.find((p) => p.label.includes("Trend")) || strategyPatterns[0];
      }

      setDetectedStrategy(bestMatch.label);

      // Build interpretation
      const interp = `I understand you want to build a **${bestMatch.label}**.\n\n` +
        `Based on your description: "${strategyDescription.slice(0, 200)}${strategyDescription.length > 200 ? "..." : ""}"\n\n` +
        `This strategy focuses on ${bestMatch.label.toLowerCase()} setups. I've identified the key confluences that would make this strategy effective and assigned initial weights based on how important each factor is for this type of trading.\n\n` +
        `You can add, remove, or adjust the weight of any confluence below. Each signal will be scored out of 100 based on how many confluences are present and their weights.`;

      setInterpretation(interp);

      // Suggest confluences from the matched pattern + some extras
      const suggested = bestMatch.confluences
        .map((id) => ALL_CONFLUENCES.find((c) => c.id === id))
        .filter(Boolean) as typeof ALL_CONFLUENCES;

      // Add some additional relevant ones
      const extras = ALL_CONFLUENCES.filter((c) => !bestMatch.confluences.includes(c.id)).slice(0, 4);
      setSuggestedConfluences([...suggested, ...extras]);

      // Pre-configure active confluences with weights
      setActiveConfluences(
        suggested.map((c) => ({ id: c.id, label: c.label, weight: c.weight, enabled: true }))
      );

      setAnalyzing(false);
      setStep("interpret");
    }, 2000);
  }

  function confirmInterpretation() {
    setStep("configure");
  }

  function toggleConfluence(id: string) {
    const existing = activeConfluences.find((c) => c.id === id);
    if (existing) {
      setActiveConfluences(activeConfluences.map((c) => c.id === id ? { ...c, enabled: !c.enabled } : c));
    } else {
      const conf = ALL_CONFLUENCES.find((c) => c.id === id);
      if (conf) setActiveConfluences([...activeConfluences, { id: conf.id, label: conf.label, weight: conf.weight, enabled: true }]);
    }
  }

  function updateWeight(id: string, weight: number) {
    setActiveConfluences(activeConfluences.map((c) => c.id === id ? { ...c, weight } : c));
  }

  function addFromSuggested(conf: typeof ALL_CONFLUENCES[number]) {
    if (!activeConfluences.find((c) => c.id === conf.id)) {
      setActiveConfluences([...activeConfluences, { id: conf.id, label: conf.label, weight: conf.weight, enabled: true }]);
    }
  }

  // Calculate example score
  const enabledConfs = activeConfluences.filter((c) => c.enabled);
  const totalWeight = enabledConfs.reduce((sum, c) => sum + c.weight, 0);
  const normalizedMax = totalWeight > 0 ? 100 : 0;
  const exampleScore = totalWeight > 0 ? Math.round((enabledConfs.reduce((sum, c) => sum + c.weight, 0) / Math.max(totalWeight, 1)) * 100) : 0;

  function createSignal() {
    if (!signalName.trim()) { alert("Please enter a signal name"); return; }
    if (enabledConfs.length === 0) { alert("Enable at least one confluence"); return; }

    const signal: SavedSignal = {
      name: signalName, description: strategyDescription, detectedStrategy, interpretation,
      confluences: activeConfluences, timeframes, session, minScore, createdAt: new Date().toISOString(),
    };
    const updated = [...savedSignals, signal];
    setSavedSignals(updated);
    localStorage.setItem("custom_signals", JSON.stringify(updated));
    setStep("done");
  }

  function reset() {
    setStep("describe");
    setStrategyDescription("");
    setSignalName("");
    setDetectedStrategy("");
    setInterpretation("");
    setSuggestedConfluences([]);
    setActiveConfluences([]);
    setTimeframes(["1h"]);
    setSession("All Sessions");
    setMinScore(70);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Custom Signal Builder</h1>
        <p className="text-sm text-muted mt-1">Describe your strategy in plain English. The AI interprets it and builds a scored signal engine for you.</p>
      </div>

      {/* Saved signals */}
      {savedSignals.length > 0 && step === "describe" && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Your Custom Signals ({savedSignals.length})</h3>
          <div className="space-y-2">
            {savedSignals.map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-surface-2 rounded-xl p-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{s.name}</div>
                  <div className="text-xs text-muted">{s.detectedStrategy} • {s.confluences.filter((c) => c.enabled).length} confluences • Min score: {s.minScore}/100</div>
                </div>
                <span className="text-xs text-bull-light bg-bull/10 px-2 py-0.5 rounded border border-bull/20">Active</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 1: Describe your strategy */}
      {step === "describe" && (
        <div className="max-w-2xl space-y-5">
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold mb-2">Describe Your Strategy</h3>
            <p className="text-xs text-muted mb-4">Tell us how you trade in your own words. The AI will interpret your strategy and suggest the right confluences.</p>
            <textarea
              value={strategyDescription}
              onChange={(e) => setStrategyDescription(e.target.value)}
              placeholder="Example: I trade pullbacks in trending markets. I wait for price to pull back to a demand zone on the 1H chart, then look for a bullish engulfing candle with EMA alignment. I only trade during London and New York sessions. My higher timeframe bias comes from the 4H chart..."
              rows={6}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder-muted resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted">{strategyDescription.length} characters</span>
              <button onClick={analyzeStrategy} disabled={!strategyDescription.trim() || analyzing}
                className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent disabled:opacity-40 hover:bg-accent-light">
                {analyzing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing...
                  </span>
                ) : "Analyze My Strategy"}
              </button>
            </div>
          </div>

          <div className="glass-card p-5">
            <h4 className="text-sm font-semibold mb-2">Tips for better results</h4>
            <div className="space-y-1.5 text-xs text-muted">
              <p>• Describe your entry trigger — what makes you take a trade?</p>
              <p>• Mention the timeframes you use</p>
              <p>• Describe any confirmations you look for</p>
              <p>• Mention your preferred sessions (London, New York, etc.)</p>
              <p>• Include any smart money concepts you use (order blocks, liquidity sweeps, etc.)</p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: AI Interpretation */}
      {step === "interpret" && (
        <div className="max-w-2xl space-y-5">
          <div className="glass-card p-6 border-l-4 border-l-accent">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold">AI</div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Strategy Interpretation</h3>
                <span className="text-xs text-accent-light">{detectedStrategy}</span>
              </div>
            </div>
            <div className="text-sm text-muted-light leading-relaxed whitespace-pre-wrap">
              {interpretation.split("**").map((part, i) => i % 2 === 1 ? <strong key={i} className="text-foreground">{part}</strong> : <span key={i}>{part}</span>)}
            </div>
          </div>

          <div className="glass-card p-6">
            <h4 className="text-sm font-semibold mb-3">Suggested Confluences ({suggestedConfluences.length})</h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {suggestedConfluences.map((conf) => {
                const isActive = activeConfluences.some((c) => c.id === conf.id && c.enabled);
                return (
                  <div key={conf.id} className={cn("p-3 rounded-xl border transition-smooth", isActive ? "bg-accent/10 border-accent/30" : "bg-surface-2 border-border/50")}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground">{conf.label}</span>
                      <span className="text-[10px] text-muted bg-surface-3 px-1.5 py-0.5 rounded">{conf.category}</span>
                    </div>
                    <p className="text-[10px] text-muted mb-2">{conf.desc}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-accent-light">Weight: {conf.weight}</span>
                      {isActive ? <span className="text-[10px] text-bull-light">✓ Included</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setStep("describe")} className="px-6 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">← Change description</button>
            <button onClick={confirmInterpretation} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent">
              Yes, this looks right — Configure →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Configure & Fine-tune */}
      {step === "configure" && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="glass-card p-5">
              <label className="text-xs text-muted-light mb-1.5 block">Signal Engine Name</label>
              <input type="text" value={signalName} onChange={(e) => setSignalName(e.target.value)} placeholder="e.g. Vic's Pullback Scanner"
                className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
            </div>

            {/* Active confluences with weights */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3">Confluences & Weights</h3>
              <p className="text-xs text-muted mb-4">Each confluence contributes to the final score out of 100. Adjust weights to match your priorities.</p>
              <div className="space-y-3">
                {activeConfluences.map((conf) => (
                  <div key={conf.id} className={cn("rounded-xl p-3 transition-smooth", conf.enabled ? "bg-surface-2" : "bg-surface-2/50 opacity-50")}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleConfluence(conf.id)}
                          className={cn("w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold border transition-smooth",
                            conf.enabled ? "bg-accent border-accent text-white" : "border-border text-muted")}>
                          {conf.enabled ? "✓" : ""}
                        </button>
                        <span className="text-xs font-medium text-foreground">{conf.label}</span>
                      </div>
                      <span className="text-xs font-mono text-accent-light">{conf.weight} pts</span>
                    </div>
                    {conf.enabled && (
                      <div className="flex items-center gap-3 pl-8">
                        <input type="range" min={1} max={20} value={conf.weight} onChange={(e) => updateWeight(conf.id, parseInt(e.target.value))}
                          className="flex-1 h-1.5 bg-surface-3 rounded-full appearance-none cursor-pointer accent-accent" />
                        <input type="number" min={1} max={20} value={conf.weight} onChange={(e) => updateWeight(conf.id, Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="w-12 bg-surface-3 text-foreground text-xs rounded border border-border/50 px-2 py-1 text-center font-mono" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Add more confluences */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3">Add More Confluences</h3>
              <div className="flex flex-wrap gap-1.5">
                {ALL_CONFLUENCES.filter((c) => !activeConfluences.find((a) => a.id === c.id)).map((conf) => (
                  <button key={conf.id} onClick={() => addFromSuggested(conf)}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-surface-2 text-muted-light border border-border/50 hover:border-accent hover:text-accent-light transition-smooth">
                    + {conf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeframe + Session + Min Score */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="glass-card p-5">
                <h4 className="text-xs text-muted-light mb-2">Timeframes</h4>
                <div className="flex flex-wrap gap-1.5">
                  {["5m", "15m", "1h", "4h", "1d"].map((tf) => (
                    <button key={tf} onClick={() => setTimeframes(timeframes.includes(tf) ? timeframes.filter((t) => t !== tf) : [...timeframes, tf])}
                      className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth", timeframes.includes(tf) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{tf}</button>
                  ))}
                </div>
              </div>
              <div className="glass-card p-5">
                <h4 className="text-xs text-muted-light mb-2">Session</h4>
                <select value={session} onChange={(e) => setSession(e.target.value)} className="w-full bg-surface-2 text-foreground text-xs rounded-lg border border-border/50 px-3 py-2">
                  {["All Sessions", "London", "New York", "Asia", "London/NY Overlap"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="glass-card p-5">
                <h4 className="text-xs text-muted-light mb-2">Min Score (/100)</h4>
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={100} value={minScore} onChange={(e) => setMinScore(parseInt(e.target.value))} className="flex-1 accent-accent" />
                  <span className="text-sm font-bold font-mono text-accent-light w-10 text-center">{minScore}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("interpret")} className="px-6 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">← Back</button>
              <button onClick={createSignal} disabled={!signalName.trim() || enabledConfs.length === 0}
                className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-bold transition-smooth glow-accent disabled:opacity-40">
                Create Signal Engine
              </button>
            </div>
          </div>

          {/* Right: Live scoring preview */}
          <div className="space-y-4">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3">Scoring Preview</h3>
              <div className="text-center mb-4">
                <div className={cn("text-4xl font-black", exampleScore >= 80 ? "text-bull-light" : exampleScore >= 60 ? "text-accent-light" : "text-warn")}>{exampleScore}</div>
                <div className="text-xs text-muted">/100 when all confluences hit</div>
              </div>
              <div className="space-y-2">
                {enabledConfs.map((c) => {
                  const pct = totalWeight > 0 ? Math.round((c.weight / totalWeight) * 100) : 0;
                  return (
                    <div key={c.id} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-light w-28 truncate">{c.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-muted w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-card p-5">
              <h4 className="text-xs font-semibold mb-2">How Scoring Works</h4>
              <p className="text-[10px] text-muted leading-relaxed">
                Each signal scans for your selected confluences. If a confluence is present, its weight contributes to the total score. The final score is normalized to /100. Only signals scoring above your minimum threshold ({minScore}) will be shown.
              </p>
              <div className="mt-3 space-y-1 text-[10px]">
                <div className="flex justify-between"><span className="text-muted">80-100:</span><span className="text-bull-light font-medium">A+ Elite Setup</span></div>
                <div className="flex justify-between"><span className="text-muted">65-79:</span><span className="text-accent-light font-medium">A Strong Setup</span></div>
                <div className="flex justify-between"><span className="text-muted">50-64:</span><span className="text-warn font-medium">B Moderate</span></div>
                <div className="flex justify-between"><span className="text-muted">Below 50:</span><span className="text-muted-light">Filtered out</span></div>
              </div>
            </div>

            <div className="glass-card p-5">
              <h4 className="text-xs font-semibold mb-2">Config Summary</h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted">Strategy</span><span className="text-foreground">{detectedStrategy}</span></div>
                <div className="flex justify-between"><span className="text-muted">Confluences</span><span className="text-foreground">{enabledConfs.length} active</span></div>
                <div className="flex justify-between"><span className="text-muted">Timeframes</span><span className="text-foreground">{timeframes.join(", ")}</span></div>
                <div className="flex justify-between"><span className="text-muted">Session</span><span className="text-foreground">{session}</span></div>
                <div className="flex justify-between"><span className="text-muted">Min Score</span><span className="text-accent-light">{minScore}/100</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Done */}
      {step === "done" && (
        <div className="max-w-lg mx-auto text-center space-y-6">
          <div className="glass-card p-8">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-foreground mb-2">Signal Engine Created!</h3>
            <p className="text-sm text-muted mb-4">Your custom signal &ldquo;<strong className="text-foreground">{signalName}</strong>&rdquo; is now active in your profile.</p>
            <div className="bg-surface-2 rounded-xl p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted">Strategy</span><span className="text-foreground">{detectedStrategy}</span></div>
              <div className="flex justify-between"><span className="text-muted">Confluences</span><span className="text-foreground">{enabledConfs.length}</span></div>
              <div className="flex justify-between"><span className="text-muted">Min Score</span><span className="text-accent-light">{minScore}/100</span></div>
              <div className="flex justify-between"><span className="text-muted">Scoring</span><span className="text-bull-light">Active — scanning markets</span></div>
            </div>
          </div>
          <button onClick={reset} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium transition-smooth">Build Another Signal</button>
        </div>
      )}
    </div>
  );
}
