"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ExecuteTradeButton } from "@/components/trading/ExecuteTradeButton";
import { computeOneR } from "@/lib/setups/one-r";
import { AdminRiskTargetBar, AdminLotSizeForCard } from "@/components/admin/AdminRiskTarget";
import { useStableSetups } from "@/lib/dashboard/use-stable-setups";
import { USER_MODES, applyUserMode, type UserMode } from "@/lib/mini/user-modes";
import { AnalysisModal } from "@/components/mini/AnalysisModal";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { useTheme } from "@/components/ui/ThemeProvider";

// ── Per-symbol Mini API response shape ─────────────────────────────
interface PerSymbolSignal {
  id: string;
  symbol: string;
  displayName: string;
  decimalPlaces: number;
  template: string;
  direction: string;
  entryTimeframe: string;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  entryType: string;
  score: number;
  grade: string;
  riskReward: number;
  explanation: string | null;
  invalidation: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  metadata: any;
}
interface PerSymbolResponse {
  symbol: string;
  displayName: string;
  decimalPlaces: number;
  category: string;
  signalsByTimeframe: Record<string, PerSymbolSignal | null>;
  timestamp: number;
}

const TF_ROW = ["5m", "15m", "1h"] as const;

// 7 MVP quick-pick symbols matching the FlowVision MVP set.
const QUICK_PICKS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "NAS100"] as const;

// Intraday Prediction tab — the front-end for the Market Prediction
// Mini engine. Polls /api/mini/signals every 60s. Top section is a
// live session/bias banner; main grid is filterable A+/A signal cards
// with per-card analysis modal.

interface ScoreBreakdown {
  biasAlignment: number;
  liquidityEvent: number;
  microStructure: number;
  entryZoneQuality: number;
  momentumDisplacement: number;
  volatilitySpread: number;
  riskReward: number;
  sessionTiming: number;
  total: number;
}

interface Signal {
  id: string;
  symbol: string;
  displayName: string;
  decimalPlaces: number;
  category: string;
  template: string;
  direction: string;
  biasTimeframe: string;
  entryTimeframe: string;
  speedClass: string;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  entryType: string;
  score: number;
  grade: string;
  biasState: string | null;
  session: string | null;
  expectedHoldMinutes: number;
  riskReward: number;
  explanation: string | null;
  invalidation: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  scoreBreakdown: ScoreBreakdown | null;
  metadata: any;
}

interface SessionState {
  phase: string;
  label: string;
  timingScore: number;
  newsLockout: boolean;
  hourUtc: number;
  minuteUtc: number;
  noTradeZone: boolean;
  noTradeReason?: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  liquidity_sweep_reversal:    "Liquidity Sweep Reversal",
  intraday_trend_continuation: "Intraday Trend Continuation",
  breakout_retest:             "Breakout Retest",
  vwap_reclaim:                "VWAP Reclaim",
  news_cooldown_continuation:  "News Cooldown Continuation",
  compression_breakout:        "Compression Breakout",
  inverse_fvg_flip:            "Inverse FVG Flip",
};

const SPEED_LABELS: Record<string, string> = {
  scalp_5m:      "Scalp 5m",
  intraday_15m:  "Intraday 15m",
  intraday_1h:   "Intraday 1h",
};

function fmt(n: number, dp: number): string {
  return dp > 0 ? n.toFixed(dp) : Math.round(n).toLocaleString();
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}
function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

const USER_MODE_KEY = "mini_user_mode";
const SELECTED_SYMBOL_KEY = "intraday_selected_symbol";

