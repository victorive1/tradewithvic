"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface FlowData {
  asset: string;
  category: string;
  changePct: number;
  flowDirection: "inflow" | "outflow" | "neutral";
  flowStrength: number;
}

interface AssetClassFlow {
  name: string;
  instruments: FlowData[];
  netFlow: number;
  direction: "inflow" | "outflow" | "neutral";
  confidence: number;
}

type RiskRegime = "risk_on" | "risk_off" | "mixed";

function getCurrentSession(): string {
  const h = new Date().getUTCHours();
  if (h >= 7 && h < 12) return "London";
  if (h >= 12 && h < 16) return "London/NY Overlap";
  if (h >= 16 && h < 21) return "New York";
  return "Off-hours";
}

function inferRiskRegime(classes: AssetClassFlow[]): { regime: RiskRegime; confidence: number; explanation: string } {
  const indices = classes.find((c) => c.name === "Indices");
  const metals = classes.find((c) => c.name === "Metals");
  const crypto = classes.find((c) => c.name === "Crypto");
  const forex = classes.find((c) => c.name === "Forex (USD)");

  let riskOnScore = 0;
  let riskOffScore = 0;

  if (indices && indices.netFlow > 0) riskOnScore += 2;
  if (indices && indices.netFlow < 0) riskOffScore += 2;
  if (crypto && crypto.netFlow > 0) riskOnScore += 1.5;
  if (crypto && crypto.netFlow < 0) riskOffScore += 1;
  if (metals && metals.netFlow > 0) riskOffScore += 1.5; // Gold up = risk off typically
  if (metals && metals.netFlow < 0) riskOnScore += 1;
  if (forex && forex.netFlow > 0) riskOffScore += 1; // USD strength = risk off
  if (forex && forex.netFlow < 0) riskOnScore += 1;

  const total = riskOnScore + riskOffScore;
  const confidence = total > 0 ? Math.min(90, Math.round((Math.abs(riskOnScore - riskOffScore) / total) * 100 + 30)) : 30;

  if (riskOnScore > riskOffScore + 1) {
    return { regime: "risk_on", confidence, explanation: `Risk-on environment detected. ${indices?.netFlow && indices.netFlow > 0 ? "Equity indices showing strength. " : ""}${crypto?.netFlow && crypto.netFlow > 0 ? "Crypto gaining. " : ""}${metals?.netFlow && metals.netFlow < 0 ? "Safe havens weakening. " : ""}Capital appears to be flowing into growth assets.` };
  }
  if (riskOffScore > riskOnScore + 1) {
    return { regime: "risk_off", confidence, explanation: `Risk-off environment detected. ${metals?.netFlow && metals.netFlow > 0 ? "Gold and safe havens strengthening. " : ""}${indices?.netFlow && indices.netFlow < 0 ? "Equity indices under pressure. " : ""}${forex?.netFlow && forex.netFlow > 0 ? "USD gaining as a safe haven. " : ""}Capital appears to be rotating into defensive assets.` };
  }
  return { regime: "mixed", confidence: Math.min(50, confidence), explanation: "Mixed signals across asset classes. No clear risk-on or risk-off conviction. Cross-market relationships are conflicting — lower confidence in directional flow reads." };
}

