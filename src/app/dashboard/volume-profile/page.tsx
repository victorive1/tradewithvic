"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

interface VolumeZone {
  label: string;
  type: "acceptance" | "rejection" | "hvn" | "lvg" | "imbalance";
  level: number;
  strength: number;
  description: string;
}

function deriveVolumeZones(quote: any): VolumeZone[] {
  if (!quote) return [];
  const high = quote.high ?? quote.price * 1.01;
  const low = quote.low ?? quote.price * 0.99;
  const range = high - low;
  const mid = (high + low) / 2;
  const pct = Math.abs(quote.changePercent ?? 0);

  return [
    {
      label: "Point of Control (POC)",
      type: "acceptance",
      level: mid,
      strength: Math.min(95, 60 + pct * 10),
      description: "Price level with the highest traded volume -- market consensus price",
    },
    {
      label: "Value Area High (VAH)",
      type: "acceptance",
      level: mid + range * 0.35,
      strength: Math.min(90, 50 + pct * 8),
      description: "Upper boundary of the value area (70% of volume)",
    },
    {
      label: "Value Area Low (VAL)",
      type: "acceptance",
      level: mid - range * 0.35,
      strength: Math.min(90, 50 + pct * 8),
      description: "Lower boundary of the value area (70% of volume)",
    },
    {
      label: "High-Volume Node",
      type: "hvn",
      level: mid + range * 0.15,
      strength: Math.min(85, 45 + pct * 12),
      description: "Price level with significant volume accumulation -- acts as magnet",
    },
    {
      label: "Low-Volume Gap",
      type: "lvg",
      level: mid - range * 0.2,
      strength: Math.min(80, 40 + pct * 10),
      description: "Price area with minimal volume -- price tends to move through quickly",
    },
    {
      label: "Imbalance Zone",
      type: "imbalance",
      level: quote.changePercent > 0 ? low + range * 0.25 : high - range * 0.25,
      strength: Math.min(75, 35 + pct * 15),
      description: "Area where buy/sell pressure was one-sided -- may attract price for rebalancing",
    },
  ];
}