export default function IntradayPredictionPage() {
  const { theme } = useTheme();

  // ── Search-driven per-symbol view ─────────────────────────────────
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [perSymbol, setPerSymbol] = useState<PerSymbolResponse | null>(null);
  const [perSymbolLoading, setPerSymbolLoading] = useState(false);

  const filteredInstruments = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return ALL_INSTRUMENTS.filter(
      (i) => i.symbol.toLowerCase().includes(q) || i.displayName.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query]);

  // Hydrate last-selected symbol from localStorage.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SELECTED_SYMBOL_KEY);
      if (saved) setSelectedSymbol(saved);
    } catch { /* ignore */ }
  }, []);

  // Fetch per-symbol Mini signals (latest per timeframe) on selection
  // change + every 30s while the symbol is selected.
  useEffect(() => {
    if (!selectedSymbol) { setPerSymbol(null); return; }
    let cancelled = false;
    async function load() {
      try {
        setPerSymbolLoading(true);
        const res = await fetch(`/api/mini/by-symbol?symbol=${encodeURIComponent(selectedSymbol!)}&t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setPerSymbol(data);
      } catch (e) {
        console.error("Failed to load per-symbol signals:", e);
      } finally {
        if (!cancelled) setPerSymbolLoading(false);
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [selectedSymbol]);

  function handleSelectInstrument(symbol: string) {
    setSelectedSymbol(symbol);
    setQuery("");
    setShowDropdown(false);
    try { window.localStorage.setItem(SELECTED_SYMBOL_KEY, symbol); } catch { /* ignore */ }
  }
  function handleClearSelection() {
    setSelectedSymbol(null);
    try { window.localStorage.removeItem(SELECTED_SYMBOL_KEY); } catch { /* ignore */ }
  }

  const [templateFilter, setTemplateFilter] = useState<"all" | string>("all");
  const [symbolFilter, setSymbolFilter] = useState<"all" | string>("all");
  const [gradeFilter, setGradeFilter] = useState<"A_PLUS_AND_A" | "A+" | "A">("A_PLUS_AND_A");
  const [userMode, setUserMode] = useState<UserMode>("day_trader");

  // Hydrate user mode from localStorage once on mount.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(USER_MODE_KEY);
      if (saved && (saved === "scalper" || saved === "day_trader" || saved === "confirmation" || saved === "aggressive")) {
        setUserMode(saved);
      }
    } catch { /* localStorage unavailable */ }
  }, []);
  const updateUserMode = (m: UserMode) => {
    setUserMode(m);
    try { window.localStorage.setItem(USER_MODE_KEY, m); } catch { /* ignore */ }
  };

  const [signals, setSignals] = useState<Signal[]>([]);
  const [forming, setForming] = useState<Signal[]>([]);
  const [missed, setMissed] = useState<Signal[]>([]);
  const [modalSignal, setModalSignal] = useState<Signal | null>(null);
  // Map of signal-id → open smart-exit alert array. Lets the live cards
  // show a critical/warning ribbon without opening the modal.
  const [smartExitMap, setSmartExitMap] = useState<Record<string, Array<{ alertType: string; severity: string; evidence: string }>>>({});
  const [facets, setFacets] = useState<{ templates: string[]; symbols: string[]; grades: string[] }>({ templates: [], symbols: [], grades: [] });
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  const gradeQuery = useMemo(() => {
    switch (gradeFilter) {
      case "A+": return "A+";
      case "A": return "A";
      default: return "A+,A";
    }
  }, [gradeFilter]);

  useEffect(() => {
    let cancelled = false;
    async function load(viaInterval: boolean) {
      if (viaInterval && pausedRef.current) return;
      try {
        const baseParams = (status: string) => new URLSearchParams({
          status,
          template: templateFilter,
          symbol: symbolFilter,
          grade: gradeQuery,
          t: String(Date.now()),
        });
        const [sigRes, formingRes, missedRes, sessRes] = await Promise.all([
          // Active = waiting_for_entry, entry_active, in_trade — actionable now.
          fetch(`/api/mini/signals?${baseParams("waiting_for_entry,entry_active,in_trade")}`, { cache: "no-store" }),
          // Forming = scanning + forming — close to ready but missing one piece.
          fetch(`/api/mini/signals?${baseParams("scanning,forming")}&take=20`, { cache: "no-store" }),
          // Missed/Expired in last hour — for context.
          fetch(`/api/mini/signals?${baseParams("missed_move,expired")}&take=15`, { cache: "no-store" }),
          fetch(`/api/mini/session-state?t=${Date.now()}`, { cache: "no-store" }),
        ]);
        const sigData = await sigRes.json();
        const formingData = await formingRes.json();
        const missedData = await missedRes.json();
        const sessData = await sessRes.json();
        if (!cancelled) {
          if (Array.isArray(sigData.signals))     setSignals(sigData.signals);
          if (Array.isArray(formingData.signals)) setForming(formingData.signals);
          if (Array.isArray(missedData.signals))  setMissed(missedData.signals);
          if (sigData.facets) setFacets(sigData.facets);
          if (sessData?.phase) setSession(sessData);
          setLastUpdated(sigData.timestamp ?? Date.now());
        }
      } catch (e) {
        console.error("Failed to load Intraday Prediction:", e);
      }
      if (!cancelled) setLoading(false);
    }
    load(false);
    const id = setInterval(() => load(true), 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [templateFilter, symbolFilter, gradeQuery]);

  // Pull open smart-exit alerts for every active signal whenever the
  // signal list changes. Single batched effort — N small fetches in
  // parallel, throttled by the parent poll cadence.
  useEffect(() => {
    let cancelled = false;
    const ids = signals
      .filter((s) => s.status === "entry_active" || s.status === "in_trade")
      .map((s) => s.id);
    if (ids.length === 0) {
      if (!cancelled) setSmartExitMap({});
      return () => { cancelled = true; };
    }
    Promise.all(ids.map((id) =>
      fetch(`/api/mini/signals/${id}/smart-exit?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => ({ id, alerts: Array.isArray(data.alerts) ? data.alerts : [] }))
        .catch(() => ({ id, alerts: [] })),
    )).then((results) => {
      if (cancelled) return;
      const map: Record<string, Array<{ alertType: string; severity: string; evidence: string }>> = {};
      for (const { id, alerts } of results) {
        if (alerts.length > 0) map[id] = alerts;
      }
      setSmartExitMap(map);
    });
    return () => { cancelled = true; };
  }, [signals]);

  const getId = useCallback((s: Signal) => s.id, []);
  const userModeFilteredSignals = useMemo(() => applyUserMode(signals, userMode), [signals, userMode]);
  const { items: stable, changedIds } = useStableSetups(userModeFilteredSignals, getId, paused);

  const counts = useMemo(() => {
    const aPlus = stable.filter((s) => s.grade === "A+").length;
    const a = stable.filter((s) => s.grade === "A").length;
    const byTemplate: Record<string, number> = {};
    for (const s of stable) byTemplate[s.template] = (byTemplate[s.template] ?? 0) + 1;
    return { aPlus, a, total: aPlus + a, byTemplate };
  }, [stable]);

  const ageSec = lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000) : null;
  const sessionPhaseClass = session?.noTradeZone
    ? "bg-bear/10 text-bear-light border-bear/30"
    : session?.timingScore && session.timingScore >= 4
      ? "bg-bull/10 text-bull-light border-bull/30"
      : "bg-warn/10 text-warn-light border-warn/30";

  return (
    <div
      className="space-y-6"
      onMouseEnter={() => { pausedRef.current = true; setPaused(true); }}
      onMouseLeave={() => { pausedRef.current = false; setPaused(false); }}
    >
      <AdminRiskTargetBar />

      {/* Search-driven per-symbol view ─────────────────────────────────
          Mirrors the Market Prediction tab's UX: type to find any pair,
          see live 5m / 15m / 1h prediction cards, and a TradingView
          chart. Each TF renders "No Trade" when the brain has no alive
          signal for that timeframe. */}
      <div className="space-y-3">
        <div className="relative max-w-lg">
          <div className="glass-card flex items-center px-4 py-3 gap-3">
            <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder='Search any pair (e.g. "EUR", "XAU", "BTC")'
              className="bg-transparent outline-none text-foreground text-sm flex-1 placeholder:text-muted"
            />
          </div>
          {showDropdown && filteredInstruments.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 border border-border/50 rounded-lg shadow-xl z-50 overflow-hidden">
              {filteredInstruments.map((inst) => (
                <button
                  key={inst.symbol}
                  onMouseDown={() => handleSelectInstrument(inst.symbol)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-2/80 transition-smooth flex items-center justify-between"
                >
                  <div>
                    <span className="text-sm font-semibold text-foreground">{inst.displayName}</span>
                    <span className="text-xs text-muted ml-2 capitalize">{inst.category}</span>
                  </div>
                  <span className="text-xs text-muted font-mono">{inst.symbol}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick-pick row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted">Quick pick</span>
          {QUICK_PICKS.map((sym) => (
            <button
              key={sym}
              onClick={() => handleSelectInstrument(sym)}
              className={cn(
                "px-2 py-1 rounded text-[11px] font-mono border transition-smooth",
                selectedSymbol === sym ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50 hover:bg-surface-3",
              )}
            >
              {sym}
            </button>
          ))}
          {selectedSymbol && (
            <button
              onClick={handleClearSelection}
              className="ml-auto px-2 py-1 rounded text-[11px] text-muted hover:text-foreground transition-smooth"
              title="Clear selection and view the global feed"
            >
              ✕ clear
            </button>
          )}
        </div>
      </div>

      {/* Per-symbol view — only renders when a symbol is picked */}
      {selectedSymbol && (
        <PerSymbolPanel
          symbol={selectedSymbol}
          data={perSymbol}
          loading={perSymbolLoading}
          theme={theme}
          onOpenAnalysis={(s) => setModalSignal(s)}
        />
      )}

      {/* Header + session banner */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Intraday Prediction</h1>
          <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20 pulse-live">Live</span>
          {ageSec != null && (
            <span className="text-xs text-muted">
              Last updated {ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`} · refreshes every 60s
            </span>
          )}
          {paused && (
            <span className="text-[11px] text-warn-light bg-warn/10 border border-warn/30 px-2 py-0.5 rounded-full">
              ⏸ paused while interacting
            </span>
          )}
        </div>
        <p className="text-sm text-muted max-w-3xl">
          Fast intraday brain. Signals expire in 15-75 minutes — these are scalp-to-day-trade opportunities, not swings. Default surfaces only A+ and A grades; brain re-scans every 2 minutes.
        </p>
      </div>

      <div className={cn("glass-card p-4 flex items-center justify-between gap-4 flex-wrap border", sessionPhaseClass)}>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider opacity-70">Session</div>
            <div className="text-lg font-bold">{session?.label ?? "—"}</div>
          </div>
          <div className="w-px h-10 bg-current opacity-20" />
          <div>
            <div className="text-[10px] uppercase tracking-wider opacity-70">Timing Score</div>
            <div className="text-lg font-bold font-mono">{session?.timingScore ?? "-"}/5</div>
          </div>
          {session?.noTradeZone && (
            <span className="text-[11px] uppercase font-bold px-2 py-1 rounded bg-bear text-white">
              No-Trade Zone — {session.noTradeReason}
            </span>
          )}
          {session?.newsLockout && (
            <span className="text-[11px] uppercase font-bold px-2 py-1 rounded bg-warn text-foreground">
              News Lockout
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Tally label="A+" value={counts.aPlus} tone="bull" />
          <Tally label="A"  value={counts.a}     tone="accent" />
          <Tally label="Total" value={counts.total} tone="neutral" />
        </div>
      </div>

      {/* User Mode picker */}
      <div className="glass-card p-3 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-muted shrink-0">Mode</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.keys(USER_MODES) as UserMode[]).map((m) => {
            const cfg = USER_MODES[m];
            const active = userMode === m;
            return (
              <button
                key={m}
                onClick={() => updateUserMode(m)}
                title={cfg.description}
                className={cn(
                  "px-3 py-1 rounded-lg text-[11px] font-medium transition-smooth border",
                  active ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50 hover:bg-surface-3",
                )}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-muted ml-auto max-w-md text-right">{USER_MODES[userMode].description}</span>
      </div>

      {/* Filter row */}
      <div className="space-y-2">
        <FilterRow
          label="Template"
          value={templateFilter}
          options={facets.templates}
          onChange={setTemplateFilter}
          renderOption={(opt) => (
            <span>
              {TEMPLATE_LABELS[opt] ?? opt}
              {(counts.byTemplate[opt] ?? 0) > 0 && <span className="ml-1.5 text-[10px] opacity-70">{counts.byTemplate[opt]}</span>}
            </span>
          )}
        />
        <FilterRow
          label="Symbol"
          value={symbolFilter}
          options={facets.symbols}
          onChange={setSymbolFilter}
          renderOption={(opt) => <span className="font-mono">{opt}</span>}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-muted w-24 shrink-0">Grade</span>
          {(["A_PLUS_AND_A", "A+", "A"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGradeFilter(g)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
                gradeFilter === g ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50",
              )}
            >
              {g === "A_PLUS_AND_A" ? "A+ and A" : g === "A+" ? "A+ only" : "A only"}
            </button>
          ))}
        </div>
      </div>

      {/* Signal grid */}
      {loading ? (
        <div className="glass-card p-12 text-center text-sm text-muted">Scanning the intraday landscape…</div>
      ) : stable.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-2">
          <div className="text-3xl">⚡</div>
          <p className="text-sm text-muted">No fast intraday opportunities right now.</p>
          <p className="text-[11px] text-muted-light max-w-md mx-auto">
            Mini suppresses anything below A grade — by design. Most of the day, the answer is "nothing&apos;s clean enough yet".
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {stable.map((s) => {
            const isBuy = s.direction === "bullish";
            const justUpdated = changedIds.has(s.id);
            const oneR = computeOneR((s.entryZoneLow + s.entryZoneHigh) / 2, s.stopLoss, s.direction);
            const expanded = expandedId === s.id;
            return (
              <div
                key={s.id}
                className={cn(
                  "glass-card overflow-hidden transition-all duration-300",
                  justUpdated && "ring-2 ring-accent/40 shadow-lg shadow-accent/10",
                )}
              >
                <div className={cn("h-1", isBuy ? "bg-bull" : "bg-bear")} />
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <h3 className="text-base font-bold text-foreground truncate">{s.displayName}</h3>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border",
                        isBuy ? "bg-bull/15 text-bull-light border-bull/30" : "bg-bear/15 text-bear-light border-bear/30")}>
                        {isBuy ? "▲ Long" : "▼ Short"}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase border bg-accent/10 text-accent-light border-accent/30">
                        {TEMPLATE_LABELS[s.template] ?? s.template}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded",
                        s.grade === "A+" ? "bg-bull/20 text-bull-light" : "bg-accent/20 text-accent-light")}>
                        {s.grade}
                      </span>
                      <span className="text-xs font-mono text-accent-light">{s.score}<span className="text-muted text-[10px]">/100</span></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted flex-wrap">
                    <span className="bg-surface-2 px-2 py-0.5 rounded font-mono">{s.entryTimeframe} entry</span>
                    <span className="bg-surface-2 px-2 py-0.5 rounded">{SPEED_LABELS[s.speedClass] ?? s.speedClass}</span>
                    <span className="bg-surface-2 px-2 py-0.5 rounded capitalize">{s.status.replace(/_/g, " ")}</span>
                    <span>{timeAgo(s.createdAt)}</span>
                    <span className="text-warn-light">expires in {expiresIn(s.expiresAt)}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px] font-mono">
                    <Lvl label="Entry"
                      value={`${fmt(s.entryZoneLow, s.decimalPlaces)} – ${fmt(s.entryZoneHigh, s.decimalPlaces)}`}
                      tone="neutral" />
                    <Lvl label="Stop" value={fmt(s.stopLoss, s.decimalPlaces)} tone="bear" />
                    <Lvl label="1R"   value={fmt(oneR, s.decimalPlaces)} tone="accent" />
                    <Lvl label="TP1"  value={fmt(s.takeProfit1, s.decimalPlaces)} tone="bull" />
                    {s.takeProfit2 != null && <Lvl label="TP2" value={fmt(s.takeProfit2, s.decimalPlaces)} tone="bull" />}
                  </div>

                  <AdminLotSizeForCard symbol={s.symbol} entry={(s.entryZoneLow + s.entryZoneHigh) / 2} stopLoss={s.stopLoss} />

                  {/* Smart-exit alert ribbon — shows on live cards when the
                      monitor has flagged conditions degrading. */}
                  {smartExitMap[s.id]?.length ? (
                    <div className="space-y-1">
                      {smartExitMap[s.id].map((a, i) => (
                        <div key={i} className={cn(
                          "rounded border p-1.5 text-[10px] flex items-start gap-2",
                          a.severity === "critical" ? "bg-bear/10 border-bear/30 text-bear-light" : "bg-warn/10 border-warn/30 text-warn-light",
                        )}>
                          <span className="font-bold uppercase shrink-0">⚠ {a.alertType.replace(/_/g, " ")}</span>
                          <span className="opacity-90">{a.evidence}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {s.explanation && (
                    <p className="text-[11px] text-muted-light leading-relaxed">{s.explanation}</p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setExpandedId(expanded ? null : s.id)}
                        className="text-[11px] text-accent-light hover:text-accent transition-smooth"
                      >
                        {expanded ? "▲ less" : "▼ score + gates"}
                      </button>
                      <button
                        onClick={() => setModalSignal(s)}
                        className="text-[11px] text-muted hover:text-foreground transition-smooth"
                      >
                        full analysis →
                      </button>
                    </div>
                    <ExecuteTradeButton
                      setup={{
                        symbol: s.symbol,
                        direction: isBuy ? "buy" : "sell",
                        entry: (s.entryZoneLow + s.entryZoneHigh) / 2,
                        stopLoss: s.stopLoss,
                        takeProfit: s.takeProfit1,
                        takeProfit2: s.takeProfit2,
                        timeframe: s.entryTimeframe,
                        setupType: `mini_${s.template}`,
                        qualityGrade: s.grade,
                        confidenceScore: s.score,
                        sourceType: "setup",
                        sourceRef: s.id,
                      }}
                    />
                  </div>

                  {expanded && (
                    <div className="pt-3 border-t border-border/30 space-y-3 text-[11px]">
                      {s.scoreBreakdown && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Score Breakdown</div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            <ScorePill label="Bias"      value={s.scoreBreakdown.biasAlignment}     max={15} />
                            <ScorePill label="Liquidity" value={s.scoreBreakdown.liquidityEvent}    max={15} />
                            <ScorePill label="Structure" value={s.scoreBreakdown.microStructure}    max={15} />
                            <ScorePill label="Zone"      value={s.scoreBreakdown.entryZoneQuality} max={15} />
                            <ScorePill label="Momentum"  value={s.scoreBreakdown.momentumDisplacement} max={15} />
                            <ScorePill label="Vol/Sprd"  value={s.scoreBreakdown.volatilitySpread} max={10} />
                            <ScorePill label="RR"        value={s.scoreBreakdown.riskReward}       max={10} />
                            <ScorePill label="Session"   value={s.scoreBreakdown.sessionTiming}    max={5} />
                          </div>
                        </div>
                      )}
                      {Array.isArray(s.metadata?.gates) && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Gates</div>
                          <div className="space-y-1">
                            {s.metadata.gates.map((g: any, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-[11px]">
                                <span className={cn("mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0",
                                  g.passed ? "bg-bull/30 text-bull-light" : "bg-bear/15 text-bear-light/70")}>
                                  <span className="text-[10px]">{g.passed ? "✓" : "✗"}</span>
                                </span>
                                <div className="min-w-0 flex-1">
                                  <span className={cn("font-semibold", g.hard && !g.passed ? "text-bear-light" : "text-foreground")}>{g.label}</span>
                                  {g.hard && <span className="ml-1 text-[9px] uppercase opacity-60">hard</span>}
                                  <div className="text-[10px] text-muted leading-snug">{g.evidence}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {s.invalidation && (
                        <p className="text-warn-light bg-warn/5 border border-warn/20 rounded-lg p-2 leading-relaxed">
                          <span className="font-semibold">Invalidation:</span> {s.invalidation}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Forming Setups section — scanning + forming statuses ─────── */}
      {forming.length > 0 && (
        <section className="space-y-3 pt-4 border-t border-border/30">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-light">⏳ Forming Setups</h2>
            <span className="text-[10px] text-muted">{forming.length} candidate{forming.length === 1 ? "" : "s"} one confirmation away</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {forming.map((s) => (
              <CompactCard key={s.id} signal={s} tone="forming" />
            ))}
          </div>
        </section>
      )}

      {/* ── Missed Moves section — recently missed/expired ───────────── */}
      {missed.length > 0 && (
        <section className="space-y-3 pt-4 border-t border-border/30">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-light">↗ Missed / Expired</h2>
            <span className="text-[10px] text-muted">{missed.length} signal{missed.length === 1 ? "" : "s"} that ran or aged out — review only</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {missed.map((s) => (
              <CompactCard key={s.id} signal={s} tone="missed" />
            ))}
          </div>
        </section>
      )}

      {/* Per-signal Analysis modal */}
      <AnalysisModal signal={modalSignal} open={modalSignal !== null} onClose={() => setModalSignal(null)} />

      {/* ── No-Trade Warnings ──────────────────────────────────────────── */}
      {(session?.noTradeZone || session?.newsLockout) && (
        <section className="space-y-3 pt-4 border-t border-bear/30">
          <div className="glass-card p-4 border border-bear/30 bg-bear/5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⛔</span>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-bear-light">No-Trade Window</h2>
                <p className="text-[12px] text-muted-light mt-1">
                  {session.newsLockout
                    ? "News lockout is active. The Mini engine will not generate new signals until the lockout window passes."
                    : `Session phase = ${session.label}. ${session.noTradeReason ?? "Trade quality drops outside active sessions."}`}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function CompactCard({ signal: s, tone }: { signal: Signal; tone: "forming" | "missed" }) {
  const isBuy = s.direction === "bullish";
  const toneCls = tone === "forming"
    ? "border-warn/30 bg-warn/5"
    : "border-muted/30 bg-muted/5 opacity-70";
  return (
    <div className={cn("glass-card overflow-hidden border", toneCls)}>
      <div className={cn("h-0.5", isBuy ? "bg-bull" : "bg-bear")} />
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-bold">{s.displayName}</span>
          <span className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded",
            s.grade === "A+" ? "bg-bull/15 text-bull-light"
            : s.grade === "A" ? "bg-accent/15 text-accent-light"
            : "bg-muted/20 text-muted",
          )}>
            {s.grade}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-muted">
          <span className={cn("px-1.5 py-0.5 rounded uppercase font-bold",
            isBuy ? "bg-bull/10 text-bull-light" : "bg-bear/10 text-bear-light")}>
            {isBuy ? "long" : "short"}
          </span>
          <span className="bg-surface-2 px-1.5 py-0.5 rounded">{TEMPLATE_LABELS[s.template] ?? s.template}</span>
          <span className="font-mono">{s.entryTimeframe}</span>
        </div>
        <div className="text-[10px] text-muted-light">
          {tone === "forming"
            ? `Score ${s.score}/100 · ${s.status.replace(/_/g, " ")} · expires ${expiresIn(s.expiresAt)}`
            : `Score was ${s.score}/100 · ${s.status === "missed_move" ? "ran past entry" : "expired"} ${timeAgo(s.createdAt)}`}
        </div>
      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────

function FilterRow({
  label, value, options, onChange, renderOption,
}: {
  label: string;
  value: "all" | string;
  options: string[];
  onChange: (v: "all" | string) => void;
  renderOption: (opt: string) => React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wider text-muted w-24 shrink-0">{label}</span>
      <button onClick={() => onChange("all")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
        value === "all" ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50")}>All</button>
      {options.map((opt) => (
        <button key={opt} onClick={() => onChange(opt)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
          value === opt ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted-light border-border/50")}>{renderOption(opt)}</button>
      ))}
    </div>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: "bull" | "accent" | "neutral" }) {
  const cls = tone === "bull" ? "text-bull-light" : tone === "accent" ? "text-accent-light" : "text-foreground";
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase opacity-70">{label}</div>
      <div className={cn("text-2xl font-bold", cls)}>{value}</div>
    </div>
  );
}

function Lvl({ label, value, tone }: { label: string; value: string; tone: "bull" | "bear" | "accent" | "neutral" }) {
  const cls = tone === "bull" ? "bg-bull/5 border-bull/20 text-bull-light"
            : tone === "bear" ? "bg-bear/5 border-bear/20 text-bear-light"
            : tone === "accent" ? "bg-accent/5 border-accent/20 text-accent-light"
            : "bg-surface-3/40 border-border/30 text-foreground";
  const labelCls = tone === "bull" ? "text-bull-light"
                : tone === "bear" ? "text-bear-light"
                : tone === "accent" ? "text-accent-light"
                : "text-muted";
  return (
    <div className={cn("rounded-lg border p-2 text-center", cls)}>
      <div className={cn("text-[9px] uppercase mb-0.5", labelCls)}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function ScorePill({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? value / max : 0;
  const tone = pct >= 0.8 ? "text-bull-light bg-bull/10" : pct >= 0.5 ? "text-accent-light bg-accent/10" : "text-muted bg-surface-2";
  return (
    <div className={cn("rounded p-1.5 text-center border border-border/20", tone)}>
      <div className="text-[9px] uppercase opacity-70">{label}</div>
      <div className="text-[11px] font-mono font-bold">{value}<span className="opacity-50">/{max}</span></div>
    </div>
  );
}

// ── Per-symbol panel ─────────────────────────────────────────────────
// Renders three TF prediction cards (5m / 15m / 1h) plus a TradingView
// chart for the selected pair. Each TF card either shows the live Mini
// signal for that timeframe or a "No Trade" placeholder.

function PerSymbolPanel({
  symbol, data, loading, theme, onOpenAnalysis,
}: {
  symbol: string;
  data: PerSymbolResponse | null;
  loading: boolean;
  theme: string;
  onOpenAnalysis: (s: Signal) => void;
}) {
  const display = data?.displayName ?? symbol;
  const signalsByTf = data?.signalsByTimeframe ?? {};

  return (
    <div className="space-y-4">
      {/* Symbol header */}
      <div className="glass-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-foreground">{display}</h2>
            <span className="text-[10px] uppercase text-muted bg-surface-2 px-2 py-0.5 rounded">{data?.category ?? "—"}</span>
            <span className="text-[10px] text-muted">{symbol}</span>
          </div>
          <div className="text-[11px] text-muted mt-1">
            Live 5m / 15m / 1h predictions from the Mini engine. Brain re-scans every 2 min.
          </div>
        </div>
        {loading && <span className="text-[10px] text-muted">scanning…</span>}
      </div>

      {/* Three TF prediction cards side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {TF_ROW.map((tf) => {
          const sig = signalsByTf[tf] ?? null;
          return <TfCard key={tf} timeframe={tf} signal={sig} onOpenAnalysis={onOpenAnalysis} symbolDecimals={data?.decimalPlaces ?? 5} />;
        })}
      </div>

      {/* TradingView chart */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-wider text-muted">Live chart · {display}</div>
        <TradingViewWidget symbol={symbol} theme={theme as "dark" | "light"} height={520} autosize />
      </div>
    </div>
  );
}

function TfCard({ timeframe, signal, onOpenAnalysis, symbolDecimals }: {
  timeframe: "5m" | "15m" | "1h";
  signal: PerSymbolSignal | null;
  onOpenAnalysis: (s: Signal) => void;
  symbolDecimals: number;
}) {
  if (!signal) {
    return (
      <div className="glass-card border border-bear/20 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted font-mono">{timeframe}</span>
          <span className="text-[10px] uppercase text-bear-light bg-bear/10 border border-bear/30 px-2 py-0.5 rounded font-bold">No Trade</span>
        </div>
        <div className="flex items-center gap-2 py-2">
          <svg className="w-4 h-4 text-bear-light shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <span className="text-[12px] text-muted-light">No clean setup on {timeframe} right now.</span>
        </div>
        <p className="text-[10px] text-muted leading-relaxed">
          The Mini engine suppresses anything below A grade. Wait for the next 2-min scan or pick a different pair.
        </p>
      </div>
    );
  }

  const isBuy = signal.direction === "bullish" || signal.direction === "buy" || signal.direction === "long";
  const oneR = computeOneR((signal.entryZoneLow + signal.entryZoneHigh) / 2, signal.stopLoss, signal.direction);

  return (
    <div className="glass-card overflow-hidden">
      <div className={cn("h-1", isBuy ? "bg-bull" : "bg-bear")} />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted font-mono">{timeframe}</span>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border",
              isBuy ? "bg-bull/15 text-bull-light border-bull/30" : "bg-bear/15 text-bear-light border-bear/30",
            )}>
              {isBuy ? "▲ Long" : "▼ Short"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded",
              signal.grade === "A+" ? "bg-bull/20 text-bull-light" : "bg-accent/20 text-accent-light",
            )}>
              {signal.grade}
            </span>
            <span className="text-xs font-mono text-accent-light">{signal.score}<span className="text-[10px] text-muted">/100</span></span>
          </div>
        </div>

        <div className="text-[11px] text-muted-light truncate">{signal.template.replace(/_/g, " ")}</div>

        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
          <Lvl label="Entry" value={`${fmt(signal.entryZoneLow, symbolDecimals)} – ${fmt(signal.entryZoneHigh, symbolDecimals)}`} tone="neutral" />
          <Lvl label="Stop"  value={fmt(signal.stopLoss, symbolDecimals)} tone="bear" />
          <Lvl label="1R"    value={fmt(oneR, symbolDecimals)} tone="accent" />
          <Lvl label="TP1"   value={fmt(signal.takeProfit1, symbolDecimals)} tone="bull" />
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted">
          <span>RR {signal.riskReward.toFixed(2)} · {signal.status.replace(/_/g, " ")}</span>
          <span>expires {expiresIn(signal.expiresAt)}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => onOpenAnalysis(signal as unknown as Signal)}
            className="text-[11px] text-accent-light hover:text-accent transition-smooth"
          >
            full analysis →
          </button>
          <ExecuteTradeButton
            setup={{
              symbol: signal.symbol,
              direction: isBuy ? "buy" : "sell",
              entry: (signal.entryZoneLow + signal.entryZoneHigh) / 2,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit1,
              takeProfit2: signal.takeProfit2,
              timeframe: signal.entryTimeframe,
              setupType: `mini_${signal.template}`,
              qualityGrade: signal.grade,
              confidenceScore: signal.score,
              sourceType: "setup",
              sourceRef: signal.id,
            }}
          />
        </div>
      </div>
    </div>
  );
}
