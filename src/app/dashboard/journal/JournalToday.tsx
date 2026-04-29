"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const STRATEGIES = [
  "inverse_fvg", "supply_demand", "breakout_retest", "liquidity_sweep",
  "order_block", "support_resistance", "vwap_rejection", "trend_pullback",
  "news_trade", "scalping", "swing", "other",
];

const MISTAKE_TAGS = [
  "entered_too_early", "chased_price", "ignored_htf", "ignored_news",
  "risked_too_much", "moved_stop", "closed_too_early", "revenge_trading",
  "overtrading", "low_quality_setup", "no_plan", "wrong_session",
];

const EMOTIONS = [
  "calm", "confident", "anxious", "frustrated", "tired",
  "overconfident", "fearful", "patient", "rushed", "doubtful",
];

const SESSIONS = ["asia", "london", "newyork", "overlap", "other"];

const GRADES = ["A+", "A", "B", "C", "D", "F"];

interface Entry {
  id: string;
  symbol: string;
  direction: string;
  entry: number;
  exit: number | null;
  stopLoss: number;
  takeProfit: number | null;
  positionSize: number;
  realizedPnl: number | null;
  rMultiple: number | null;
  outcome: "win" | "loss" | null;
  openedAt: string;
  closedAt: string | null;
  session: string | null;
  timeframe: string | null;
  strategy: string | null;
  qualityGrade: string | null;
  emotionBefore: string | null;
  emotionDuring: string | null;
  emotionAfter: string | null;
  mistakes: string[];
  rulesFollowed: boolean;
  notes: string | null;
  lessonLearned: string | null;
  tradeQualityScore: number | null;
}