export default function CapitalFlowPage() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/market/quotes");
        const data = await res.json();
        if (data.quotes) setQuotes(data.quotes);
      } catch {}
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  // Build flow data from live quotes
  const flowData: FlowData[] = quotes.map((q: any) => ({
    asset: q.displayName,
    category: q.category,
    changePct: q.changePercent,
    flowDirection: q.changePercent > 0.05 ? "inflow" : q.changePercent < -0.05 ? "outflow" : "neutral",
    flowStrength: Math.min(100, Math.round(Math.abs(q.changePercent) * 50)),
  }));

  // Group by asset class
  const usdPairs = flowData.filter((f) => f.category === "forex");
  const metals = flowData.filter((f) => f.category === "metals");
  const indices = flowData.filter((f) => f.category === "indices");
  const crypto = flowData.filter((f) => f.category === "crypto");
  const energy = flowData.filter((f) => f.category === "energy");

  function classFlow(name: string, items: FlowData[]): AssetClassFlow {
    if (items.length === 0) return { name, instruments: [], netFlow: 0, direction: "neutral", confidence: 0 };
    const avg = items.reduce((s, i) => s + i.changePct, 0) / items.length;
    const direction = avg > 0.05 ? "inflow" : avg < -0.05 ? "outflow" : "neutral";
    const agreement = items.filter((i) => i.flowDirection === direction).length / items.length;
    return { name, instruments: items, netFlow: avg, direction, confidence: Math.round(agreement * 100) };
  }

  const assetClasses: AssetClassFlow[] = [
    classFlow("Forex (USD)", usdPairs),
    classFlow("Metals", metals),
    classFlow("Indices", indices),
    classFlow("Crypto", crypto),
    classFlow("Energy", energy),
  ].filter((c) => c.instruments.length > 0);

  const risk = inferRiskRegime(assetClasses);
  const session = getCurrentSession();

  // Cross-market alignment
  const alignedPairs: { pair: string; flowAligns: boolean; direction: string; confidence: number }[] = [];
  for (const q of quotes) {
    const classMatch = assetClasses.find((c) => c.instruments.some((i) => i.asset === q.displayName));
    if (!classMatch) continue;
    const flowAligns = (q.changePercent > 0 && classMatch.direction === "inflow") || (q.changePercent < 0 && classMatch.direction === "outflow");
    alignedPairs.push({
      pair: q.displayName,
      flowAligns,
      direction: q.changePercent > 0 ? "bullish" : "bearish",
      confidence: flowAligns ? Math.min(90, classMatch.confidence + 15) : Math.max(20, classMatch.confidence - 20),
    });
  }
  const aligned = alignedPairs.filter((p) => p.flowAligns);

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Capital Flow Engine</h1><p className="text-sm text-muted mt-1">Scanning cross-market flows...</p></div>
        <div className="grid sm:grid-cols-3 gap-4">{[1,2,3].map((i) => <div key={i} className="glass-card p-6 animate-pulse"><div className="h-20 bg-surface-3 rounded" /></div>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Capital Flow Engine</h1>
        <p className="text-sm text-muted mt-1">Inferred capital flow intelligence across currencies, metals, indices, and crypto — where is money moving?</p>
      </div>

      {/* Risk Regime */}
      <div className={cn("glass-card p-6 border-l-4", risk.regime === "risk_on" ? "border-l-bull" : risk.regime === "risk_off" ? "border-l-bear" : "border-l-warn")}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn("text-2xl font-black", risk.regime === "risk_on" ? "text-bull-light" : risk.regime === "risk_off" ? "text-bear-light" : "text-warn")}>
              {risk.regime === "risk_on" ? "RISK ON" : risk.regime === "risk_off" ? "RISK OFF" : "MIXED"}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className={cn("h-full rounded-full", risk.confidence >= 60 ? "bg-bull" : risk.confidence >= 40 ? "bg-warn" : "bg-muted")} style={{ width: `${risk.confidence}%` }} />
              </div>
              <span className="text-xs font-mono text-muted">{risk.confidence}%</span>
            </div>
          </div>
          <div className="text-right text-xs text-muted">
            <div>{session}</div>
            <div className="flex items-center gap-1 justify-end"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Live</div>
          </div>
        </div>
        <p className="text-sm text-muted-light leading-relaxed">{risk.explanation}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{quotes.length}</div><div className="text-[10px] text-muted">Instruments</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bull-light">{flowData.filter((f) => f.flowDirection === "inflow").length}</div><div className="text-[10px] text-muted">Inflow</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bear-light">{flowData.filter((f) => f.flowDirection === "outflow").length}</div><div className="text-[10px] text-muted">Outflow</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-accent-light">{aligned.length}/{alignedPairs.length}</div><div className="text-[10px] text-muted">Flow Aligned</div></div>
      </div>

      {/* Asset Class Flow Cards */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Flow by Asset Class</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assetClasses.map((ac) => (
            <div key={ac.name} className={cn("glass-card p-5 border-l-4", ac.direction === "inflow" ? "border-l-bull" : ac.direction === "outflow" ? "border-l-bear" : "border-l-border")}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-foreground">{ac.name}</h4>
                <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full capitalize",
                  ac.direction === "inflow" ? "badge-bull" : ac.direction === "outflow" ? "badge-bear" : "badge-neutral")}>{ac.direction}</span>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-muted">Net Flow:</span>
                <span className={cn("text-sm font-bold font-mono", ac.netFlow >= 0 ? "text-bull-light" : "text-bear-light")}>{ac.netFlow >= 0 ? "+" : ""}{ac.netFlow.toFixed(2)}%</span>
                <span className="text-xs text-muted">Conf: <span className="text-foreground">{ac.confidence}%</span></span>
              </div>
              <div className="space-y-1.5">
                {ac.instruments.map((inst) => (
                  <div key={inst.asset} className="flex items-center justify-between">
                    <span className="text-xs text-muted-light">{inst.asset}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <div className={cn("h-full rounded-full", inst.flowDirection === "inflow" ? "bg-bull" : inst.flowDirection === "outflow" ? "bg-bear" : "bg-muted")}
                          style={{ width: `${inst.flowStrength}%` }} />
                      </div>
                      <span className={cn("text-[10px] font-mono", inst.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>
                        {inst.changePct >= 0 ? "+" : ""}{inst.changePct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cross-Market Alignment */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Cross-Market Flow Alignment</h3>
        <p className="text-xs text-muted mb-4">Instruments where individual movement aligns with their asset class flow direction — higher confidence in these setups</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {alignedPairs.sort((a, b) => b.confidence - a.confidence).map((p) => (
            <div key={p.pair} className={cn("bg-surface-2 rounded-xl px-3 py-2.5 flex items-center justify-between border", p.flowAligns ? "border-bull/20" : "border-border/30")}>
              <div className="flex items-center gap-2">
                {p.flowAligns ? (
                  <span className="text-bull-light text-[10px]">✓</span>
                ) : (
                  <span className="text-warn text-[10px]">⚠</span>
                )}
                <span className="text-xs font-medium text-foreground">{p.pair}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] capitalize", p.direction === "bullish" ? "text-bull-light" : "text-bear-light")}>{p.direction}</span>
                <span className="text-[10px] font-mono text-muted">{p.confidence}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rotation Insights */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Flow Rotation Insights</h3>
        <div className="space-y-3">
          {assetClasses.filter((c) => c.direction !== "neutral").map((ac) => (
            <div key={ac.name} className="flex items-start gap-3">
              <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", ac.direction === "inflow" ? "bg-bull" : "bg-bear")} />
              <div className="text-xs text-muted-light">
                <strong className="text-foreground">{ac.name}</strong>:{" "}
                {ac.direction === "inflow"
                  ? `Capital flowing in — ${ac.instruments.filter((i) => i.flowDirection === "inflow").length}/${ac.instruments.length} instruments rising. Average move: +${ac.netFlow.toFixed(2)}%. ${ac.confidence >= 70 ? "Strong agreement across instruments." : "Some divergence within the group."}`
                  : `Capital flowing out — ${ac.instruments.filter((i) => i.flowDirection === "outflow").length}/${ac.instruments.length} instruments declining. Average move: ${ac.netFlow.toFixed(2)}%. ${ac.confidence >= 70 ? "Broad-based selling pressure." : "Mixed signals within the group."}`
                }
              </div>
            </div>
          ))}
          {assetClasses.every((c) => c.direction === "neutral") && (
            <p className="text-xs text-muted">No significant capital rotation detected. Markets are relatively balanced across asset classes.</p>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How the Capital Flow Engine Works</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Inferred Flow Intelligence</p>
            <p>Capital flow is inferred from relative cross-market movement — not claimed as direct institutional visibility. When multiple instruments in an asset class move together, it suggests coordinated capital flow in that direction.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Risk-On / Risk-Off Detection</p>
            <p>The engine combines equity index strength, safe-haven behavior (gold, USD), and risk asset momentum (crypto) to classify the current environment. Mixed signals reduce confidence instead of forcing a narrative.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Cross-Market Alignment</p>
            <p>Individual instruments are checked against their asset class flow. Setups where the instrument&apos;s direction matches the broader flow get higher confidence. Conflicting instruments get flagged.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Integration</p>
            <p>Signal engines use capital flow as a context filter. Bots reduce position size when local direction conflicts with broad flow. Editor&apos;s Pick favors setups aligned with capital rotation.</p>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted text-center">
        Capital flow readings are inferred from relative market movement and should be used as context, not as standalone trade signals.
      </div>
    </div>
  );
}
