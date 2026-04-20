"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { getOrCreateUserKey } from "@/lib/trading/user-key-client";

export interface ConnectedAccount {
  id?: string;
  platform: string;
  login: string;
  server: string;
  broker: string;
  label?: string;
  connectionStatus?: string;
}

/**
 * Merge locally-cached and backend-synced MT accounts into a single list.
 * Same pattern used by MT5 Hub + Execute Trade modal — accounts added on
 * any signed-in device surface here.
 */
export function useConnectedAccounts(): ConnectedAccount[] {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);

  useEffect(() => {
    // Local first — paints immediately.
    try {
      const raw = localStorage.getItem("mt_accounts");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setAccounts(arr);
      } else {
        const legacy = localStorage.getItem("mt_account");
        if (legacy) {
          try { setAccounts([JSON.parse(legacy)]); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }

    // Backend merge.
    const userKey = getOrCreateUserKey();
    if (!userKey) return;
    fetch("/api/trading/accounts", {
      headers: { "x-trading-user-key": userKey },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.accounts?.length) return;
        setAccounts((prev) => {
          const byKey = new Map<string, ConnectedAccount>();
          for (const a of prev) byKey.set(`${a.login}:${a.server}`, a);
          for (const b of data.accounts) {
            const k = `${b.accountLogin}:${b.serverName}`;
            if (!byKey.has(k)) {
              byKey.set(k, {
                id: b.id,
                platform: b.platformType,
                login: b.accountLogin,
                server: b.serverName,
                broker: b.brokerName,
                label: b.accountLabel ?? undefined,
                connectionStatus: b.connectionStatus ?? undefined,
              });
            }
          }
          return Array.from(byKey.values());
        });
      })
      .catch(() => { /* silent */ });
  }, []);

  return accounts;
}

/**
 * Infer whether a server name / platform points at a demo or live account.
 * Heuristic-only — broker server strings almost always encode it.
 */
export function classifyAccount(server: string): "live" | "demo" | "unknown" {
  const s = server.toLowerCase();
  if (s.includes("demo") || s.includes("trial") || s.includes("practice") || s.includes("paper")) return "demo";
  if (s.includes("live") || s.includes("real") || s.includes("ecn") || s.includes("pro")) return "live";
  return "unknown";
}

/**
 * Standalone Trading Accounts card — meant to render at the top of every
 * algo page so users don't have to scroll through the whole config panel
 * to find the account picker. Same behavior as the accounts section
 * inside AlgoConfigPanel: loads linked MT accounts from localStorage +
 * backend, shows LIVE/DEMO/UNKNOWN chip per account, routes via
 * settings.selectedAccounts toggles.
 */
