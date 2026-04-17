"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

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

export default function IntelligenceChartPage() {
  const [selectedInstrument, setSelectedInstrument] = useState<string>(ALL_INSTRUMENTS[0].symbol);

  const selected = ALL_INSTRUMENTS.find((i) => i.symbol === selectedInstrument) || ALL_INSTRUMENTS[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Intelligence Chart</h1>
        <p className="text-sm text-muted mt-1">
          Enhanced charting view with engine intelligence overlays on price action
        </p>
      </div>

      {/* Instrument Selector */}
      <div className="flex items-center gap-4">
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
        <span className="text-xs text-muted capitalize bg-surface-2 px-2 py-1 rounded">{selected.category}</span>
      </div>

      {/* Chart + Side Panels Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main Chart Area */}
        <div className="lg:col-span-3">
          <div className="glass-card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-foreground">{selected.displayName}</h3>
                <span className="text-xs bg-surface-2 px-2 py-1 rounded">1H</span>
                <span className="text-xs bg-surface-2 px-2 py-1 rounded">Candlestick</span>
              </div>
              <div className="flex gap-2">
                {["5m", "15m", "1h", "4h", "1d"].map((tf) => (
                  <button
                    key={tf}
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium transition-smooth",
                      tf === "1h" ? "bg-accent/20 text-accent-light" : "text-muted hover:text-muted-light"
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart placeholder */}
            <div className="flex items-center justify-center h-[420px] bg-surface-2/30">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-surface-3 flex items-center justify-center">
                  <svg className="w-8 h-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <p className="text-sm text-muted-light font-medium">Connect TradingView widget for live charts</p>
                <p className="text-xs text-muted max-w-sm">
                  This area will display interactive price charts with engine intelligence overlays.
                  Integration with TradingView Advanced Charts coming soon.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Side Panels */}
        <div className="space-y-4">
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
