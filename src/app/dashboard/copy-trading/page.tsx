"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const riskMultipliers = ["0.5x", "1x", "2x"];

const followerAccounts: { name: string; alias: string; status: string; trades: number; pnl: string }[] = [];

const instruments = [
  { symbol: "EUR/USD", allowed: true },
  { symbol: "GBP/USD", allowed: true },
  { symbol: "USD/JPY", allowed: true },
  { symbol: "XAU/USD", allowed: true },
  { symbol: "NAS100", allowed: false },
  { symbol: "GBP/JPY", allowed: true },
  { symbol: "US30", allowed: false },
  { symbol: "AUD/USD", allowed: true },
];

export default function CopyTradingPage() {
  const [selectedMultiplier, setSelectedMultiplier] = useState("1x");
  const [instrumentFilter, setInstrumentFilter] = useState<Record<string, boolean>>(
    Object.fromEntries(instruments.map((i) => [i.symbol, i.allowed]))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Copy Trading</h1>
          <p className="text-sm text-muted mt-1">
            Broadcast trade actions from master to follower accounts
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-accent/15 text-accent-light text-xs font-semibold">
          Coming Soon
        </span>
      </div>

      {/* Visual Flow Diagram */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-5">Replication Flow</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          {/* Master */}
          <div className="bg-accent/10 border border-accent/30 rounded-xl px-5 py-4 text-center min-w-[140px]">
            <div className="text-[10px] text-accent-light uppercase tracking-wide mb-1">Source</div>
            <div className="text-sm font-bold text-foreground">Master Account</div>
          </div>

          {/* Arrow */}
          <div className="text-muted text-xl hidden sm:block">&#8594;</div>
          <div className="text-muted text-xl sm:hidden">&#8595;</div>

          {/* Copy Engine */}
          <div className="bg-surface-2 border border-border/50 rounded-xl px-5 py-4 text-center min-w-[140px]">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Engine</div>
            <div className="text-sm font-bold text-accent-light">Copy Engine</div>
          </div>

          {/* Arrow */}
          <div className="text-muted text-xl hidden sm:block">&#8594;</div>
          <div className="text-muted text-xl sm:hidden">&#8595;</div>

          {/* Followers */}
          <div className="flex flex-col gap-2">
            <div className="rounded-xl px-4 py-2.5 text-center min-w-[140px] border bg-surface-2 border-border/50">
              <div className="text-xs font-medium text-muted">No followers</div>
              <div className="text-[10px] text-muted">Connect accounts to enable</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Master Account Section */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Master Account (Signal Source)</h3>
          <div className="bg-surface-2 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Account</span>
              <span className="text-xs font-medium text-muted">&mdash;</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Status</span>
              <span className="text-xs font-medium text-muted">Not active</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Open Positions</span>
              <span className="text-xs font-medium text-muted">&mdash;</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Signals Sent Today</span>
              <span className="text-xs font-medium text-muted">&mdash;</span>
            </div>
          </div>
        </div>

        {/* Follower Accounts Section */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Follower Accounts</h3>
          <div className="bg-surface-2 rounded-xl p-6 text-center">
            <p className="text-sm text-muted">No follower accounts connected yet.</p>
            <p className="text-xs text-muted mt-1">Connect accounts to enable copy trading.</p>
          </div>
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="glass-card p-6 space-y-5">
        <h2 className="text-sm font-semibold text-foreground">Configuration</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Risk Multiplier */}
          <div>
            <label className="text-xs text-muted-light mb-2 block">Risk Multiplier</label>
            <div className="flex gap-2">
              {riskMultipliers.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMultiplier(m)}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-smooth",
                    selectedMultiplier === m
                      ? "bg-accent/15 border border-accent/30 text-accent-light"
                      : "bg-surface-2 border border-border/50 text-muted-light hover:border-border-light"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Max Allocation */}
          <div>
            <label className="text-xs text-muted-light mb-2 block">Max Allocation / Trade</label>
            <div className="bg-surface-2 rounded-xl px-4 py-2.5 border border-border/50 text-sm text-foreground font-mono">
              2.0%
            </div>
          </div>

          {/* Slippage Tolerance */}
          <div>
            <label className="text-xs text-muted-light mb-2 block">Slippage Tolerance</label>
            <div className="bg-surface-2 rounded-xl px-4 py-2.5 border border-border/50 text-sm text-foreground font-mono">
              3 pips
            </div>
          </div>

          {/* Auto-pause Drawdown */}
          <div>
            <label className="text-xs text-muted-light mb-2 block">Auto-Pause on Drawdown</label>
            <div className="bg-surface-2 rounded-xl px-4 py-2.5 border border-border/50 text-sm text-foreground font-mono">
              5.0%
            </div>
          </div>
        </div>
      </div>

      {/* Sync Status */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Sync Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-xs text-muted mb-1">Sync Status</div>
            <div className="text-sm font-bold text-muted">Not active</div>
          </div>
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-xs text-muted mb-1">Latency</div>
            <div className="text-lg font-bold text-muted">&mdash;</div>
          </div>
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-xs text-muted mb-1">Positions Mirrored</div>
            <div className="text-lg font-bold text-muted">&mdash;</div>
          </div>
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-xs text-muted mb-1">Last Trade Copied</div>
            <div className="text-sm font-bold text-muted">&mdash;</div>
          </div>
        </div>
      </div>

      {/* Permission Controls */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Permission Controls</h2>
        <div>
          <label className="text-xs text-muted-light mb-2 block">Allowed Instruments</label>
          <div className="flex flex-wrap gap-2">
            {instruments.map((inst) => (
              <button
                key={inst.symbol}
                onClick={() =>
                  setInstrumentFilter((prev) => ({ ...prev, [inst.symbol]: !prev[inst.symbol] }))
                }
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth",
                  instrumentFilter[inst.symbol]
                    ? "bg-bull/15 border border-bull/30 text-bull-light"
                    : "bg-surface-2 border border-border/50 text-muted line-through"
                )}
              >
                {inst.symbol}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-light mb-2 block">Session Restrictions</label>
          <div className="flex flex-wrap gap-2">
            {["London", "New York", "Tokyo", "Sydney"].map((session) => (
              <div
                key={session}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 border border-accent/30 text-accent-light"
              >
                {session}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="text-center py-4">
        <p className="text-xs text-muted">
          Full copy trading infrastructure with safety guardrails
        </p>
      </div>
    </div>
  );
}
