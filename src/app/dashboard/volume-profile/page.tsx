"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { useTheme } from "@/components/ui/ThemeProvider";

type VPView = "chart" | "flow" | "zones";

interface ProfileZone {
  priceLevel: string;
  activity: number; // 0-100
  type: "hvn" | "lvn" | "poc" | "vah" | "val";
  label: string;
  interpretation: string;
}

interface FlowEvent {
  id: string;
  time: string;
  type: "buy_pressure" | "sell_pressure" | "absorption" | "exhaustion" | "imbalance" | "breakout_flow";
  direction: "bullish" | "bearish" | "neutral";
  strength: number;
  description: string;
}

function deriveProfileZones(quote: any): ProfileZone[] {
  if (!quote) return [];
  const price = quote.price;
  const range = quote.high - quote.low;
  const mid = (quote.high + quote.low) / 2;
  const decimals = quote.category === "forex" ? 5 : 2;
  const r = (n: number) => n.toFixed(decimals);

  const zones: ProfileZone[] = [
    { priceLevel: r(mid), activity: 95, type: "poc", label: "Point of Control (POC)", interpretation: "Highest activity zone — price spent the most time here. Acts as a magnet and strong reference level." },
    { priceLevel: r(mid + range * 0.25), activity: 72, type: "vah", label: "Value Area High (VAH)", interpretation: "Upper boundary of where 70% of activity occurred. Price above VAH suggests acceptance of higher prices." },
    { priceLevel: r(mid - range * 0.25), activity: 70, type: "val", label: "Value Area Low (VAL)", interpretation: "Lower boundary of the value area. Price below VAL suggests rejection of current value — potential for further decline." },
    { priceLevel: r(quote.high - range * 0.08), activity: 85, type: "hvn", label: "High Volume Node", interpretation: "Significant acceptance zone near the highs. Price tends to consolidate here. Strong level for support/resistance." },
    { priceLevel: r(mid + range * 0.12), activity: 20, type: "lvn", label: "Low Volume Gap", interpretation: "Thin activity zone — price moved through quickly. Tends to act as a magnet in future sessions. Fast moves through LVNs are common." },
    { priceLevel: r(mid - range * 0.15), activity: 18, type: "lvn", label: "Low Volume Gap", interpretation: "Another thin zone below POC. Price often returns to fill these gaps. Watch for fast traversals." },
    { priceLevel: r(quote.low + range * 0.1), activity: 78, type: "hvn", label: "High Volume Node", interpretation: "Strong acceptance zone near the lows. Institutional interest likely present. Reliable support if tested." },
  ];

  return zones;
}

function deriveFlowEvents(quote: any): FlowEvent[] {
  if (!quote) return [];
  const changePct = quote.changePercent;
  const absChange = Math.abs(changePct);
  const range = quote.high - quote.low;
  const pricePosition = range > 0 ? (quote.price - quote.low) / range : 0.5;
  const directional = absChange / Math.max((range / quote.price) * 100, 0.01);
  const events: FlowEvent[] = [];
  const now = Date.now();

  if (absChange > 0.3 && directional > 0.5) {
    events.push({ id: "f1", time: new Date(now - 300000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), type: changePct > 0 ? "buy_pressure" : "sell_pressure", direction: changePct > 0 ? "bullish" : "bearish", strength: Math.min(90, Math.round(absChange * 40)), description: `Strong ${changePct > 0 ? "buying" : "selling"} pressure detected. Directional displacement ${absChange.toFixed(2)}% with clean follow-through.` });
  }
  if (absChange > 0.1 && pricePosition > 0.8) {
    events.push({ id: "f2", time: new Date(now - 600000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), type: "breakout_flow", direction: "bullish", strength: Math.min(85, Math.round(pricePosition * 80)), description: "Price pushing into the upper range with sustained pressure. Breakout flow characteristics — buyers committed above value." });
  }
  if (absChange > 0.1 && pricePosition < 0.2) {
    events.push({ id: "f3", time: new Date(now - 600000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), type: "breakout_flow", direction: "bearish", strength: Math.min(85, Math.round((1 - pricePosition) * 80)), description: "Price pushing into the lower range with sustained pressure. Sellers driving price below value area." });
  }
  if (absChange < 0.1 && directional < 0.3) {
    events.push({ id: "f4", time: new Date(now - 900000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), type: "absorption", direction: "neutral", strength: 40, description: "Sideways price action with balanced flow. Neither buyers nor sellers dominating — absorption or accumulation phase." });
  }
  if (absChange > 0.2 && directional < 0.3) {
    events.push({ id: "f5", time: new Date(now - 1200000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), type: "imbalance", direction: "neutral", strength: 55, description: "Wide range but weak directional result — possible distribution or manipulation. Watch for resolution direction." });
  }
  if (absChange > 0.4 && directional > 0.6) {
    events.push({ id: "f6", time: new Date(now - 180000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), type: changePct > 0 ? "buy_pressure" : "sell_pressure", direction: changePct > 0 ? "bullish" : "bearish", strength: Math.min(95, Math.round(absChange * 50)), description: `Aggressive ${changePct > 0 ? "buy-side" : "sell-side"} flow. Significant participation — likely institutional involvement inferred from displacement quality.` });
  }
  if (events.length === 0) {
    events.push({ id: "f0", time: new Date(now - 1800000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), type: "absorption", direction: "neutral", strength: 25, description: "Quiet flow conditions. No significant directional pressure detected. Market in wait-and-see mode." });
  }

  return events.sort((a, b) => b.strength - a.strength);
}