interface Day {
  date: string;
  preMarketBias: string | null;
  marketView: string | null;
  planAdherence: number | null;
  overtraded: boolean;
  hitDailyLimit: boolean;
  topMistake: string | null;
  lessonLearned: string | null;
  tomorrowsFocus: string | null;
  notes: string | null;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

const todayKey = (): string => new Date().toISOString().slice(0, 10);

export function JournalToday() {
  const date = todayKey();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [showLogger, setShowLogger] = useState(false);

  const reload = useCallback(async () => {
    try {
      const startUTC = `${date}T00:00:00.000Z`;
      const endUTC = `${date}T23:59:59.999Z`;
      const [entryRes, dayRes] = await Promise.all([
        fetch(`/api/journal/entries?from=${encodeURIComponent(startUTC)}&to=${encodeURIComponent(endUTC)}`, { cache: "no-store" }),
        fetch(`/api/journal/days/${date}`, { cache: "no-store" }),
      ]);
      if (entryRes.status === 401) { setAuthError(true); return; }
      const entryData = await entryRes.json();
      const dayData = await dayRes.json();
      // Defensive: a malformed server response could return success:true
      // without an `entries` array. Guarding against that prevents the
      // .map() at render time from crashing the whole tab.
      if (entryData?.success && Array.isArray(entryData.entries)) {
        setEntries(entryData.entries);
      }
      if (dayData?.success && dayData.day) setDay(dayData.day);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void reload(); }, [reload]);

  if (authError) {
    return (
      <div className="glass-card p-8 text-center text-sm text-muted-light">
        Sign in to use the journal — it persists per-account so your trades, notes, and stats follow you across devices.
      </div>
    );
  }

  if (loading) {
    return <div className="glass-card p-8 text-center text-sm text-muted">Loading today's journal…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Daily summary tiles */}
      {day && <DailySummaryTiles day={day} />}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowLogger((s) => !s)}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-medium transition-smooth"
        >
          {showLogger ? "Close logger" : "+ Log a trade"}
        </button>
        <span className="text-xs text-muted self-center ml-1">
          Logging is fastest with: symbol, direction, entry, SL, size — fill the rest after the trade closes.
        </span>
      </div>

      {showLogger && (
        <QuickLogger
          onSaved={() => { void reload(); setShowLogger(false); }}
        />
      )}

      {/* Pre-market plan / daily review */}
      <DailyReview date={date} initial={day} onSaved={() => { void reload(); }} />

      {/* Today's trades */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">
          Today's trades · {entries.length}
        </h2>
        {entries.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-sm text-muted">No trades logged today.</p>
            <p className="text-[11px] text-muted-light mt-1">
              Tap "+ Log a trade" above. Auto-imports from broker positions are coming.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} onUpdated={() => { void reload(); }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DailySummaryTiles({ day }: { day: Day }) {
  const winRate = day.wins + day.losses > 0 ? (day.wins / (day.wins + day.losses)) * 100 : null;
  const pnlClass = day.pnl > 0 ? "text-bull-light" : day.pnl < 0 ? "text-bear-light" : "text-foreground";
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted">Today's P&amp;L</div>
        <div className={cn("text-2xl font-bold mt-1", pnlClass)}>
          {day.pnl >= 0 ? "+" : ""}${Math.abs(day.pnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
      </div>
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted">Trades</div>
        <div className="text-2xl font-bold mt-1">{day.trades}</div>
        <div className="text-[10px] text-muted mt-0.5">{day.wins}W / {day.losses}L</div>
      </div>
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted">Win rate</div>
        <div className="text-2xl font-bold mt-1 text-accent-light">
          {winRate == null ? "—" : `${Math.round(winRate)}%`}
        </div>
      </div>
      <div className="glass-card p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted">Status</div>
        <div className={cn(
          "text-base font-semibold mt-1",
          day.hitDailyLimit ? "text-bear-light" : day.overtraded ? "text-warn" : day.pnl > 0 ? "text-bull-light" : "text-muted-light",
        )}>
          {day.hitDailyLimit ? "Daily limit hit" : day.overtraded ? "Overtraded" : day.pnl > 0 ? "Green day" : day.pnl < 0 ? "Red day" : "—"}
        </div>
      </div>
    </div>
  );
}

function QuickLogger({ onSaved }: { onSaved: () => void }) {
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [entry, setEntry] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [positionSize, setPositionSize] = useState("");
  const [riskAmount, setRiskAmount] = useState("");
  const [strategy, setStrategy] = useState("");
  const [session, setSession] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [emotionBefore, setEmotionBefore] = useState("");
  const [tradeQualityScore, setTradeQualityScore] = useState(70);
  const [outcome, setOutcome] = useState<"" | "win" | "loss">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!symbol || !entry || !stopLoss || !positionSize) {
      setError("Symbol, entry, stop loss, and position size are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/journal/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.toUpperCase().trim(),
          direction,
          entry: parseFloat(entry),
          stopLoss: parseFloat(stopLoss),
          takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
          positionSize: parseFloat(positionSize),
          riskAmount: riskAmount ? parseFloat(riskAmount) : undefined,
          strategy: strategy || undefined,
          session: session || undefined,
          timeframe: timeframe || undefined,
          emotionBefore: emotionBefore || undefined,
          tradeQualityScore,
          outcome: outcome || undefined,
          openedAt: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) onSaved();
      else setError(data.error ?? "Save failed");
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card p-4 space-y-3 border border-accent/30">
      <div className="text-sm font-semibold text-foreground">Quick log</div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        <Field label="Symbol" required>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="EURUSD" className="input-base" />
        </Field>
        <Field label="Direction" required>
          <div className="flex gap-1">
            {(["buy", "sell"] as const).map((d) => (
              <button key={d} onClick={() => setDirection(d)} className={cn(
                "flex-1 px-2 py-1 rounded text-[11px] capitalize border",
                direction === d
                  ? d === "buy" ? "bg-bull text-white border-bull" : "bg-bear text-white border-bear"
                  : "bg-surface-2 text-muted-light border-border/50",
              )}>{d}</button>
            ))}
          </div>
        </Field>
        <Field label="Entry" required>
          <input type="number" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} className="input-base font-mono" />
        </Field>
        <Field label="Stop loss" required>
          <input type="number" step="any" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className="input-base font-mono text-bear-light" />
        </Field>
        <Field label="Take profit">
          <input type="number" step="any" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} className="input-base font-mono text-bull-light" />
        </Field>
        <Field label="Lot size" required>
          <input type="number" step="any" value={positionSize} onChange={(e) => setPositionSize(e.target.value)} placeholder="0.10" className="input-base font-mono" />
        </Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Field label="Risk $">
          <input type="number" step="any" value={riskAmount} onChange={(e) => setRiskAmount(e.target.value)} className="input-base font-mono" />
        </Field>
        <Field label="Strategy">
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="input-base">
            <option value="">—</option>
            {STRATEGIES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="Session">
          <select value={session} onChange={(e) => setSession(e.target.value)} className="input-base">
            <option value="">—</option>
            {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Timeframe">
          <input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="15m" className="input-base" />
        </Field>
        <Field label="Mood before">
          <select value={emotionBefore} onChange={(e) => setEmotionBefore(e.target.value)} className="input-base">
            <option value="">—</option>
            {EMOTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      </div>

      <Field label={`Trade quality score: ${tradeQualityScore}`}>
        <input type="range" min="0" max="100" step="5" value={tradeQualityScore} onChange={(e) => setTradeQualityScore(parseInt(e.target.value, 10))} className="w-full" />
      </Field>

      <Field label="Outcome">
        <div className="flex gap-1">
          {([
            { v: "", label: "Open", cls: "bg-surface-2 text-muted-light border-border/50" },
            { v: "win", label: "Win", cls: "bg-bull text-white border-bull" },
            { v: "loss", label: "Loss", cls: "bg-bear text-white border-bear" },
          ] as const).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setOutcome(o.v)}
              className={cn(
                "flex-1 px-2 py-1 rounded text-[11px] capitalize border",
                outcome === o.v ? o.cls : "bg-surface-2 text-muted-light border-border/50",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>

      {error && <div className="text-[11px] text-bear-light bg-bear/10 border border-bear/30 rounded px-2 py-1">{error}</div>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-light disabled:opacity-40 text-white text-xs font-semibold"
        >
          {saving ? "Saving…" : "Log trade"}
        </button>
      </div>
      <style jsx>{`
        .input-base { width: 100%; padding: 6px 10px; border-radius: 6px; background: var(--surface-2); border: 1px solid var(--border); color: var(--foreground); font-size: 12px; }
        .input-base:focus { outline: none; border-color: var(--ac); }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">
        {label}{required && <span className="text-bear-light"> *</span>}
      </label>
      {children}
    </div>
  );
}

function DailyReview({ date, initial, onSaved }: { date: string; initial: Day | null; onSaved: () => void }) {
  const [marketView, setMarketView] = useState(initial?.marketView ?? "");
  const [preMarketBias, setPreMarketBias] = useState(initial?.preMarketBias ?? "");
  const [topMistake, setTopMistake] = useState(initial?.topMistake ?? "");
  const [lessonLearned, setLessonLearned] = useState(initial?.lessonLearned ?? "");
  const [tomorrowsFocus, setTomorrowsFocus] = useState(initial?.tomorrowsFocus ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [planAdherence, setPlanAdherence] = useState(initial?.planAdherence ?? 80);
  const [overtraded, setOvertraded] = useState(initial?.overtraded ?? false);
  const [hitDailyLimit, setHitDailyLimit] = useState(initial?.hitDailyLimit ?? false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!initial) return;
    setMarketView(initial.marketView ?? "");
    setPreMarketBias(initial.preMarketBias ?? "");
    setTopMistake(initial.topMistake ?? "");
    setLessonLearned(initial.lessonLearned ?? "");
    setTomorrowsFocus(initial.tomorrowsFocus ?? "");
    setNotes(initial.notes ?? "");
    setPlanAdherence(initial.planAdherence ?? 80);
    setOvertraded(initial.overtraded ?? false);
    setHitDailyLimit(initial.hitDailyLimit ?? false);
  }, [initial]);

  async function save() {
    const res = await fetch(`/api/journal/days/${date}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketView, preMarketBias, topMistake, lessonLearned, tomorrowsFocus, notes,
        planAdherence, overtraded, hitDailyLimit,
      }),
    });
    if (res.ok) {
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 1500);
      onSaved();
    }
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Daily plan &amp; review</h2>
        {savedAt && <span className="text-[10px] text-bull-light">✓ saved</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Pre-market bias</label>
          <input value={preMarketBias} onChange={(e) => setPreMarketBias(e.target.value)} placeholder="e.g. USD bullish into NFP, watch GBPUSD short" className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border focus:border-accent text-xs" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Top mistake today</label>
          <input value={topMistake} onChange={(e) => setTopMistake(e.target.value)} placeholder="entered too early" className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border focus:border-accent text-xs" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Market view</label>
        <textarea value={marketView} onChange={(e) => setMarketView(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border focus:border-accent text-xs resize-none" />
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Lesson learned</label>
        <textarea value={lessonLearned} onChange={(e) => setLessonLearned(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border focus:border-accent text-xs resize-none" />
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Tomorrow's focus (one rule)</label>
        <input value={tomorrowsFocus} onChange={(e) => setTomorrowsFocus(e.target.value)} placeholder='"only A-grade trades"' className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border focus:border-accent text-xs" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">
            Plan adherence: {planAdherence}%
          </label>
          <input type="range" min="0" max="100" step="5" value={planAdherence} onChange={(e) => setPlanAdherence(parseInt(e.target.value, 10))} className="w-full" />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-light cursor-pointer">
          <input type="checkbox" checked={overtraded} onChange={(e) => setOvertraded(e.target.checked)} className="accent-warn" />
          Overtraded today
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-light cursor-pointer">
          <input type="checkbox" checked={hitDailyLimit} onChange={(e) => setHitDailyLimit(e.target.checked)} className="accent-bear" />
          Hit daily loss limit
        </label>
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border focus:border-accent text-xs resize-none" />
      </div>
      <div className="flex justify-end">
        <button onClick={save} className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-light text-white text-xs font-semibold">Save daily review</button>
      </div>
    </div>
  );
}

function EntryCard({ entry: e, onUpdated }: { entry: Entry; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [exit, setExit] = useState<string>(e.exit?.toString() ?? "");
  const [realizedPnl, setRealizedPnl] = useState<string>(e.realizedPnl?.toString() ?? "");
  const [grade, setGrade] = useState<string>(e.qualityGrade ?? "");
  const [emotionAfter, setEmotionAfter] = useState<string>(e.emotionAfter ?? "");
  const [mistakes, setMistakes] = useState<string[]>(e.mistakes);
  const [notes, setNotes] = useState<string>(e.notes ?? "");
  const [lessonLearned, setLessonLearned] = useState<string>(e.lessonLearned ?? "");
  const [outcome, setOutcome] = useState<"" | "win" | "loss">(e.outcome ?? "");

  const isClosed = e.exit != null && e.realizedPnl != null;
  const isBuy = e.direction === "buy";
  const pnlClass = e.realizedPnl == null ? "text-muted" : e.realizedPnl > 0 ? "text-bull-light" : e.realizedPnl < 0 ? "text-bear-light" : "text-muted";

  function toggleMistake(m: string) {
    setMistakes((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }

  async function save() {
    await fetch(`/api/journal/entries/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exit: exit ? parseFloat(exit) : undefined,
        closedAt: exit ? new Date().toISOString() : undefined,
        realizedPnl: realizedPnl ? parseFloat(realizedPnl) : undefined,
        qualityGrade: grade || undefined,
        emotionAfter: emotionAfter || undefined,
        mistakes,
        notes,
        lessonLearned,
        // "" clears the outcome on the server; "win"/"loss" sets it.
        outcome,
      }),
    });
    onUpdated();
  }

  async function remove() {
    if (!confirm(`Delete this ${e.symbol} ${e.direction} log? This can't be undone.`)) return;
    await fetch(`/api/journal/entries/${e.id}`, { method: "DELETE" });
    onUpdated();
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className={cn("h-1", isBuy ? "bg-bull" : "bg-bear")} />
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{e.symbol}</span>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
              isBuy ? "badge-bull" : "badge-bear")}>{e.direction}</span>
            {e.timeframe && <span className="text-[10px] text-muted-light bg-surface-2 px-1.5 py-0.5 rounded">{e.timeframe}</span>}
            {e.strategy && <span className="text-[10px] text-accent-light bg-accent/10 px-1.5 py-0.5 rounded">{e.strategy.replace(/_/g, " ")}</span>}
            {e.qualityGrade && <span className="text-[10px] font-bold text-foreground bg-surface-3 px-1.5 py-0.5 rounded">{e.qualityGrade}</span>}
            {e.outcome === "win" && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-bull text-white" title="Winning trade">W</span>
            )}
            {e.outcome === "loss" && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-bear text-white" title="Losing trade">L</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-sm font-mono font-semibold", pnlClass)}>
              {e.realizedPnl == null ? "open" : `${e.realizedPnl >= 0 ? "+" : ""}$${e.realizedPnl.toFixed(2)}`}
            </span>
            {e.rMultiple != null && (
              <span className="text-[11px] text-muted-light font-mono">{e.rMultiple >= 0 ? "+" : ""}{e.rMultiple.toFixed(2)}R</span>
            )}
            <button onClick={() => setExpanded((x) => !x)} className="text-[11px] text-accent-light hover:text-accent">
              {expanded ? "Collapse" : "Edit"}
            </button>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2 text-[11px] font-mono text-muted-light">
          <span>Entry <span className="text-foreground">{e.entry}</span></span>
          <span>SL <span className="text-bear-light">{e.stopLoss}</span></span>
          {e.takeProfit && <span>TP <span className="text-bull-light">{e.takeProfit}</span></span>}
          <span>Size <span className="text-foreground">{e.positionSize}</span></span>
          {e.exit != null && <span>Exit <span className="text-foreground">{e.exit}</span></span>}
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
            {!isClosed && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Exit price">
                  <input type="number" step="any" value={exit} onChange={(e) => setExit(e.target.value)} className="w-full px-2 py-1 rounded bg-surface-2 border border-border text-xs font-mono" />
                </Field>
                <Field label="Realized P&L ($)">
                  <input type="number" step="any" value={realizedPnl} onChange={(e) => setRealizedPnl(e.target.value)} className="w-full px-2 py-1 rounded bg-surface-2 border border-border text-xs font-mono" />
                </Field>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Field label="Outcome">
                <div className="flex gap-1">
                  {([
                    { v: "", label: "Open", cls: "bg-surface-2 text-muted-light border-border/50" },
                    { v: "win", label: "Win", cls: "bg-bull text-white border-bull" },
                    { v: "loss", label: "Loss", cls: "bg-bear text-white border-bear" },
                  ] as const).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setOutcome(o.v)}
                      className={cn(
                        "flex-1 px-1.5 py-1 rounded text-[10px] capitalize border",
                        outcome === o.v ? o.cls : "bg-surface-2 text-muted-light border-border/50",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Grade">
                <select value={grade} onChange={(e) => setGrade(e.target.value)} className="w-full px-2 py-1 rounded bg-surface-2 border border-border text-xs">
                  <option value="">—</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Emotion after">
                <select value={emotionAfter} onChange={(e) => setEmotionAfter(e.target.value)} className="w-full px-2 py-1 rounded bg-surface-2 border border-border text-xs">
                  <option value="">—</option>
                  {EMOTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>

            <div>
              <div className="block text-[10px] uppercase tracking-wider text-muted-light mb-1">Mistakes</div>
              <div className="flex flex-wrap gap-1.5">
                {MISTAKE_TAGS.map((m) => (
                  <button key={m} onClick={() => toggleMistake(m)} className={cn(
                    "px-2 py-0.5 rounded text-[10px] border",
                    mistakes.includes(m)
                      ? "bg-bear/15 text-bear-light border-bear/40"
                      : "bg-surface-2 text-muted-light border-border/50",
                  )}>
                    {m.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-2 py-1.5 rounded bg-surface-2 border border-border text-xs resize-none" />
            </Field>
            <Field label="Lesson learned">
              <textarea value={lessonLearned} onChange={(e) => setLessonLearned(e.target.value)} rows={2} className="w-full px-2 py-1.5 rounded bg-surface-2 border border-border text-xs resize-none" />
            </Field>

            <div className="flex justify-end gap-2">
              <button onClick={remove} className="px-3 py-1.5 rounded text-[11px] text-bear-light hover:bg-bear/10 border border-bear/30">Delete</button>
              <button onClick={save} className="px-3 py-1.5 rounded bg-accent hover:bg-accent-light text-white text-[11px] font-semibold">Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
