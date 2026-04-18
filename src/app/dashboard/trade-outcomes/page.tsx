"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type SourceFilter = "all" | "executed" | "virtual";
type OutcomeFilter = "all" | "wins" | "losses" | "breakeven" | "expired" | "invalid";
type TimePeriod = "24h" | "7d" | "30d" | "all";

interface ScoreBreakdown {
  rulesScore: number | null;
  hybridScore: number | null;
  alignment: number | null;
  structure: number | null;
  momentum: number | null;
  entryLocation: number | null;
  rr: number | null;
  volatility: number | null;
  eventRisk: number | null;
}

interface OutcomeRow {
  id: string;
  source: string;
  sourceLabel: string;
  symbol: string;
  displayName: string;
  timeframe: string;
  strategy: string;
  setupId: string;
  grade: string;
  originalScore: number | null;
  scoreBreakdown: ScoreBreakdown | null;
  liveScoreRange: { max: number | null; min: number | null };
  direction: string;
  outcomeState: string;
  entry: number;
  exit: number | null;
  stopLoss: number;
  sizeUnits: number | null;
  riskAmount: number | null;
  realizedPnl: number | null;
  pnlPct: number | null;
  rMultiple: number | null;
  exitReason: string;
  openedAt: string;
  closedAt: string;
  durationMinutes: number | null;
  mfe: number;
  mae: number;
  outcomeClass?: string;
}

interface Overview {
  executed: any;
  virtual: any;
  bySymbol: any[];
  byGrade: any[];
  byScoreBand: any[];
  byExitReason: any[];
}

const NOTES_KEY = "trade_outcome_notes";
const TAGS_KEY = "trade_outcome_tags";

function loadLocalMap(key: string): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveLocalMap(key: string, map: Record<string, string[]>) {
  try { window.localStorage.setItem(key, JSON.stringify(map)); } catch {}
}

