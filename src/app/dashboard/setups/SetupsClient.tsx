"use client";

import { useCallback, useState } from "react";
import { SetupCard } from "@/components/dashboard/SetupCard";
import type { TradeSetup } from "@/lib/setup-engine";
import { MARKET_CATEGORIES } from "@/lib/constants";
import { TimeframeFilter, type TimeframeValue, matchesTimeframe, buildTimeframeCounts } from "@/components/dashboard/TimeframeFilter";
import { AdminRiskTargetBar } from "@/components/admin/AdminRiskTarget";
import { useStableSetups } from "@/lib/dashboard/use-stable-setups";

const setupFilters = [
  { id: "all", label: "All Setups" },
  { id: "scalping", label: "Scalping" },
  { id: "intraday", label: "Intraday" },
  { id: "swing", label: "Swing" },
  { id: "highest", label: "Highest Confidence" },
  { id: "bestrr", label: "Best R:R" },
];

export function SetupsClient({ initialSetups, lastUpdated, paused = false }: { initialSetups: TradeSetup[]; lastUpdated?: number | null; paused?: boolean }) {
  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;
  const freshnessLabel = ageSec == null ? null
    : ageSec < 60 ? `${ageSec}s ago`
    : `${Math.floor(ageSec / 60)}m ago`;
  const [category, setCategory] = useState("all");
  const [filter, setFilter] = useState("all");
  const [direction, setDirection] = useState<"all" | "buy" | "sell">("all");
  const [timeframe, setTimeframe] = useState<TimeframeValue>("all");

  // Stable ordering — incoming setups are merged into the existing display
  // order so cards don't reshuffle on every refresh. New ones append at
  // the bottom, gone ones drop out, surviving ones keep their slots.
  const getId = useCallback((s: TradeSetup) => s.id, []);
  const { items: stableSetups, changedIds } = useStableSetups(initialSetups, getId, paused);

  let filtered = stableSetups;

  if (category !== "all") {
    filtered = filtered.filter((s) => s.category === category);
  }

  if (direction !== "all") {
    filtered = filtered.filter((s) => s.direction === direction);
  }

  if (filter === "scalping") filtered = filtered.filter((s) => s.timeframe === "5m");
  else if (filter === "intraday") filtered = filtered.filter((s) => ["15m", "1h"].includes(s.timeframe));
  else if (filter === "swing") filtered = filtered.filter((s) => s.timeframe === "4h");
  else if (filter === "highest") filtered = [...filtered].sort((a, b) => b.confidenceScore - a.confidenceScore);
  else if (filter === "bestrr") filtered = [...filtered].sort((a, b) => b.riskReward - a.riskReward);

  // Explicit timeframe chip filter — applied after the semantic "Scalping/
  // Intraday/Swing" quick-filter above so the two can stack.
  const timeframeCounts = buildTimeframeCounts(filtered, (s) => s.timeframe);
  filtered = filtered.filter((s) => matchesTimeframe(s.timeframe, timeframe));

  const highQuality = filtered.filter((s) => s.confidenceScore >= 75);
  const moderate = filtered.filter((s) => s.confidenceScore >= 55 && s.confidenceScore < 75);

  return (
    <div className="space-y-6">
      <AdminRiskTargetBar />
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Trade Setups</h1>
          <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20 pulse-live">Live</span>
          {freshnessLabel && (
            <span className="text-xs text-muted">Last updated {freshnessLabel} · refreshes every 60s</span>
          )}
          {paused && (
            <span className="text-[11px] text-warn-light bg-warn/10 border border-warn/30 px-2 py-0.5 rounded-full" title="Refresh paused while you're hovering — move away to resume">
              ⏸ paused while interacting
            </span>
          )}
        </div>
        <p className="text-sm text-muted mt-1">
          Curated trade ideas ranked by quality and confidence — regenerated from live quotes on every refresh.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Active Setups</div>
          <div className="text-xl font-bold">{filtered.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">A+ Grade</div>
          <div className="text-xl font-bold text-bull-light">{filtered.filter((s) => s.qualityGrade === "A+").length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Avg Confidence</div>
          <div className="text-xl font-bold text-accent-light">
            {filtered.length > 0 ? Math.round(filtered.reduce((a, b) => a + b.confidenceScore, 0) / filtered.length) : 0}%
          </div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Avg R:R</div>
          <div className="text-xl font-bold text-warn">
            {filtered.length > 0 ? (filtered.reduce((a, b) => a + b.riskReward, 0) / filtered.length).toFixed(1) : 0}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {MARKET_CATEGORIES.map((cat) => (
          <button key={cat.id} onClick={() => setCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth ${category === cat.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"}`}>
            {cat.label}
          </button>
        ))}
        <div className="w-px bg-border mx-1" />
        <button onClick={() => setDirection("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth ${direction === "all" ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50"}`}>All</button>
        <button onClick={() => setDirection("buy")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth ${direction === "buy" ? "bg-bull text-white" : "bg-surface-2 text-muted-light border border-border/50"}`}>Bullish</button>
        <button onClick={() => setDirection("sell")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth ${direction === "sell" ? "bg-bear text-white" : "bg-surface-2 text-muted-light border border-border/50"}`}>Bearish</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {setupFilters.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-smooth ${filter === f.id ? "bg-surface-3 text-foreground border border-border-light" : "text-muted hover:text-muted-light"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <TimeframeFilter value={timeframe} onChange={setTimeframe} counts={timeframeCounts} />

      {/* High quality section */}
      {highQuality.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-bull-light mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-bull" />
            High Confidence Setups
          </h2>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {highQuality.map((setup) => (
              <SetupCard key={setup.id} setup={setup} justUpdated={changedIds.has(setup.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Moderate section */}
      {moderate.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-warn mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warn" />
            Moderate Setups
          </h2>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {moderate.map((setup) => (
              <SetupCard key={setup.id} setup={setup} justUpdated={changedIds.has(setup.id)} />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-muted">No trade setups match your current filters. The system scans continuously and will display opportunities when conditions align.</p>
        </div>
      )}
    </div>
  );
}