export function AlgoAccountsCard({
  settings,
  updateSettings,
}: {
  settings: AlgoSettings;
  updateSettings: (partial: Partial<AlgoSettings>) => void;
}) {
  const savedAccounts = useConnectedAccounts();

  // Auto-select on first visit once accounts exist.
  const autoSelectedRef = useMemo(() => ({ done: false }), []);
  useEffect(() => {
    if (autoSelectedRef.done) return;
    if (savedAccounts.length === 0) return;
    if (settings.selectedAccounts.length > 0) { autoSelectedRef.done = true; return; }
    autoSelectedRef.done = true;
    updateSettings({ selectedAccounts: savedAccounts.map((a) => a.login) });
  }, [savedAccounts, settings.selectedAccounts.length, updateSettings, autoSelectedRef]);

  function toggleAccount(accountId: string) {
    const accounts = settings.selectedAccounts.includes(accountId)
      ? settings.selectedAccounts.filter((a) => a !== accountId)
      : [...settings.selectedAccounts, accountId];
    updateSettings({ selectedAccounts: accounts });
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          🔗 Trading Accounts from Trading Hub
          {savedAccounts.length > 0 && (
            <span className="text-[10px] font-normal text-muted">
              · {settings.selectedAccounts.length} of {savedAccounts.length} routed
            </span>
          )}
        </h3>
        {savedAccounts.length > 0 && (
          <div className="flex items-center gap-2 text-[10px]">
            <button
              onClick={() => updateSettings({ selectedAccounts: savedAccounts.map((a) => a.login) })}
              className="text-accent-light hover:text-accent transition-smooth"
            >
              Select All
            </button>
            <span className="text-muted">·</span>
            <button
              onClick={() => updateSettings({ selectedAccounts: [] })}
              className="text-muted hover:text-muted-light transition-smooth"
            >
              Clear All
            </button>
            <span className="text-muted">·</span>
            <Link href="/dashboard/trading-hub" className="text-accent-light hover:text-accent transition-smooth">
              + Add from Trading Hub
            </Link>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted mb-3">
        Trades route directly to the MT4/MT5 accounts you&apos;ve linked in Trading Hub. Live or demo only — never paper.
      </p>
      {savedAccounts.length > 0 ? (
        <div className="space-y-2">
          {savedAccounts.map((acct, i) => {
            const kind = classifyAccount(acct.server);
            const isSelected = settings.selectedAccounts.includes(acct.login);
            return (
              <div key={i} className="flex items-center justify-between bg-surface-2 rounded-xl p-3 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs font-semibold text-foreground truncate">{acct.broker} · #{acct.login}</span>
                    <span className={cn(
                      "px-1.5 py-0.5 text-[9px] rounded uppercase tracking-wider font-bold border shrink-0",
                      kind === "live" ? "bg-bull/10 text-bull-light border-bull/30"
                        : kind === "demo" ? "bg-accent/10 text-accent-light border-accent/30"
                        : "bg-surface-3 text-muted border-border",
                    )}>
                      {kind === "unknown" ? "UNKNOWN" : kind}
                    </span>
                    <span className="px-1.5 py-0.5 text-[9px] rounded bg-surface-3 text-muted uppercase tracking-wider shrink-0">{acct.platform}</span>
                  </div>
                  <div className="text-[10px] text-muted truncate">{acct.server}{acct.label ? ` · ${acct.label}` : ""}</div>
                </div>
                <button
                  onClick={() => toggleAccount(acct.login)}
                  className={cn("w-10 h-5 rounded-full relative transition-smooth shrink-0", isSelected ? "bg-accent" : "bg-surface-3")}
                  aria-label={isSelected ? "Route trades to this account" : "Stop routing to this account"}
                >
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", isSelected ? "left-5" : "left-0.5")} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/50 p-5 text-center space-y-2">
          <div className="text-2xl">🔗</div>
          <p className="text-xs text-muted-light">
            No MT4/MT5 accounts linked yet. This algo won&apos;t place trades until you connect at least one live or demo account in Trading Hub.
          </p>
          <Link
            href="/dashboard/trading-hub"
            className="inline-block mt-1 px-4 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-smooth"
          >
            Open Trading Hub →
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Small badge that lives in an algo page header. Shows routing state
 * (disconnected / partial / routed) and never says "paper" — this app
 * only routes live or demo MT accounts.
 */
export function AlgoRoutingBadge({ selectedAccounts }: { selectedAccounts: string[] }) {
  const accounts = useConnectedAccounts();
  const selected = accounts.filter((a) => selectedAccounts.includes(a.login));
  const liveCount = selected.filter((a) => classifyAccount(a.server) === "live").length;
  const demoCount = selected.filter((a) => classifyAccount(a.server) === "demo").length;
  const otherCount = selected.length - liveCount - demoCount;

  if (accounts.length === 0) {
    return (
      <Link
        href="/dashboard/trading-hub"
        className="text-xs bg-bear/10 text-bear-light px-2.5 py-1 rounded-full border border-bear/30 font-medium hover:bg-bear/15 transition-smooth"
      >
        🔗 Link MT account
      </Link>
    );
  }
  if (selected.length === 0) {
    return (
      <span className="text-xs bg-warn/10 text-warn px-2.5 py-1 rounded-full border border-warn/30 font-medium">
        No account routed · {accounts.length} available
      </span>
    );
  }
  const parts: string[] = [];
  if (liveCount > 0) parts.push(`${liveCount} live`);
  if (demoCount > 0) parts.push(`${demoCount} demo`);
  if (otherCount > 0) parts.push(`${otherCount} other`);
  return (
    <span className="text-xs bg-bull/10 text-bull-light px-2.5 py-1 rounded-full border border-bull/30 font-medium flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />
      Routing to {parts.join(" + ")}
    </span>
  );
}

export interface AlgoSettings {
  // Pair selection
  selectedPairs: string[];
  // Sizing
  sizingMode: "fixed_lot" | "risk_percent";
  fixedLotSize: number;
  riskPercent: number;
  perPairLots: Record<string, number>;
  usePerPairLots: boolean;
  // Quality filters
  minScore: number;
  minRiskReward: number;
  // Position limits
  maxOpenPositions: number;
  maxPerPair: number;
  maxSamePairInRow: number;
  // Risk management
  dailyDrawdownPercent: number;
  pauseAfterLosses: number;
  // Accounts
  selectedAccounts: string[];
  // Filters
  newsFilter: boolean;
  fridayCloseProtection: boolean;
  preCloseBufferMinutes: number;
  // Sessions
  allowedSessions: string[];
}

// Full instrument universe: every forex pair, metal, energy, index, and
// crypto tracked by the app. New algos start with all of them enabled.
const ALL_PAIR_SYMBOLS = ALL_INSTRUMENTS.map((i) => i.symbol);

// The prior default that shipped to users. Used only for one-time migration
// so users sitting on the stale 5-pair default get upgraded automatically.
const LEGACY_DEFAULT_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD"];

const defaultSettings: AlgoSettings = {
  selectedPairs: ALL_PAIR_SYMBOLS,
  sizingMode: "fixed_lot",
  fixedLotSize: 0.10,
  riskPercent: 1.0,
  perPairLots: {},
  usePerPairLots: false,
  minScore: 75,
  minRiskReward: 1.5,
  maxOpenPositions: 3,
  maxPerPair: 1,
  maxSamePairInRow: 2,
  dailyDrawdownPercent: 3.0,
  pauseAfterLosses: 3,
  selectedAccounts: [],
  newsFilter: true,
  fridayCloseProtection: true,
  preCloseBufferMinutes: 30,
  allowedSessions: ["london", "newyork"],
};

function arraysEqualIgnoringOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const x of b) if (!set.has(x)) return false;
  return true;
}

/**
 * useAlgoConfig — local state backed by both localStorage (instant paint,
 * offline-safe) and the /api/algos/config/[botId] endpoint (so the
 * server-side runtime loop and any other admin browser see the same
 * values). On mount we read localStorage first for snappy UX, then
 * reconcile with the server. Every mutation writes through to both.
 */
export function useAlgoConfig(botId: string) {
  const [settings, setSettings] = useState<AlgoSettings>(defaultSettings);
  const [serverState, setServerState] = useState<{ enabled: boolean; running: boolean }>(
    { enabled: false, running: false },
  );

  useEffect(() => {
    const saved = localStorage.getItem(`algo_config_${botId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const next: AlgoSettings = { ...defaultSettings, ...parsed };
        if (Array.isArray(next.selectedPairs) && arraysEqualIgnoringOrder(next.selectedPairs, LEGACY_DEFAULT_PAIRS)) {
          next.selectedPairs = ALL_PAIR_SYMBOLS;
          try { localStorage.setItem(`algo_config_${botId}`, JSON.stringify(next)); } catch { /* ignore */ }
        }
        setSettings(next);
      } catch { /* ignore */ }
    }

    const userKey = getOrCreateUserKey();
    fetch(`/api/algos/config/${botId}`, {
      headers: userKey ? { "x-trading-user-key": userKey } : undefined,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cfg) return;
        setServerState({ enabled: !!cfg.enabled, running: !!cfg.running });
        setSettings((prev) => {
          const merged: AlgoSettings = {
            ...prev,
            sizingMode: cfg.sizingMode ?? prev.sizingMode,
            fixedLotSize: cfg.fixedLotSize ?? prev.fixedLotSize,
            riskPercent: cfg.riskPercent ?? prev.riskPercent,
            minScore: cfg.minScore ?? prev.minScore,
            minRiskReward: cfg.minRiskReward ?? prev.minRiskReward,
            maxOpenPositions: cfg.maxOpenPositions ?? prev.maxOpenPositions,
            maxPerPair: cfg.maxPerPair ?? prev.maxPerPair,
            maxSamePairInRow: cfg.maxSamePairInRow ?? prev.maxSamePairInRow,
            dailyDrawdownPercent: cfg.dailyDrawdownPercent ?? prev.dailyDrawdownPercent,
            pauseAfterLosses: cfg.pauseAfterLosses ?? prev.pauseAfterLosses,
            newsFilter: cfg.newsFilter ?? prev.newsFilter,
            fridayCloseProtection: cfg.fridayCloseProtection ?? prev.fridayCloseProtection,
            preCloseBufferMinutes: cfg.preCloseBufferMinutes ?? prev.preCloseBufferMinutes,
          };
          if (typeof cfg.selectedAccounts === "string" && cfg.selectedAccounts.length > 0) {
            merged.selectedAccounts = cfg.selectedAccounts.split(",").filter(Boolean);
          }
          if (typeof cfg.allowedSessions === "string" && cfg.allowedSessions.length > 0) {
            merged.allowedSessions = cfg.allowedSessions.split(",").filter(Boolean);
          }
          if (typeof cfg.symbolFilter === "string" && cfg.symbolFilter.length > 0) {
            merged.selectedPairs = cfg.symbolFilter.split(",").filter(Boolean);
          }
          try { localStorage.setItem(`algo_config_${botId}`, JSON.stringify(merged)); } catch { /* ignore */ }
          return merged;
        });
      })
      .catch(() => { /* silent — localStorage fallback covers offline */ });
  }, [botId]);

  async function persistToServer(next: AlgoSettings) {
    const userKey = getOrCreateUserKey();
    try {
      await fetch(`/api/algos/config/${botId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userKey ? { "x-trading-user-key": userKey } : {}),
        },
        body: JSON.stringify({
          sizingMode: next.sizingMode,
          fixedLotSize: next.fixedLotSize,
          riskPercent: next.riskPercent,
          minScore: next.minScore,
          minRiskReward: next.minRiskReward,
          maxOpenPositions: next.maxOpenPositions,
          maxPerPair: next.maxPerPair,
          maxSamePairInRow: next.maxSamePairInRow,
          dailyDrawdownPercent: next.dailyDrawdownPercent,
          pauseAfterLosses: next.pauseAfterLosses,
          selectedAccounts: next.selectedAccounts,
          newsFilter: next.newsFilter,
          fridayCloseProtection: next.fridayCloseProtection,
          preCloseBufferMinutes: next.preCloseBufferMinutes,
          allowedSessions: next.allowedSessions,
          symbolFilter: next.selectedPairs,
        }),
      });
    } catch { /* silent */ }
  }

  function updateSettings(partial: Partial<AlgoSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(`algo_config_${botId}`, JSON.stringify(next)); } catch { /* ignore */ }
      persistToServer(next);
      return next;
    });
  }

  async function setBotFlags(flags: { enabled?: boolean; running?: boolean }) {
    const userKey = getOrCreateUserKey();
    setServerState((prev) => ({
      enabled: flags.enabled ?? prev.enabled,
      running: flags.running ?? prev.running,
    }));
    try {
      await fetch(`/api/algos/config/${botId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userKey ? { "x-trading-user-key": userKey } : {}),
        },
        body: JSON.stringify(flags),
      });
    } catch { /* silent */ }
  }

  return { settings, updateSettings, serverState, setBotFlags };
}

export function AlgoConfigPanel({
  settings,
  updateSettings,
  botName,
}: {
  settings: AlgoSettings;
  updateSettings: (partial: Partial<AlgoSettings>) => void;
  botName: string;
}) {
  const [showPairSelector, setShowPairSelector] = useState(false);
  const [showPerPair, setShowPerPair] = useState(settings.usePerPairLots);

  function togglePair(symbol: string) {
    const pairs = settings.selectedPairs.includes(symbol)
      ? settings.selectedPairs.filter((p) => p !== symbol)
      : [...settings.selectedPairs, symbol];
    updateSettings({ selectedPairs: pairs });
  }

  function toggleSession(session: string) {
    const sessions = settings.allowedSessions.includes(session)
      ? settings.allowedSessions.filter((s) => s !== session)
      : [...settings.allowedSessions, session];
    updateSettings({ allowedSessions: sessions });
  }

  return (
    <div className="space-y-4">
      {/* Pair Selection */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-foreground">Instruments ({settings.selectedPairs.length})</h4>
          <button onClick={() => setShowPairSelector(!showPairSelector)} className="text-xs text-accent-light hover:text-accent transition-smooth">
            {showPairSelector ? "Hide" : "Edit Pairs"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {settings.selectedPairs.map((sym) => {
            const inst = ALL_INSTRUMENTS.find((i) => i.symbol === sym);
            return (
              <span key={sym} className="text-xs bg-accent/10 text-accent-light px-2 py-1 rounded-lg border border-accent/20">
                {inst?.displayName || sym}
              </span>
            );
          })}
        </div>
        {showPairSelector && (
          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex flex-wrap gap-1.5">
              {ALL_INSTRUMENTS.map((inst) => (
                <button key={inst.symbol} onClick={() => togglePair(inst.symbol)}
                  className={cn("text-xs px-2.5 py-1.5 rounded-lg transition-smooth",
                    settings.selectedPairs.includes(inst.symbol) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>
                  {inst.displayName}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => updateSettings({ selectedPairs: ALL_INSTRUMENTS.map((i) => i.symbol) })} className="text-[10px] text-accent-light hover:text-accent">Select All</button>
              <button onClick={() => updateSettings({ selectedPairs: [] })} className="text-[10px] text-muted hover:text-muted-light">Clear All</button>
            </div>
          </div>
        )}
      </div>

      {/* Position Sizing */}
      <div className="glass-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">Position Sizing</h4>
        <div className="flex gap-2 mb-4">
          <button onClick={() => updateSettings({ sizingMode: "fixed_lot" })}
            className={cn("flex-1 py-2.5 rounded-xl text-xs font-medium transition-smooth", settings.sizingMode === "fixed_lot" ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
            Fixed Lot Size
          </button>
          <button onClick={() => updateSettings({ sizingMode: "risk_percent" })}
            className={cn("flex-1 py-2.5 rounded-xl text-xs font-medium transition-smooth", settings.sizingMode === "risk_percent" ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
            Risk % Per Trade
          </button>
        </div>
        {settings.sizingMode === "fixed_lot" ? (
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Lot Size</label>
            <div className="flex gap-2">
              {[0.01, 0.05, 0.10, 0.25, 0.50, 1.00].map((lot) => (
                <button key={lot} onClick={() => updateSettings({ fixedLotSize: lot })}
                  className={cn("px-3 py-2 rounded-lg text-xs transition-smooth", settings.fixedLotSize === lot ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
                  {lot}
                </button>
              ))}
            </div>
            <input type="number" step="0.01" min="0.01" value={settings.fixedLotSize} onChange={(e) => updateSettings({ fixedLotSize: parseFloat(e.target.value) || 0.01 })}
              className="w-full mt-2 px-4 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
        ) : (
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Risk % Per Trade</label>
            <div className="flex gap-2 mb-2">
              {[0.5, 1.0, 1.5, 2.0, 3.0].map((pct) => (
                <button key={pct} onClick={() => updateSettings({ riskPercent: pct })}
                  className={cn("px-3 py-2 rounded-lg text-xs transition-smooth", settings.riskPercent === pct ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
                  {pct}%
                </button>
              ))}
            </div>
            <input type="number" step="0.1" min="0.1" max="10" value={settings.riskPercent} onChange={(e) => updateSettings({ riskPercent: parseFloat(e.target.value) || 1.0 })}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
        )}
        {/* Per-pair override */}
        <div className="mt-3 pt-3 border-t border-border/30">
          <label className="flex items-center gap-2 cursor-pointer">
            <button onClick={() => { setShowPerPair(!showPerPair); updateSettings({ usePerPairLots: !showPerPair }); }}
              className={cn("w-8 h-4 rounded-full relative transition-smooth", showPerPair ? "bg-accent" : "bg-surface-3")}>
              <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-smooth", showPerPair ? "left-4" : "left-0.5")} />
            </button>
            <span className="text-xs text-muted-light">Per-pair lot size override</span>
          </label>
          {showPerPair && (
            <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
              {settings.selectedPairs.map((sym) => {
                const inst = ALL_INSTRUMENTS.find((i) => i.symbol === sym);
                return (
                  <div key={sym} className="flex items-center gap-2">
                    <span className="text-xs text-muted w-20">{inst?.displayName || sym}</span>
                    <input type="number" step="0.01" min="0.01" value={settings.perPairLots[sym] || settings.fixedLotSize}
                      onChange={(e) => updateSettings({ perPairLots: { ...settings.perPairLots, [sym]: parseFloat(e.target.value) || 0.01 } })}
                      className="flex-1 px-2 py-1.5 rounded-lg bg-surface-2 border border-border focus:border-accent focus:outline-none text-xs text-foreground font-mono" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quality & Risk Filters */}
      <div className="glass-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">Quality & Risk Filters</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-light mb-1 block">Min Score (0-100)</label>
            <input type="number" min="0" max="100" value={settings.minScore} onChange={(e) => updateSettings({ minScore: parseInt(e.target.value) || 50 })}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1 block">Min R:R Ratio</label>
            <input type="number" step="0.1" min="0.5" value={settings.minRiskReward} onChange={(e) => updateSettings({ minRiskReward: parseFloat(e.target.value) || 1.0 })}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1 block">Max Open Positions</label>
            <input type="number" min="1" max="20" value={settings.maxOpenPositions} onChange={(e) => updateSettings({ maxOpenPositions: parseInt(e.target.value) || 3 })}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1 block">Max Per Pair</label>
            <input type="number" min="1" max="5" value={settings.maxPerPair} onChange={(e) => updateSettings({ maxPerPair: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1 block">Max Same Pair In Row</label>
            <input type="number" min="1" max="10" value={settings.maxSamePairInRow} onChange={(e) => updateSettings({ maxSamePairInRow: parseInt(e.target.value) || 2 })}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1 block">Daily Drawdown %</label>
            <input type="number" step="0.5" min="0.5" max="20" value={settings.dailyDrawdownPercent} onChange={(e) => updateSettings({ dailyDrawdownPercent: parseFloat(e.target.value) || 3.0 })}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1 block">Pause After X Losses</label>
            <input type="number" min="1" max="10" value={settings.pauseAfterLosses} onChange={(e) => updateSettings({ pauseAfterLosses: parseInt(e.target.value) || 3 })}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1 block">Pre-Close Buffer (min)</label>
            <input type="number" min="0" max="120" value={settings.preCloseBufferMinutes} onChange={(e) => updateSettings({ preCloseBufferMinutes: parseInt(e.target.value) || 30 })}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
        </div>
      </div>

      {/* Safety Filters */}
      <div className="glass-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">Safety Filters</h4>
        <div className="space-y-3">
          {[
            { key: "newsFilter" as const, label: "News Filter", desc: "Avoid trading around high-impact economic events" },
            { key: "fridayCloseProtection" as const, label: "Friday Close Protection", desc: "Stop taking new trades before Friday market close" },
          ].map((filter) => (
            <div key={filter.key} className="flex items-center justify-between bg-surface-2 rounded-xl p-3">
              <div>
                <div className="text-xs font-medium text-foreground">{filter.label}</div>
                <div className="text-[10px] text-muted">{filter.desc}</div>
              </div>
              <button onClick={() => updateSettings({ [filter.key]: !settings[filter.key] })}
                className={cn("w-10 h-5 rounded-full relative transition-smooth", settings[filter.key] ? "bg-accent" : "bg-surface-3")}>
                <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", settings[filter.key] ? "left-5" : "left-0.5")} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Sessions */}
      <div className="glass-card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">Trading Sessions</h4>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "london", label: "London" },
            { id: "newyork", label: "New York" },
            { id: "asia", label: "Asia" },
            { id: "overlap", label: "Overlap" },
          ].map((session) => (
            <button key={session.id} onClick={() => toggleSession(session.id)}
              className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
                settings.allowedSessions.includes(session.id) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
              {session.label}
            </button>
          ))}
        </div>
      </div>

      {/* Config summary */}
      <div className="glass-card p-5 bg-accent/5 border-accent/20">
        <h4 className="text-sm font-semibold text-foreground mb-2">{botName} — Config Summary</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between"><span className="text-muted">Pairs</span><span className="text-foreground">{settings.selectedPairs.length}</span></div>
          <div className="flex justify-between"><span className="text-muted">Sizing</span><span className="text-foreground">{settings.sizingMode === "fixed_lot" ? `${settings.fixedLotSize} lots` : `${settings.riskPercent}% risk`}</span></div>
          <div className="flex justify-between"><span className="text-muted">Min Score</span><span className="text-foreground">{settings.minScore}</span></div>
          <div className="flex justify-between"><span className="text-muted">Min R:R</span><span className="text-foreground">{settings.minRiskReward}:1</span></div>
          <div className="flex justify-between"><span className="text-muted">Max Open</span><span className="text-foreground">{settings.maxOpenPositions}</span></div>
          <div className="flex justify-between"><span className="text-muted">Max/Pair</span><span className="text-foreground">{settings.maxPerPair}</span></div>
          <div className="flex justify-between"><span className="text-muted">Drawdown</span><span className="text-foreground">{settings.dailyDrawdownPercent}%</span></div>
          <div className="flex justify-between"><span className="text-muted">Pause After</span><span className="text-foreground">{settings.pauseAfterLosses} losses</span></div>
          <div className="flex justify-between"><span className="text-muted">News Filter</span><span className={settings.newsFilter ? "text-bull-light" : "text-bear-light"}>{settings.newsFilter ? "On" : "Off"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Friday Protection</span><span className={settings.fridayCloseProtection ? "text-bull-light" : "text-bear-light"}>{settings.fridayCloseProtection ? "On" : "Off"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Sessions</span><span className="text-foreground">{settings.allowedSessions.join(", ") || "None"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Pre-Close</span><span className="text-foreground">{settings.preCloseBufferMinutes}min</span></div>
        </div>
      </div>
    </div>
  );
}