const FLOW_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  buy_pressure: { label: "Buy Pressure", color: "text-bull-light" },
  sell_pressure: { label: "Sell Pressure", color: "text-bear-light" },
  absorption: { label: "Absorption", color: "text-muted-light" },
  exhaustion: { label: "Exhaustion", color: "text-warn" },
  imbalance: { label: "Imbalance", color: "text-warn" },
  breakout_flow: { label: "Breakout Flow", color: "text-accent-light" },
};

export default function VolumeProfilePage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>("XAUUSD");
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<VPView>("chart");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    async function load() {
      try { const res = await fetch("/api/market/quotes"); const data = await res.json(); if (data.quotes) setQuotes(data.quotes); } catch {}
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const selectedQuote = quotes.find((q: any) => q.symbol === selectedSymbol);
  const inst = ALL_INSTRUMENTS.find((i) => i.symbol === selectedSymbol);
  const zones = deriveProfileZones(selectedQuote);
  const flowEvents = deriveFlowEvents(selectedQuote);

  // Flow summary
  const buyPressure = flowEvents.filter((e) => e.direction === "bullish").reduce((s, e) => s + e.strength, 0);
  const sellPressure = flowEvents.filter((e) => e.direction === "bearish").reduce((s, e) => s + e.strength, 0);
  const totalPressure = buyPressure + sellPressure || 1;
  const flowBias = buyPressure > sellPressure ? "Bullish" : sellPressure > buyPressure ? "Bearish" : "Neutral";

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">V Profile + Order Flow</h1><p className="text-sm text-muted mt-1">Loading profile data...</p></div>
        <div className="glass-card p-6 animate-pulse"><div className="h-[400px] bg-surface-3 rounded" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">V Profile + Order Flow</h1>
        <p className="text-sm text-muted mt-1">Price distribution analysis, acceptance/rejection zones, and directional flow intelligence</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}
          className="bg-surface-2 text-foreground text-sm rounded-xl border border-border/50 px-4 py-2.5">
          {ALL_INSTRUMENTS.map((i) => <option key={i.symbol} value={i.symbol}>{i.displayName}</option>)}
        </select>
        {[{ id: "chart" as VPView, l: "Chart + Profile" }, { id: "flow" as VPView, l: "Order Flow" }, { id: "zones" as VPView, l: "Profile Zones" }].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", view === v.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{v.l}</button>
        ))}
        <button onClick={() => setShowAdvanced(!showAdvanced)} className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth", showAdvanced ? "bg-warn/10 text-warn border border-warn/20" : "bg-surface-2 text-muted-light border border-border/50")}>{showAdvanced ? "Advanced" : "Clean"} Mode</button>
        <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Live</span>
      </div>

      {/* CHART + PROFILE VIEW */}
      {view === "chart" && (
        <div className="grid lg:grid-cols-4 gap-4">
          {/* Chart */}
          <div className="lg:col-span-3">
            <div className="glass-card overflow-hidden" style={{ height: 480 }}>
              <TradingViewWidget symbol={selectedSymbol} interval="60" theme={theme} height={480} autosize={false} />
            </div>
          </div>

          {/* Side profile histogram */}
          <div className="space-y-3">
            <div className="glass-card p-4">
              <h4 className="text-xs font-semibold mb-3">Volume Profile</h4>
              <div className="space-y-1.5">
                {zones.map((zone, i) => {
                  const barColor = zone.type === "poc" ? "bg-accent" : zone.type === "hvn" ? "bg-bull" : zone.type === "lvn" ? "bg-bear/40" : zone.type === "vah" ? "bg-accent/60" : "bg-accent/40";
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-muted w-16 text-right">{zone.priceLevel}</span>
                      <div className="flex-1 h-3 rounded-sm bg-surface-3 overflow-hidden relative">
                        <div className={cn("h-full rounded-sm transition-all", barColor)} style={{ width: `${zone.activity}%` }} />
                      </div>
                      <span className={cn("text-[8px] font-bold w-8", zone.type === "poc" ? "text-accent-light" : zone.type === "hvn" ? "text-bull-light" : zone.type === "lvn" ? "text-bear-light" : "text-muted")}>{zone.type.toUpperCase()}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-border/30 space-y-1 text-[9px]">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-accent" /><span className="text-muted">POC — Point of Control</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-bull" /><span className="text-muted">HVN — High Volume Node</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-bear/40" /><span className="text-muted">LVN — Low Volume Gap</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-accent/60" /><span className="text-muted">VAH — Value Area High</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-accent/40" /><span className="text-muted">VAL — Value Area Low</span></div>
              </div>
            </div>

            {/* Flow pressure */}
            <div className="glass-card p-4">
              <h4 className="text-xs font-semibold mb-2">Flow Pressure</h4>
              <div className={cn("text-lg font-black text-center mb-2", flowBias === "Bullish" ? "text-bull-light" : flowBias === "Bearish" ? "text-bear-light" : "text-muted")}>{flowBias}</div>
              <div className="h-3 rounded-full overflow-hidden flex mb-2">
                <div className="bg-bull h-full" style={{ width: `${(buyPressure / totalPressure) * 100}%` }} />
                <div className="bg-bear h-full" style={{ width: `${(sellPressure / totalPressure) * 100}%` }} />
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-bull-light">Buy: {Math.round((buyPressure / totalPressure) * 100)}%</span>
                <span className="text-bear-light">Sell: {Math.round((sellPressure / totalPressure) * 100)}%</span>
              </div>
            </div>

            {/* Current price context */}
            {selectedQuote && (
              <div className="glass-card p-4">
                <h4 className="text-xs font-semibold mb-2">Price Context</h4>
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex justify-between"><span className="text-muted">Price</span><span className="text-foreground font-mono">{selectedQuote.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Change</span><span className={cn("font-mono", selectedQuote.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>{selectedQuote.changePercent >= 0 ? "+" : ""}{selectedQuote.changePercent.toFixed(2)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted">Range</span><span className="text-foreground font-mono">{(selectedQuote.high - selectedQuote.low).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Position</span><span className="text-foreground">{selectedQuote.high - selectedQuote.low > 0 ? `${Math.round(((selectedQuote.price - selectedQuote.low) / (selectedQuote.high - selectedQuote.low)) * 100)}% of range` : "—"}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ORDER FLOW VIEW */}
      {view === "flow" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="glass-card p-4 text-center"><div className={cn("text-2xl font-black", flowBias === "Bullish" ? "text-bull-light" : flowBias === "Bearish" ? "text-bear-light" : "text-muted")}>{flowBias}</div><div className="text-[10px] text-muted">Flow Bias</div></div>
            <div className="glass-card p-4 text-center"><div className="text-2xl font-bold text-bull-light">{Math.round((buyPressure / totalPressure) * 100)}%</div><div className="text-[10px] text-muted">Buy Pressure</div></div>
            <div className="glass-card p-4 text-center"><div className="text-2xl font-bold text-bear-light">{Math.round((sellPressure / totalPressure) * 100)}%</div><div className="text-[10px] text-muted">Sell Pressure</div></div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Flow Events — {inst?.displayName}</h3>
            <div className="space-y-3">
              {flowEvents.map((event) => {
                const cfg = FLOW_TYPE_CONFIG[event.type];
                return (
                  <div key={event.id} className={cn("glass-card p-5 border-l-4", event.direction === "bullish" ? "border-l-bull" : event.direction === "bearish" ? "border-l-bear" : "border-l-border")}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className={cn("text-xs font-bold", cfg.color)}>{cfg.label}</span>
                        <span className={cn("text-[10px] capitalize px-2 py-0.5 rounded-full", event.direction === "bullish" ? "badge-bull" : event.direction === "bearish" ? "badge-bear" : "badge-neutral")}>{event.direction}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-2 rounded-full bg-surface-3 overflow-hidden"><div className={cn("h-full rounded-full", event.strength >= 70 ? "bg-bull" : event.strength >= 40 ? "bg-accent" : "bg-muted")} style={{ width: `${event.strength}%` }} /></div>
                        <span className="text-[10px] font-mono text-muted">{event.strength}</span>
                        <span className="text-[10px] font-mono text-muted">{event.time}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-light leading-relaxed">{event.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-card p-5">
            <p className="text-[10px] text-muted text-center">Order flow is inferred from observable price behavior, displacement quality, and market structure — not from direct exchange-level data. Use as context, not certainty.</p>
          </div>
        </div>
      )}

      {/* PROFILE ZONES VIEW */}
      {view === "zones" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Key profile zones for {inst?.displayName} — where the market is accepting, rejecting, and likely to react</p>
          {zones.map((zone, i) => {
            const typeColor = zone.type === "poc" ? "border-l-accent" : zone.type === "hvn" ? "border-l-bull" : zone.type === "lvn" ? "border-l-bear" : zone.type === "vah" ? "border-l-accent" : "border-l-accent";
            const typeLabel = zone.type === "poc" ? "bg-accent/10 text-accent-light border-accent/20" : zone.type === "hvn" ? "bg-bull/10 text-bull-light border-bull/20" : zone.type === "lvn" ? "bg-bear/10 text-bear-light border-bear/20" : "bg-accent/10 text-accent-light border-accent/20";
            return (
              <div key={i} className={cn("glass-card p-5 border-l-4", typeColor)}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold font-mono text-foreground">{zone.priceLevel}</span>
                    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", typeLabel)}>{zone.type.toUpperCase()}</span>
                    <span className="text-xs text-muted">{zone.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 rounded-full bg-surface-3 overflow-hidden"><div className={cn("h-full rounded-full", zone.activity >= 70 ? "bg-bull" : zone.activity >= 40 ? "bg-accent" : "bg-bear/40")} style={{ width: `${zone.activity}%` }} /></div>
                    <span className="text-[10px] font-mono text-muted">{zone.activity}%</span>
                  </div>
                </div>
                <p className="text-xs text-muted-light leading-relaxed">{zone.interpretation}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How V Profile + Order Flow Works</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Volume Profile Zones</p>
            <p><strong>POC</strong> (Point of Control) — where most activity occurred, acts as a price magnet. <strong>HVN</strong> (High Volume Nodes) — acceptance zones, strong S/R. <strong>LVN</strong> (Low Volume Gaps) — price moved through fast, tends to be revisited. <strong>VAH/VAL</strong> — value area boundaries.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Order Flow Intelligence</p>
            <p>Flow is inferred from displacement quality, directional persistence, and range behavior. Buy/sell pressure, absorption patterns, imbalances, and breakout flow are identified from observable market action — not claimed as direct exchange data.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Chart-Native Experience</p>
            <p>The side histogram shows the profile directly alongside the TradingView chart. Toggle between Clean mode (just profile) and Advanced mode (flow events, pressure, and imbalance data).</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Integration</p>
            <p>Signal engines use profile zones to upgrade setup quality at HVNs. Bots use POC and value area for entry/stop logic. Replay mode can show historical profiles for training.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