function timeAgo(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function TradeOutcomesHubPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("");
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [period, setPeriod] = useState<TimePeriod>("7d");

  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeRow | null>(null);
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [newNote, setNewNote] = useState("");
  const [newTag, setNewTag] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, listRes] = await Promise.all([
        fetch("/api/trade-outcomes/overview", { cache: "no-store" }),
        fetch(`/api/trade-outcomes/list?source=${sourceFilter}&take=200`, { cache: "no-store" }),
      ]);
      if (!ovRes.ok) throw new Error(`overview ${ovRes.status}`);
      if (!listRes.ok) throw new Error(`list ${listRes.status}`);
      const ov = await ovRes.json();
      const list = await listRes.json();
      setOverview(ov);
      setOutcomes(list.outcomes ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load outcomes");
    } finally {
      setLoading(false);
    }
  }, [sourceFilter]);

  useEffect(() => {
    setNotes(loadLocalMap(NOTES_KEY));
    setTags(loadLocalMap(TAGS_KEY));
    setHydrated(true);
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 45_000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const filteredOutcomes = useMemo(() => {
    const cutoff = period === "24h" ? Date.now() - 86400_000
      : period === "7d" ? Date.now() - 7 * 86400_000
        : period === "30d" ? Date.now() - 30 * 86400_000
          : 0;
    return outcomes.filter((o) => {
      if (new Date(o.closedAt).getTime() < cutoff) return false;
      if (symbolFilter && !o.symbol.toLowerCase().includes(symbolFilter.toLowerCase())) return false;
      if (gradeFilter && o.grade !== gradeFilter) return false;
      if (outcomeFilter === "wins" && !(o.outcomeState === "tp_full" || o.outcomeState === "tp_partial")) return false;
      if (outcomeFilter === "losses" && o.outcomeState !== "sl_hit") return false;
      if (outcomeFilter === "breakeven" && o.outcomeState !== "breakeven") return false;
      if (outcomeFilter === "expired" && o.outcomeState !== "expired") return false;
      if (outcomeFilter === "invalid" && o.outcomeState !== "never_triggered") return false;
      return true;
    });
  }, [outcomes, period, symbolFilter, gradeFilter, outcomeFilter]);

  const uniqueSymbols = useMemo(() => Array.from(new Set(outcomes.map((o) => o.symbol))).sort(), [outcomes]);

  function addNote(outcomeId: string) {
    if (!newNote.trim()) return;
    const next = { ...notes, [outcomeId]: [...(notes[outcomeId] ?? []), newNote.trim()] };
    setNotes(next);
    saveLocalMap(NOTES_KEY, next);
    setNewNote("");
  }

  function addTag(outcomeId: string) {
    if (!newTag.trim()) return;
    const next = { ...tags, [outcomeId]: Array.from(new Set([...(tags[outcomeId] ?? []), newTag.trim().toLowerCase()])) };
    setTags(next);
    saveLocalMap(TAGS_KEY, next);
    setNewTag("");
  }

  function removeTag(outcomeId: string, tag: string) {
    const next = { ...tags, [outcomeId]: (tags[outcomeId] ?? []).filter((t) => t !== tag) };
    setTags(next);
    saveLocalMap(TAGS_KEY, next);
  }

  const exec = overview?.executed;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trade Outcomes Hub</h1>
          <p className="text-sm text-muted mt-1">
            Post-trade intelligence across brain paper trades, virtual setup outcomes, and (soon) MT5 real trades.
            Auto-refreshes every 45s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {([
            ["24h", "24h"], ["7d", "7d"], ["30d", "30d"], ["all", "All"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPeriod(id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
                period === id ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && !overview ? (
        <div className="glass-card p-12 text-center text-muted">Loading outcomes…</div>
      ) : error ? (
        <div className="glass-card p-6 text-sm text-bear-light">{error}</div>
      ) : (
        <>
          <section className="glass-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Performance Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Stat label="Executed Trades" value={`${exec?.total ?? 0}`} />
              <Stat
                label="Win Rate"
                value={exec?.total ? `${exec.winRate.toFixed(0)}%` : "—"}
                valueClass={exec?.winRate >= 55 ? "text-bull-light" : exec?.winRate > 0 ? "text-warn" : "text-muted"}
              />
              <Stat
                label="Total P&L"
                value={exec?.total ? `${exec.totalPnl >= 0 ? "+" : ""}$${exec.totalPnl.toFixed(2)}` : "—"}
                valueClass={exec?.totalPnl >= 0 ? "text-bull-light" : "text-bear-light"}
              />
              <Stat label="Avg R" value={exec?.total ? `${exec.avgRR.toFixed(2)}R` : "—"}
                valueClass={exec?.avgRR >= 0 ? "text-bull-light" : "text-bear-light"} />
              <Stat label="Expectancy" value={exec?.total ? `${exec.expectancy >= 0 ? "+" : ""}$${exec.expectancy.toFixed(2)}` : "—"}
                valueClass={exec?.expectancy >= 0 ? "text-bull-light" : "text-bear-light"} />
              <Stat label="Profit Factor" value={exec?.profitFactor !== null && exec?.profitFactor !== undefined ? exec.profitFactor.toFixed(2) : "—"}
                valueClass={exec?.profitFactor >= 1.5 ? "text-bull-light" : exec?.profitFactor >= 1 ? "text-warn" : "text-bear-light"} />
            </div>

            {overview && overview.virtual?.total > 0 && (
              <div className="mt-4 pt-4 border-t border-border/40 text-xs text-muted flex items-center gap-3 flex-wrap">
                <span className="uppercase tracking-wider font-semibold">Virtual (signals not executed)</span>
                <span>{overview.virtual.total} total</span>
                <span className="text-bull-light">{overview.virtual.wins} wins</span>
                <span className="text-bear-light">{overview.virtual.losses} losses</span>
                <span>{overview.virtual.neutral} neutral</span>
              </div>
            )}
          </section>

          {overview && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ScoreBandCard entries={overview.byScoreBand ?? []} />
              <BreakdownCard title="By Grade" entries={overview.byGrade} />
              <BreakdownCard title="By Symbol" entries={overview.bySymbol.slice(0, 8)} />
              <BreakdownCard title="By Exit Reason" entries={overview.byExitReason.slice(0, 8)} formatKey={(k) => k.replace(/_/g, " ")} />
            </div>
          )}

          <section className="glass-card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide">Outcome Records ({filteredOutcomes.length})</h2>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  ["all", "All"], ["executed", "Brain Paper"], ["virtual", "Virtual"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSourceFilter(id)}
                    className={cn("px-3 py-1 rounded-full text-[11px] font-medium border transition-smooth",
                      sourceFilter === id ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-4">
              <input
                type="text"
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                placeholder="Symbol…"
                className="w-32 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs focus:border-accent focus:outline-none"
              />
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs"
              >
                <option value="">All grades</option>
                <option value="A+">A+</option>
                <option value="A">A</option>
                <option value="candidate">Candidate</option>
                <option value="watch">Watch</option>
              </select>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  ["all", "All"], ["wins", "Wins"], ["losses", "Losses"], ["breakeven", "BE"], ["expired", "Expired"], ["invalid", "Invalid"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setOutcomeFilter(id)}
                    className={cn("px-2.5 py-1 rounded-full text-[11px] font-medium border transition-smooth",
                      outcomeFilter === id ? "bg-accent/15 border-accent/40 text-accent-light" : "bg-surface-2 border-border/50 text-muted-light")}>
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setSymbolFilter(""); setGradeFilter(""); setOutcomeFilter("all"); }}
                className="text-[11px] text-muted hover:text-foreground underline ml-auto"
              >
                clear filters
              </button>
            </div>

            {filteredOutcomes.length === 0 ? (
              <div className="text-center py-12 text-muted text-sm">No outcomes match. Try a wider time range or different filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted border-b border-border/40 bg-surface-2/30">
                      <th className="text-left py-2.5 px-3">CLOSED</th>
                      <th className="text-left px-2">SRC</th>
                      <th className="text-left px-2">SYMBOL · TF</th>
                      <th className="text-left px-2">DIR</th>
                      <th className="text-left px-2">RATING</th>
                      <th className="text-left px-2">STRATEGY</th>
                      <th className="text-left px-2">OUTCOME</th>
                      <th className="text-right px-2">ENTRY</th>
                      <th className="text-right px-2">EXIT</th>
                      <th className="text-right px-2">P&L</th>
                      <th className="text-right px-2">R</th>
                      <th className="text-left px-2">TAGS</th>
                      <th className="pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOutcomes.map((o) => {
                      const outcomeColor = o.outcomeState === "tp_full" ? "text-bull-light"
                        : o.outcomeState === "tp_partial" ? "text-bull-light/80"
                          : o.outcomeState === "sl_hit" ? "text-bear-light"
                            : o.outcomeState === "breakeven" ? "text-muted"
                              : o.outcomeState === "expired" ? "text-warn" : "text-muted";
                      const rowTags = hydrated ? (tags[o.id] ?? []) : [];
                      const rowNotes = hydrated ? (notes[o.id] ?? []) : [];
                      return (
                        <tr key={o.id} className="border-b border-border/20 hover:bg-surface-2/30 cursor-pointer" onClick={() => setSelectedOutcome(o)}>
                          <td className="py-2.5 px-3 font-mono text-muted-light">{timeAgo(o.closedAt)}</td>
                          <td className="px-2">
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                              o.source === "brain_paper" ? "bg-accent/10 text-accent-light" : "bg-purple-500/10 text-purple-300"
                            )}>
                              {o.sourceLabel}
                            </span>
                          </td>
                          <td className="px-2 font-mono">{o.symbol} · {o.timeframe}</td>
                          <td className="px-2">
                            <span className={cn("uppercase font-bold", o.direction === "bullish" ? "text-bull-light" : "text-bear-light")}>
                              {o.direction === "bullish" ? "LONG" : "SHORT"}
                            </span>
                          </td>
                          <td className="px-2">
                            <RatingCell score={o.originalScore} grade={o.grade} outcome={o.outcomeState} />
                          </td>
                          <td className="px-2 uppercase text-muted text-[10px]">{o.strategy?.replace(/_/g, " ") ?? "—"}</td>
                          <td className={cn("px-2 font-bold uppercase", outcomeColor)}>{o.outcomeState.replace(/_/g, " ")}</td>
                          <td className="text-right px-2 font-mono">{fmtPrice(o.entry)}</td>
                          <td className="text-right px-2 font-mono">{o.exit !== null ? fmtPrice(o.exit) : "—"}</td>
                          <td className={cn("text-right px-2 font-mono font-bold", (o.realizedPnl ?? 0) > 0 ? "text-bull-light" : (o.realizedPnl ?? 0) < 0 ? "text-bear-light" : "text-muted")}>
                            {o.realizedPnl !== null ? `${o.realizedPnl > 0 ? "+" : ""}$${o.realizedPnl.toFixed(2)}` : "—"}
                          </td>
                          <td className={cn("text-right px-2 font-mono", (o.rMultiple ?? 0) > 0 ? "text-bull-light" : (o.rMultiple ?? 0) < 0 ? "text-bear-light" : "text-muted")}>
                            {o.rMultiple !== null ? `${o.rMultiple.toFixed(2)}R` : "—"}
                          </td>
                          <td className="px-2">
                            {rowTags.length > 0 ? (
                              <div className="flex gap-1 flex-wrap">
                                {rowTags.slice(0, 2).map((t) => (
                                  <span key={t} className="text-[9px] bg-accent/10 text-accent-light px-1.5 py-0.5 rounded">{t}</span>
                                ))}
                                {rowTags.length > 2 && <span className="text-[9px] text-muted">+{rowTags.length - 2}</span>}
                              </div>
                            ) : <span className="text-[10px] text-muted">—</span>}
                          </td>
                          <td className="pr-3 text-[10px] text-muted">
                            {rowNotes.length > 0 ? `📝 ${rowNotes.length}` : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Detail drawer */}
      {selectedOutcome && (
        <OutcomeDrawer
          outcome={selectedOutcome}
          notes={notes[selectedOutcome.id] ?? []}
          tags={tags[selectedOutcome.id] ?? []}
          newNote={newNote}
          setNewNote={setNewNote}
          newTag={newTag}
          setNewTag={setNewTag}
          onAddNote={() => addNote(selectedOutcome.id)}
          onAddTag={() => addTag(selectedOutcome.id)}
          onRemoveTag={(t: string) => removeTag(selectedOutcome.id, t)}
          onClose={() => setSelectedOutcome(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className={cn("text-lg font-bold font-mono mt-1", valueClass)}>{value}</div>
    </div>
  );
}

function BreakdownCard({ title, entries, formatKey }: { title: string; entries: any[]; formatKey?: (k: string) => string }) {
  return (
    <section className="glass-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-xs text-muted">No data.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <div key={e.key} className="flex items-center justify-between text-xs">
              <span className="font-mono uppercase truncate max-w-[60%]">{formatKey ? formatKey(e.key) : e.key}</span>
              <div className="flex items-center gap-3 font-mono">
                <span className={cn(e.winRate >= 55 ? "text-bull-light" : e.winRate > 0 ? "text-warn" : "text-muted")}>
                  {e.winRate.toFixed(0)}%
                </span>
                <span className="text-muted">({e.count})</span>
                <span className={cn(e.pnl >= 0 ? "text-bull-light" : "text-bear-light", "min-w-[60px] text-right")}>
                  {e.pnl >= 0 ? "+" : ""}${e.pnl.toFixed(0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OutcomeDrawer({
  outcome, notes, tags, newNote, setNewNote, newTag, setNewTag,
  onAddNote, onAddTag, onRemoveTag, onClose,
}: any) {
  const isWin = (outcome.realizedPnl ?? 0) > 0 || outcome.outcomeState === "tp_full" || outcome.outcomeState === "tp_partial";
  const isLoss = outcome.outcomeState === "sl_hit";
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border-l border-border/50 w-full max-w-xl h-full overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Outcome Detail</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn("px-2 py-0.5 rounded text-xs font-bold uppercase",
              outcome.source === "brain_paper" ? "bg-accent/15 text-accent-light" : "bg-purple-500/15 text-purple-300"
            )}>
              {outcome.sourceLabel}
            </span>
            <span className="text-lg font-mono font-bold">{outcome.symbol} · {outcome.timeframe}</span>
            <span className={cn("uppercase font-bold", outcome.direction === "bullish" ? "text-bull-light" : "text-bear-light")}>
              {outcome.direction === "bullish" ? "LONG" : "SHORT"}
            </span>
            <span className="text-xs text-muted">{outcome.grade}</span>
          </div>
          <div className="mt-2 text-xs text-muted">
            Strategy: <span className="text-foreground uppercase">{outcome.strategy?.replace(/_/g, " ") ?? "—"}</span>
            <span className="mx-2">·</span>
            Opened {timeAgo(outcome.openedAt)} · Closed {timeAgo(outcome.closedAt)}
            {outcome.durationMinutes !== null && <span className="ml-2">· {outcome.durationMinutes}m hold</span>}
          </div>
          <div className={cn("mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg",
            isWin ? "bg-bull/10 text-bull-light" : isLoss ? "bg-bear/10 text-bear-light" : "bg-surface-2 text-muted"
          )}>
            <span className="text-xs font-bold uppercase">{outcome.outcomeState.replace(/_/g, " ")}</span>
            <span className="text-xs">·</span>
            <span className="text-xs font-mono">{outcome.exitReason.replace(/_/g, " ")}</span>
          </div>
        </div>

        <div className="glass-card p-4 grid grid-cols-2 gap-3 text-xs">
          <KV label="Entry" value={fmtPrice(outcome.entry)} />
          <KV label="Exit" value={outcome.exit !== null ? fmtPrice(outcome.exit) : "—"} />
          <KV label="Stop Loss" value={fmtPrice(outcome.stopLoss)} valueClass="text-bear-light" />
          <KV label="Size" value={outcome.sizeUnits !== null ? outcome.sizeUnits.toFixed(2) : "—"} />
          <KV label="Risk" value={outcome.riskAmount !== null ? `$${outcome.riskAmount.toFixed(2)}` : "—"} />
          <KV label="P&L" value={outcome.realizedPnl !== null ? `${outcome.realizedPnl > 0 ? "+" : ""}$${outcome.realizedPnl.toFixed(2)}` : "—"}
            valueClass={(outcome.realizedPnl ?? 0) > 0 ? "text-bull-light" : (outcome.realizedPnl ?? 0) < 0 ? "text-bear-light" : undefined} />
          <KV label="R Multiple" value={outcome.rMultiple !== null ? `${outcome.rMultiple.toFixed(2)}R` : "—"}
            valueClass={(outcome.rMultiple ?? 0) > 0 ? "text-bull-light" : (outcome.rMultiple ?? 0) < 0 ? "text-bear-light" : undefined} />
          <KV label="P&L %" value={outcome.pnlPct !== null ? `${outcome.pnlPct.toFixed(2)}%` : "—"} />
          <KV label="MFE" value={outcome.mfe.toFixed(4)} />
          <KV label="MAE" value={outcome.mae.toFixed(4)} />
        </div>

        <ScoreBreakdownPanel outcome={outcome} />

        {outcome.setupId && (
          <Link
            href={`/dashboard/brain/decision/${outcome.setupId}`}
            className="block glass-card p-3 text-center text-xs text-accent-light hover:text-accent underline underline-offset-4"
          >
            View full decision audit →
          </Link>
        )}

        <div className="glass-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider">Tags</h3>
          <div className="flex gap-1.5 flex-wrap">
            {tags.length === 0 ? <span className="text-xs text-muted">No tags yet.</span> : tags.map((t: string, ti: number) => (
              <span key={ti} className="inline-flex items-center gap-1 text-xs bg-accent/10 text-accent-light px-2 py-0.5 rounded">
                {t}
                <button onClick={() => onRemoveTag(t)} className="opacity-60 hover:opacity-100">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAddTag(); }}
              placeholder="Add tag (e.g. clean-setup, late-entry, news-spike)"
              className="flex-1 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs focus:border-accent focus:outline-none"
            />
            <button onClick={onAddTag} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium">Add</button>
          </div>
        </div>

        <div className="glass-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider">Review Notes</h3>
          <div className="space-y-2">
            {notes.length === 0 ? <span className="text-xs text-muted italic">No notes yet. Record what went right or wrong — these will train future reviews.</span> : notes.map((n: string, i: number) => (
              <div key={i} className="text-xs bg-surface-2 rounded-lg p-2.5 border-l-2 border-accent/50">{n}</div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAddNote(); }}
              placeholder="What happened? (entry timing, exit quality, structure break, plan match…)"
              className="flex-1 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs focus:border-accent focus:outline-none"
            />
            <button onClick={onAddNote} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KV({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={cn("font-mono", valueClass)}>{value}</span>
    </div>
  );
}

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p >= 1000) return p.toFixed(2);
  if (p >= 100) return p.toFixed(3);
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(5);
}

function scoreColorClass(score: number | null): string {
  if (score == null) return "text-muted";
  if (score >= 85) return "text-bull-light";
  if (score >= 75) return "text-accent-light";
  if (score >= 65) return "text-warn";
  return "text-bear-light";
}

function RatingCell({ score, grade, outcome }: { score: number | null; grade: string; outcome: string }) {
  const isWin = outcome === "tp_full" || outcome === "tp_partial";
  const isLoss = outcome === "sl_hit";
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("font-mono font-bold text-[13px] tabular-nums", scoreColorClass(score))}>
        {score != null ? score : "—"}
      </span>
      <span className={cn(
        "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border",
        grade === "A+" ? "border-bull/40 text-bull-light bg-bull/10" :
        grade === "A"  ? "border-accent/40 text-accent-light bg-accent/10" :
        grade === "candidate" ? "border-warn/40 text-warn bg-warn/10" :
        "border-border text-muted bg-surface-2"
      )}>{grade}</span>
      {isWin && <span className="text-[9px] text-bull">✓</span>}
      {isLoss && <span className="text-[9px] text-bear">✕</span>}
    </div>
  );
}

function ScoreBandCard({ entries }: { entries: any[] }) {
  if (!entries || entries.length === 0) {
    return (
      <section className="glass-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">By Rating Band</h3>
        <p className="text-xs text-muted">No rated trades yet.</p>
      </section>
    );
  }
  const maxCount = Math.max(1, ...entries.map((e) => e.count));
  return (
    <section className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">By Rating Band</h3>
        <span className="text-[10px] text-muted">Original confidence score</span>
      </div>
      <div className="space-y-2">
        {entries.map((e: any) => {
          const pct = (e.count / maxCount) * 100;
          const bandColor =
            e.key === "85+"   ? "bg-bull"         :
            e.key === "75–84" ? "bg-accent-light" :
            e.key === "65–74" ? "bg-warn"         :
            e.key === "<65"   ? "bg-bear-light"   :
            "bg-muted";
          return (
            <div key={e.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span className={cn("w-1.5 h-1.5 rounded-full", bandColor)} />
                  <span className="font-mono font-semibold">{e.key}</span>
                  <span className="text-muted">({e.count})</span>
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className={cn(e.winRate >= 55 ? "text-bull-light" : e.winRate > 0 ? "text-warn" : "text-muted")}>
                    {e.winRate.toFixed(0)}%
                  </span>
                  <span className={cn(e.avgR >= 0 ? "text-bull-light" : "text-bear-light")}>
                    {e.avgR >= 0 ? "+" : ""}{e.avgR.toFixed(2)}R
                  </span>
                  <span className={cn(e.pnl >= 0 ? "text-bull-light" : "text-bear-light", "min-w-[60px] text-right")}>
                    {e.pnl >= 0 ? "+" : ""}${e.pnl.toFixed(0)}
                  </span>
                </div>
              </div>
              <div className="h-1 rounded-full bg-surface-2/80 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", bandColor)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 pt-3 border-t border-border/40 text-[10px] text-muted leading-relaxed">
        Shows whether trades with higher original ratings actually win more often. If lower bands outperform higher ones, the scoring model needs recalibration.
      </p>
    </section>
  );
}

function ScoreBreakdownPanel({ outcome }: { outcome: OutcomeRow }) {
  const b = outcome.scoreBreakdown;
  const liveMax = outcome.liveScoreRange?.max;
  const liveMin = outcome.liveScoreRange?.min;
  const hasBreakdown = b && Object.values(b).some((v) => v != null);

  if (outcome.originalScore == null && !hasBreakdown) {
    return (
      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Rating</h3>
        <p className="text-xs text-muted italic">No rating data recorded for this trade.</p>
      </div>
    );
  }

  const components = b ? [
    { key: "Alignment", value: b.alignment, hint: "Pair strength + multi-TF agreement" },
    { key: "Structure", value: b.structure, hint: "Trend structure + BOS/CHoCH quality" },
    { key: "Momentum", value: b.momentum, hint: "RSI + MACD confluence" },
    { key: "Entry location", value: b.entryLocation, hint: "Proximity to premium/discount zone" },
    { key: "Risk/reward", value: b.rr, hint: "Setup R:R before fees" },
    { key: "Volatility", value: b.volatility, hint: "ATR fit vs historical" },
    { key: "Event risk", value: b.eventRisk, hint: "Upcoming news / session proximity" },
  ].filter((c) => c.value != null) : [];

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Rating at entry</h3>
        {outcome.originalScore != null && (
          <div className={cn("text-2xl font-bold font-mono tabular-nums", scoreColorClass(outcome.originalScore))}>
            {outcome.originalScore}
            <span className="text-xs text-muted font-normal ml-1">/100</span>
          </div>
        )}
      </div>

      {b?.hybridScore != null && b?.rulesScore != null && Math.abs(b.hybridScore - b.rulesScore) > 0.5 && (
        <div className="rounded-lg bg-surface-2/60 border border-border/40 p-2 text-[11px] flex items-center justify-between">
          <span className="text-muted">Rules / Hybrid blend</span>
          <span className="font-mono">
            <span className="text-muted-light">{b.rulesScore.toFixed(0)}</span>
            <span className="mx-2 text-muted">→</span>
            <span className={scoreColorClass(b.hybridScore)}>{b.hybridScore.toFixed(0)}</span>
          </span>
        </div>
      )}

      {components.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Component scores</div>
          {components.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-[11px]">
              <span className="w-28 shrink-0 text-muted-light truncate" title={c.hint}>{c.key}</span>
              <div className="flex-1 h-1 rounded-full bg-surface-2/80 overflow-hidden">
                <div className={cn("h-full rounded-full", scoreBarColor(c.value as number))}
                  style={{ width: `${Math.max(2, Math.min(100, c.value as number))}%` }} />
              </div>
              <span className={cn("w-8 text-right font-mono tabular-nums", scoreColorClass(c.value as number))}>
                {(c.value as number).toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      )}

      {(liveMax != null || liveMin != null) && (
        <div className="pt-2 border-t border-border/40">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Thesis score during trade</div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted">Best</span>
              <span className={cn("font-mono font-bold", scoreColorClass(liveMax))}>{liveMax ?? "—"}</span>
            </div>
            <span className="text-muted">·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted">Worst</span>
              <span className={cn("font-mono font-bold", scoreColorClass(liveMin))}>{liveMin ?? "—"}</span>
            </div>
            {liveMax != null && liveMin != null && outcome.originalScore != null && (
              <span className="text-[10px] text-muted ml-auto">
                Entry · {outcome.originalScore}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function scoreBarColor(score: number): string {
  if (score >= 85) return "bg-bull";
  if (score >= 75) return "bg-accent-light";
  if (score >= 65) return "bg-warn";
  return "bg-bear-light";
}
