"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { useTheme } from "@/components/ui/ThemeProvider";

const overlayPanels = [
  {
    title: "Structure Overlay",
    description: "Break of structure (BOS), change of character (CHoCH), swing highs/lows, and trend structure mapped directly on price.",
    status: "Available",
    color: "text-bull-light",
  },
  {
    title: "Zone Ratings",
    description: "Supply and demand zones scored by freshness, reaction strength, and proximity. Higher-rated zones = stronger expected reactions.",
    status: "Available",
    color: "text-accent-light",
  },
  {
    title: "Session Context",
    description: "London, New York, Asian session ranges highlighted. Session open/close levels, overlap zones, and kill zone windows.",
    status: "Available",
    color: "text-accent-light",
  },
  {
    title: "Sentiment Indicator",
    description: "Real-time market sentiment derived from positioning data, option flows, and price action momentum shifts.",
    status: "Coming Soon",
    color: "text-muted",
  },
  {
    title: "Catalyst Notes",
    description: "Economic events, earnings releases, and macro catalysts pinned to their time on the chart with impact ratings.",
    status: "Coming Soon",
    color: "text-muted",
  },
];

const intervals = [
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1H", value: "60" },
  { label: "4H", value: "240" },
  { label: "1D", value: "D" },
  { label: "1W", value: "W" },
];

export default function IntelligenceChartPage() {
  const [selectedInstrument, setSelectedInstrument] = useState<string>(ALL_INSTRUMENTS[0].symbol);
  const [selectedInterval, setSelectedInterval] = useState("60");
  const { theme } = useTheme();

  const selected = ALL_INSTRUMENTS.find((i) => i.symbol === selectedInstrument) || ALL_INSTRUMENTS[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Intelligence Chart</h1>
        <p className="text-sm text-muted mt-1">
          Full TradingView chart with real-time data and intelligence overlays
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted font-medium">Instrument</label>
          <select
            value={selectedInstrument}
            onChange={(e) => setSelectedInstrument(e.target.value)}
            className="bg-surface-2 text-foreground text-sm rounded-lg border border-border/50 px-3 py-2 focus:outline-none focus:border-accent"
          >
            {ALL_INSTRUMENTS.map((inst) => (
              <option key={inst.symbol} value={inst.symbol}>
                {inst.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          {intervals.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setSelectedInterval(tf.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth",
                selectedInterval === tf.value
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-muted capitalize bg-surface-2 px-2 py-1 rounded">{selected.category}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />
          Live
        </span>
      </div>

      {/* Chart + Side Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main Chart — TradingView Widget */}
        <div className="lg:col-span-3">
          <div className="glass-card overflow-hidden" style={{ height: 520 }}>
            <TradingViewWidget
              symbol={selectedInstrument}
              interval={selectedInterval}
              theme={theme}
              height={520}
              autosize={false}
            />
          </div>
        </div>

        {/* Side Panels */}
        <div className="space-y-3">
          {overlayPanels.map((panel) => (
            <div key={panel.title} className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-foreground">{panel.title}</h4>
                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full",
                  panel.status === "Available" ? "bg-bull/10 text-bull-light" : "bg-surface-2 text-muted"
                )}>
                  {panel.status}
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed">{panel.description}</p>
            </div>
          ))}

          {/* Quick actions */}
          <div className="glass-card p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3">Quick Access</h4>
            <div className="space-y-2">
              <button className="w-full text-left px-3 py-2 rounded-lg bg-surface-2 text-xs text-muted-light hover:text-foreground hover:border-border-light border border-border/50 transition-smooth">
                View Trade Setups for {selected.displayName}
              </button>
              <button className="w-full text-left px-3 py-2 rounded-lg bg-surface-2 text-xs text-muted-light hover:text-foreground hover:border-border-light border border-border/50 transition-smooth">
                View Liquidity Zones
              </button>
              <button className="w-full text-left px-3 py-2 rounded-lg bg-surface-2 text-xs text-muted-light hover:text-foreground hover:border-border-light border border-border/50 transition-smooth">
                View Support / Resistance
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay legend */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Intelligence Overlays</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "BOS / CHoCH", color: "bg-accent" },
            { label: "Supply Zones", color: "bg-bear" },
            { label: "Demand Zones", color: "bg-bull" },
            { label: "Session Ranges", color: "bg-warn" },
            { label: "Key Levels", color: "bg-muted" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-sm", item.color)} />
              <span className="text-xs text-muted-light">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