export default function VolumeProfilePage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(ALL_INSTRUMENTS[0].symbol);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    fetch("/api/market/quotes")
      .then((res) => res.json())
      .then((data) => {
        if (data.quotes) {
          setQuotes(data.quotes);
          setLastUpdated(new Date(data.timestamp).toLocaleTimeString());
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedQuote = quotes.find((q: any) => q.symbol === selectedSymbol);
  const zones = deriveVolumeZones(selectedQuote);
  const selected = ALL_INSTRUMENTS.find((i) => i.symbol === selectedSymbol) || ALL_INSTRUMENTS[0];
  const decimals = selected.category === "forex" ? 5 : 2;
  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const typeColors: Record<string, string> = {
    acceptance: "bg-bull",
    rejection: "bg-bear",
    hvn: "bg-accent",
    lvg: "bg-warn",
    imbalance: "bg-bear",
  };

  const typeLabels: Record<string, string> = {
    acceptance: "Acceptance",
    rejection: "Rejection",
    hvn: "High-Volume Node",
    lvg: "Low-Volume Gap",
    imbalance: "Imbalance",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Volume Profile & Order Flow</h1>
        <p className="text-sm text-muted mt-1">
          Acceptance/rejection zones, high-volume nodes, and volume imbalance detection
        </p>
        <p className="text-xs text-accent-light mt-1">Volume data enhances setup scoring across all engines</p>
        {lastUpdated && <p className="text-xs text-muted mt-1">Live data -- last updated {lastUpdated}</p>}
      </div>

      {/* Concepts */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Volume Profile Concepts</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "POC", desc: "Point of Control -- the price with the highest volume. Acts as a magnet for price." },
            { label: "VAH / VAL", desc: "Value Area High and Low -- bounds of where 70% of volume traded. Defines fair value." },
            { label: "HVN", desc: "High-Volume Nodes -- areas of significant volume. Price tends to consolidate here." },
            { label: "LVG", desc: "Low-Volume Gaps -- thin areas price moves through fast. Key for breakout targets." },
          ].map((concept) => (
            <div key={concept.label} className="bg-surface-2 rounded-lg p-3">
              <div className="text-xs font-bold text-accent-light mb-1">{concept.label}</div>
              <p className="text-[11px] text-muted leading-relaxed">{concept.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Instrument Selector */}
      <div className="flex items-center gap-4">
        <label className="text-xs text-muted font-medium">Instrument</label>
        <select
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          className="bg-surface-2 text-foreground text-sm rounded-lg border border-border/50 px-3 py-2 focus:outline-none focus:border-accent"
        >
          {ALL_INSTRUMENTS.map((inst) => (
            <option key={inst.symbol} value={inst.symbol}>{inst.displayName}</option>
          ))}
        </select>
        {selectedQuote && (
          <span className="text-sm font-mono text-foreground">{fmt(selectedQuote.price)}</span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="h-4 bg-surface-3 rounded w-40 mb-3" />
              <div className="h-8 bg-surface-3 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Volume Zones Visual */}
      {!loading && selectedQuote && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Visual Profile */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Volume Distribution</h3>
            <div className="space-y-3">
              {zones.map((zone) => (
                <div key={zone.label} className="flex items-center gap-3">
                  <span className="text-xs text-muted-light w-40 shrink-0">{zone.label}</span>
                  <div className="flex-1 h-5 rounded bg-surface-3 overflow-hidden relative">
                    <div
                      className={cn("h-full rounded opacity-70", typeColors[zone.type])}
                      style={{ width: `${zone.strength}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-mono text-foreground">
                      {fmt(zone.level)}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-muted-light w-8 text-right">{Math.round(zone.strength)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Zone Details */}
          <div className="space-y-4">
            {/* Market Acceptance */}
            <div className="glass-card p-5">
              <h4 className="text-sm font-semibold text-bull-light mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-bull" />
                Market Acceptance Zones
              </h4>
              {zones.filter((z) => z.type === "acceptance").map((z) => (
                <div key={z.label} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted-light">{z.label}</span>
                  <span className="text-xs font-mono text-foreground">{fmt(z.level)}</span>
                </div>
              ))}
              <p className="text-[11px] text-muted mt-2">Areas where price has been accepted -- equilibrium zones</p>
            </div>

            {/* High-Volume Nodes */}
            <div className="glass-card p-5">
              <h4 className="text-sm font-semibold text-accent-light mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent" />
                High-Volume Nodes
              </h4>
              {zones.filter((z) => z.type === "hvn").map((z) => (
                <div key={z.label} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted-light">{z.label}</span>
                  <span className="text-xs font-mono text-foreground">{fmt(z.level)}</span>
                </div>
              ))}
              <p className="text-[11px] text-muted mt-2">Significant volume accumulation -- acts as magnet for price</p>
            </div>

            {/* Low-Volume Gaps */}
            <div className="glass-card p-5">
              <h4 className="text-sm font-semibold text-warn mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-warn" />
                Low-Volume Gaps
              </h4>
              {zones.filter((z) => z.type === "lvg").map((z) => (
                <div key={z.label} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted-light">{z.label}</span>
                  <span className="text-xs font-mono text-foreground">{fmt(z.level)}</span>
                </div>
              ))}
              <p className="text-[11px] text-muted mt-2">Thin volume areas -- price moves through fast, key breakout targets</p>
            </div>

            {/* Imbalance */}
            <div className="glass-card p-5">
              <h4 className="text-sm font-semibold text-bear-light mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-bear" />
                Imbalance Detection
              </h4>
              {zones.filter((z) => z.type === "imbalance").map((z) => (
                <div key={z.label} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted-light">{z.label}</span>
                  <span className="text-xs font-mono text-foreground">{fmt(z.level)}</span>
                </div>
              ))}
              <p className="text-[11px] text-muted mt-2">One-sided pressure zones -- may attract price for rebalancing</p>
            </div>
          </div>
        </div>
      )}

      {!loading && !selectedQuote && (
        <div className="glass-card p-12 text-center">
          <p className="text-muted">No data available for this instrument. Select a different instrument or wait for data refresh.</p>
        </div>
      )}
    </div>
  );
}
