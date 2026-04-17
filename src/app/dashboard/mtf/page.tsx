"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

const trends = ["Bullish Trend", "Bearish Trend", "Range", "Pullback", "Breakout", "Reversal", "Accumulation", "Distribution"];

function randomTrend() { return trends[Math.floor(Math.random() * trends.length)]; }

const mtfData = ALL_INSTRUMENTS.slice(0, 14).map((inst) => ({
  symbol: inst.displayName,
  monthly: randomTrend(),
  weekly: randomTrend(),
  daily: randomTrend(),
  h4: randomTrend(),
  h1: randomTrend(),
  m15: randomTrend(),
}));

function TrendCell({ trend }: { trend: string }) {
  const color = trend.includes("Bullish") || trend === "Breakout" || trend === "Accumulation"
    ? "text-bull-light bg-bull/5"
    : trend.includes("Bearish") || trend === "Distribution"
    ? "text-bear-light bg-bear/5"
    : "text-muted-light bg-surface-2";
  return (
    <td className={cn("px-2 py-2.5 text-center text-[10px] font-medium rounded", color)}>
      {trend.replace(" Trend", "").replace("ish", "")}
    </td>
  );
}

export default function MTFPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedData = mtfData.find((d) => d.symbol === selected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Multi-Timeframe Structure Analyzer</h1>
        <p className="text-sm text-muted mt-1">Analyze market structure across all timeframes to align trades with higher-timeframe bias</p>
      </div>

      {/* Matrix table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Instrument</th>
                <th className="text-center text-xs text-muted font-medium px-2 py-3">Monthly</th>
                <th className="text-center text-xs text-muted font-medium px-2 py-3">Weekly</th>
                <th className="text-center text-xs text-muted font-medium px-2 py-3">Daily</th>
                <th className="text-center text-xs text-muted font-medium px-2 py-3">4H</th>
                <th className="text-center text-xs text-muted font-medium px-2 py-3">1H</th>
                <th className="text-center text-xs text-muted font-medium px-2 py-3">15m</th>
              </tr>
            </thead>
            <tbody>
              {mtfData.map((row) => (
                <tr key={row.symbol}
                  onClick={() => setSelected(row.symbol === selected ? null : row.symbol)}
                  className={cn("border-b border-border/20 cursor-pointer transition-smooth",
                    selected === row.symbol ? "bg-accent/5" : "hover:bg-surface-2/50")}>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">{row.symbol}</td>
                  <TrendCell trend={row.monthly} />
                  <TrendCell trend={row.weekly} />
                  <TrendCell trend={row.daily} />
                  <TrendCell trend={row.h4} />
                  <TrendCell trend={row.h1} />
                  <TrendCell trend={row.m15} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected detail */}
      {selectedData && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">{selectedData.symbol} — Structure Summary</h3>
          <p className="text-sm text-muted-light leading-relaxed">
            Daily: <span className="text-foreground font-medium">{selectedData.daily}</span>,{" "}
            4H: <span className="text-foreground font-medium">{selectedData.h4}</span>,{" "}
            1H: <span className="text-foreground font-medium">{selectedData.h1}</span>.{" "}
            {selectedData.daily.includes("Bullish") && selectedData.h4.includes("Pullback")
              ? "Higher timeframe bullish with 4H pullback — potential continuation opportunity."
              : selectedData.daily.includes("Bearish") && selectedData.h1.includes("Reversal")
              ? "Bearish daily structure with 1H reversal attempt — watch for failed reversal or structure shift."
              : "Multiple timeframe analysis suggests monitoring for clearer alignment before entering."}
          </p>
        </div>
      )}

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-2">Legend</h3>
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Bullish", color: "text-bull-light" },
            { label: "Bearish", color: "text-bear-light" },
            { label: "Range/Neutral", color: "text-muted-light" },
            { label: "Pullback", color: "text-muted-light" },
            { label: "Breakout", color: "text-bull-light" },
            { label: "Reversal", color: "text-warn" },
          ].map((l) => (
            <span key={l.label} className={cn("text-xs", l.color)}>{l.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
