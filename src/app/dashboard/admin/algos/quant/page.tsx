"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  AlgoConfigPanel,
  useAlgoConfig,
  AlgoRoutingBadge,
  AlgoAccountsCard,
} from "@/components/algo/AlgoConfig";
import { AlgoBotStatusPanel } from "@/components/algo/AlgoBotStatusPanel";

// Mirrors src/app/dashboard/quant/page.tsx — keep these in sync if more
// Quant Engine strategies land. The bot's strategyFilter on the server
// is initialized from this list via DEFAULT_STRATEGY_FILTER.
const QUANT_STRATEGIES = [
  { key: "inverse_fvg", label: "Inverse FVG" },
  { key: "order_block", label: "Order Block" },
  { key: "breaker_block", label: "Breaker Block" },
  { key: "fvg_continuation", label: "FVG Continuation" },
];

interface QueuedSetup {
  id: string;
  symbol: string;
  setupType: string;
  direction: string;
  timeframe: string;
  qualityGrade: string;
  confidenceScore: number;
  riskReward: number;
  entry: number;
  createdAt: string;
}

export default function QuantAlgoPage() {
  const { settings, updateSettings, serverState, setBotFlags } = useAlgoConfig("quant");
  const [showConfig, setShowConfig] = useState(true);
  const [queued, setQueued] = useState<QueuedSetup[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);

  const enabled = serverState.enabled;
  const running = serverState.running;

  // Pull live A+/A active Quant setups via the existing setups API. The
  // runtime applies the same bot-level filters (minScore, RR, symbol)
  // against the same rows server-side, so this preview reflects what's
  // about to be routed on the next runtime tick.
  const fetchQueue = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        statuses: "active",
        grades: "A+,A",
        types: QUANT_STRATEGIES.map((s) => s.key).join(","),
        limit: "30",
      });
      const res = await fetch(`/api/setups?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data = await res.json();
      setQueued((data.setups ?? []) as QueuedSetup[]);
    } catch {
      // leave existing rows; we'll retry on the next interval
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const id = window.setInterval(fetchQueue, 30_000);
    return () => window.clearInterval(id);
  }, [fetchQueue]);

  // Apply the same minScore / minRiskReward / symbolFilter the runtime
  // will apply, so the count we display matches what actually gets routed.
  const passing = useMemo(() => {
    const symbolSet = new Set(settings.selectedPairs.map((s) => s.toUpperCase()));
    return queued.filter((s) => {
      if (s.confidenceScore < settings.minScore) return false;
      if (s.riskReward < settings.minRiskReward) return false;
      if (symbolSet.size > 0 && !symbolSet.has(s.symbol.toUpperCase())) return false;
      return true;
    });
  }, [queued, settings.minScore, settings.minRiskReward, settings.selectedPairs]);

  const aPlusCount = queued.filter((s) => s.qualityGrade === "A+").length;
  const aCount = queued.filter((s) => s.qualityGrade === "A").length;

  function handleToggleEnabled() {
    if (enabled) setBotFlags({ enabled: false, running: false });
    else setBotFlags({ enabled: true });
  }
  function handleToggleRunning() {
    if (!enabled) return;
    setBotFlags({ running: !running });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Quant Algo</h1>
            <AlgoRoutingBadge selectedAccounts={settings.selectedAccounts} />
          </div>
          <p className="text-sm text-muted">
            Routes A+/A setups from the{" "}
            <Link href="/dashboard/quant" className="text-accent-light hover:text-accent">
              Quant Engine
            </Link>{" "}
            (Inverse FVG, Order Block, Breaker Block, FVG Continuation) to your
            linked MT5 account(s). Inherits the full algo config — symbol filter,
            sizing, Auto Lot Sizing, daily DD guards.
          </p>
        </div>
        <div
          onClick={handleToggleEnabled}
          className={cn(
            "w-12 h-6 rounded-full relative cursor-pointer transition-smooth",
            enabled ? "bg-accent" : "bg-surface-3",
          )}
        >
          <div
            className={cn(
              "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-smooth",
              enabled ? "left-6" : "left-0.5",
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Status</div>
          <div className="flex items-center justify-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", running ? "bg-bull pulse-live" : "bg-muted")} />
            <span className={cn("text-sm font-bold", running ? "text-bull-light" : "text-muted")}>
              {running ? "Running" : "Idle"}
            </span>
          </div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">A+ Queued</div>
          <div className="text-lg font-bold text-bull-light">{aPlusCount}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">A Queued</div>
          <div className="text-lg font-bold text-foreground">{aCount}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Passing Filters</div>
          <div className="text-lg font-bold text-accent-light">{passing.length}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-muted mb-1">Min Score</div>
          <div className="text-lg font-bold">{settings.minScore}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleToggleRunning}
          disabled={!enabled}
          className={cn(
            "px-6 py-2.5 rounded-xl text-sm font-semibold transition-smooth",
            !enabled
              ? "bg-surface-3 text-muted cursor-not-allowed"
              : running
              ? "bg-bear/20 text-bear-light hover:bg-bear/30 border border-bear/30"
              : "bg-accent/20 text-accent-light hover:bg-accent/30 border border-accent/30",
          )}
        >
          {running ? "Stop Bot" : "Start Bot"}
        </button>
        {!enabled && (
          <span className="text-xs text-muted">
            Enable the bot first using the toggle in the top right ↗
          </span>
        )}
        {enabled && !running && (
          <span className="text-xs text-muted">Click Start Bot to route the next matching A+/A setup.</span>
        )}
      </div>

      <AlgoAccountsCard settings={settings} updateSettings={updateSettings} />

      <AlgoBotStatusPanel botId="quant" />

      <button
        onClick={() => setShowConfig(!showConfig)}
        className={cn(
          "px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
          showConfig
            ? "bg-accent text-white"
            : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light",
        )}
      >
        {showConfig ? "Hide Config" : "Show Config"}
      </button>

      {showConfig && (
        <AlgoConfigPanel settings={settings} updateSettings={updateSettings} botName="Quant Algo" />
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Live Quant Queue</h3>
            <Link href="/dashboard/quant" className="text-[11px] text-accent-light hover:text-accent">
              View on Quant Signals →
            </Link>
          </div>
          {loadingQueue ? (
            <div className="text-center text-xs text-muted py-8">Loading…</div>
          ) : queued.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-sm text-muted">No A+/A Quant setups in the queue right now.</div>
              <div className="text-[11px] text-muted mt-1">
                Setups appear here when the Quant Engine grades a Blueprint § 7 pattern A+ or A.
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[26rem] overflow-y-auto">
              {queued.map((s) => {
                const passes =
                  s.confidenceScore >= settings.minScore &&
                  s.riskReward >= settings.minRiskReward &&
                  (settings.selectedPairs.length === 0 ||
                    settings.selectedPairs.map((p) => p.toUpperCase()).includes(s.symbol.toUpperCase()));
                const strategyLabel =
                  QUANT_STRATEGIES.find((q) => q.key === s.setupType)?.label ?? s.setupType.replace(/_/g, " ");
                const isLong =
                  s.direction === "long" || s.direction === "bullish" || s.direction === "buy";
                return (
                  <Link
                    key={s.id}
                    href={`/dashboard/brain/decision/${s.id}`}
                    className={cn(
                      "flex items-center justify-between bg-surface-2 rounded-lg p-3 border transition-smooth hover:border-border-light",
                      passes ? "border-accent/30" : "border-border/40 opacity-70",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs font-bold">{s.symbol}</span>
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-3 text-muted">
                        {s.timeframe}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase",
                          isLong ? "text-bull-light" : "text-bear-light",
                        )}
                      >
                        {isLong ? "▲" : "▼"}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-accent-light">
                        {strategyLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                          s.qualityGrade === "A+"
                            ? "bg-bull/15 text-bull-light border-bull/40"
                            : "bg-bull/10 text-bull-light border-bull/30",
                        )}
                      >
                        {s.qualityGrade}
                      </span>
                      <span className="text-[10px] font-mono text-muted">
                        {s.confidenceScore}/100 · {s.riskReward.toFixed(1)}×
                      </span>
                      <span
                        className={cn(
                          "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded",
                          passes ? "bg-accent/15 text-accent-light" : "bg-surface-3 text-muted",
                        )}
                      >
                        {passes ? "passes" : "filtered"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass-card p-6 space-y-3">
          <h3 className="text-sm font-semibold">How it works</h3>
          <div className="space-y-2 text-xs text-muted leading-relaxed">
            <p>
              <span className="text-foreground font-medium">Source:</span> the Quant Engine grades setups
              from four Blueprint § 7 strategies (Inverse FVG, Order Block, Breaker Block, FVG
              Continuation). Anything graded A+ or A becomes routable.
            </p>
            <p>
              <span className="text-foreground font-medium">Filtering:</span> on top of the grade gate,
              this bot applies your <code>minScore</code>, <code>minRiskReward</code>, and{" "}
              <code>symbolFilter</code> from the config below. Setups marked &quot;passes&quot; in the
              queue meet all three.
            </p>
            <p>
              <span className="text-foreground font-medium">Sizing:</span> uses the bot&apos;s sizing
              mode (fixed lot or risk %). If Auto Lot Sizing is enabled, every order is solved so
              SL = -$amount and 1R = +$amount, with TP capped at +1R from entry.
            </p>
            <p>
              <span className="text-foreground font-medium">Routing:</span> orders go to every linked
              MT5 account selected in &quot;Trading Accounts&quot; above. The matching MT5 instance(s)
              must be running with TradeWithVicBridge attached and online.
            </p>
            <p>
              <span className="text-foreground font-medium">Guards:</span> daily drawdown %, pause
              after N losses, max open positions, max per pair, and news/Friday-close protection are
              all live-applied per the config.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
