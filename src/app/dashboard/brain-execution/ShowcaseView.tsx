"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ShowcaseProps {
  state: any;
  mtAccounts?: Array<{ id: string; broker: string; server: string; login: string; platform: string; label?: string }>;
}

function timeAgo(d: Date | string | number): string {
  const t = typeof d === "string" ? new Date(d).getTime() : d instanceof Date ? d.getTime() : d;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function ShowcaseView({ state, mtAccounts = [] }: ShowcaseProps) {
  const hasMt = mtAccounts.length > 0;
  const positions: any[] = state?.positions ?? [];
  const trades: any[] = state?.trades ?? [];
  const quotes: any[] = state?.quotes ?? [];
  const events: any[] = state?.events ?? [];

  // Pick the featured instrument: latest open position, else latest executed trade, else top quote.
  const featuredSymbol = useMemo<string | null>(() => {
    if (positions[0]) return positions[0].symbol;
    if (trades[0]) return trades[0].symbol;
    if (quotes[0]) return quotes[0].symbol;
    return null;
  }, [positions, trades, quotes]);

  const featuredQuote = useMemo(() => quotes.find((q) => q.symbol === featuredSymbol) ?? null, [quotes, featuredSymbol]);
  const featuredPosition = useMemo(() => positions.find((p) => p.symbol === featuredSymbol) ?? null, [positions, featuredSymbol]);

  // Rotate through tracked symbols so the featured slot cycles when nothing's happening.
  const [autoIndex, setAutoIndex] = useState(0);
  useEffect(() => {
    if (positions.length > 0 || trades.length > 0) return; // don't auto-rotate when there's real action
    const iv = setInterval(() => setAutoIndex((i) => i + 1), 5000);
    return () => clearInterval(iv);
  }, [positions.length, trades.length]);

  const focusSymbol = featuredSymbol ?? quotes[autoIndex % Math.max(1, quotes.length)]?.symbol ?? null;
  const focusQuote = quotes.find((q) => q.symbol === focusSymbol) ?? featuredQuote;
  const focusPosition = positions.find((p) => p.symbol === focusSymbol) ?? featuredPosition;

  const firstMt = mtAccounts[0];
  const running = state?.account?.autoExecuteEnabled && !state?.account?.killSwitchEngaged;

  const latestAction = useMemo(() => {
    const openEvent = events.find((e) => e.eventType === "opened");
    const exitEvent = events.find((e) => ["tp1_hit", "tp2_hit", "tp3_hit", "sl_hit", "closed_thesis"].includes(e.eventType));
    const pick = openEvent && exitEvent ? (new Date(openEvent.createdAt) > new Date(exitEvent.createdAt) ? openEvent : exitEvent) : openEvent ?? exitEvent;
    if (!pick) return null;
    return {
      kind: pick.eventType,
      symbol: pick.position?.symbol,
      direction: pick.position?.direction,
      grade: pick.position?.grade,
      when: pick.createdAt,
    };
  }, [events]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-surface/60 via-surface-2/40 to-surface/60 p-6 md:p-10 min-h-[620px]">
      {/* Background glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-bull/20 blur-3xl" />
      </motion.div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left rail: account pulse */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <motion.span
              className={cn("h-2.5 w-2.5 rounded-full", running ? "bg-bull" : "bg-bear")}
              animate={running ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] } : {}}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Market Core Brain · Live</div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border/60 bg-gradient-to-br from-accent/15 via-surface-2/40 to-transparent p-6 backdrop-blur-sm"
          >
            {hasMt ? (
              <>
                <div className="text-[11px] uppercase tracking-wider text-muted">Active Account</div>
                <div className="text-lg font-bold mt-2 truncate">{firstMt.label || firstMt.broker}</div>
                <div className="text-xs text-muted font-mono mt-1">{firstMt.platform} · {firstMt.login}</div>
                <div className="text-[10px] text-muted font-mono mt-0.5 truncate">{firstMt.server}</div>
                <div className="mt-4 pt-4 border-t border-border/40 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted">Balance</span><span className="text-muted font-mono">pending bridge</span></div>
                  <div className="flex justify-between"><span className="text-muted">Equity</span><span className="text-muted font-mono">pending bridge</span></div>
                  <div className="flex justify-between"><span className="text-muted">Open P/L</span><span className="text-muted font-mono">pending bridge</span></div>
                </div>
                {mtAccounts.length > 1 && (
                  <div className="mt-3 text-[10px] text-muted">+ {mtAccounts.length - 1} more connected</div>
                )}
              </>
            ) : (
              <>
                <div className="text-[11px] uppercase tracking-wider text-muted">No Account</div>
                <div className="text-lg font-semibold mt-2">Connect MT4 / MT5</div>
                <p className="text-xs text-muted mt-2">Real account data appears here once you connect a broker.</p>
                <Link href="/dashboard/trading-hub" className="inline-block mt-4 text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-semibold">Trading Hub →</Link>
              </>
            )}
          </motion.div>

          {latestAction && (
            <motion.div
              key={`${latestAction.kind}-${latestAction.when}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-2xl border border-accent/40 bg-accent/5 p-4"
            >
              <div className="text-[10px] uppercase tracking-wider text-accent-light">Latest action</div>
              <div className="mt-1 font-mono font-semibold text-sm">
                {latestAction.direction === "bullish" ? "LONG" : latestAction.direction === "bearish" ? "SHORT" : "—"} · {latestAction.symbol}
              </div>
              <div className="text-[11px] text-muted mt-0.5 uppercase">
                {latestAction.kind.replace(/_/g, " ")} · {latestAction.grade} · {timeAgo(latestAction.when)} ago
              </div>
            </motion.div>
          )}
        </div>

        {/* Center: featured symbol hero + orbital ring */}
        <div className="lg:col-span-2 flex flex-col items-center justify-center relative min-h-[520px]">
          <OrbitRing quotes={quotes} focusSymbol={focusSymbol} />

          <motion.div
            key={`${focusSymbol}-${focusQuote?.price ?? ""}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="relative z-10 text-center px-6 py-6"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-accent-light">
              {running ? "AUTO LIVE" : "HALTED"}
              <motion.span className="h-1 w-1 rounded-full bg-accent-light" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }} />
              {state?.account?.smartExitMode?.toUpperCase() ?? "BALANCED"}
            </div>

            <div className="mt-4 text-4xl md:text-5xl font-black tracking-tight">
              {focusSymbol ?? "—"}
            </div>
            <div className="mt-1 text-xs text-muted uppercase tracking-[0.3em]">
              {focusPosition ? (focusPosition.direction === "bullish" ? "LONG POSITION" : "SHORT POSITION") : "SCANNING"}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${focusSymbol}-${focusQuote?.price ?? "-"}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="mt-6"
              >
                <div className="text-6xl md:text-7xl font-black font-mono tracking-tight">
                  {focusQuote ? formatPrice(focusQuote.price) : "—"}
                </div>
                {focusQuote && (
                  <div className={cn("mt-2 text-lg font-mono font-semibold", focusQuote.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>
                    {focusQuote.changePercent >= 0 ? "▲" : "▼"} {focusQuote.changePercent >= 0 ? "+" : ""}{focusQuote.changePercent.toFixed(2)}%
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {focusPosition && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mt-6 inline-flex items-center gap-4 rounded-2xl border border-border/50 bg-surface-2/70 px-5 py-3 backdrop-blur-sm"
              >
                <MiniStat label="Entry" value={formatPrice(focusPosition.entry)} />
                <div className="h-6 w-px bg-border/60" />
                <MiniStat label="SL" value={formatPrice(focusPosition.stopLoss)} valueClass="text-bear-light" />
                <div className="h-6 w-px bg-border/60" />
                <MiniStat label="TP1" value={formatPrice(focusPosition.takeProfit1)} valueClass="text-bull-light" />
                <div className="h-6 w-px bg-border/60" />
                <MiniStat
                  label="Unrealized"
                  value={`${focusPosition.unrealizedPnl >= 0 ? "+" : ""}$${focusPosition.unrealizedPnl.toFixed(2)}`}
                  valueClass={focusPosition.unrealizedPnl >= 0 ? "text-bull-light" : "text-bear-light"}
                />
                <div className="h-6 w-px bg-border/60" />
                <MiniStat label="Thesis" value={`${focusPosition.thesisScore}`} valueClass={thesisColor(focusPosition.thesisState)} />
              </motion.div>
            )}

            {!focusPosition && featuredSymbol && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-xs uppercase tracking-[0.25em] text-muted">
                No open position · waiting on A+/A signal
              </motion.div>
            )}
          </motion.div>

          <div className="mt-6 text-[10px] uppercase tracking-[0.25em] text-muted">
            Market Core Brain · {quotes.length} symbols scanned · {positions.length} live positions
          </div>
        </div>
      </div>

      {/* Bottom strip: streaming events */}
      <div className="relative z-10 mt-8 rounded-2xl border border-border/40 bg-surface-2/70 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted">Live event stream</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-accent-light">
            {state?.fetchedAt ? `refresh ${timeAgo(state.fetchedAt)} ago` : "—"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <AnimatePresence mode="popLayout">
            {events.slice(0, 8).map((e) => (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 rounded-full border border-border/50 bg-surface-2/40 px-3 py-1.5"
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", eventColor(e.eventType))} />
                <span className="font-mono">{e.position?.symbol ?? "—"}</span>
                <span className="uppercase text-muted text-[10px]">{e.eventType.replace(/_/g, " ")}</span>
                <span className="text-muted text-[10px]">{timeAgo(e.createdAt)} ago</span>
              </motion.div>
            ))}
            {events.length === 0 && (
              <div className="text-xs text-muted italic">Waiting for the first event…</div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function OrbitRing({ quotes, focusSymbol }: { quotes: any[]; focusSymbol: string | null }) {
  const ringSymbols = useMemo(() => {
    const others = quotes.filter((q) => q.symbol !== focusSymbol).slice(0, 8);
    return others;
  }, [quotes, focusSymbol]);

  if (ringSymbols.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <motion.div
        className="relative h-[420px] w-[420px] md:h-[500px] md:w-[500px]"
        animate={{ rotate: 360 }}
        transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
      >
        {ringSymbols.map((q, i) => {
          const angle = (i / ringSymbols.length) * Math.PI * 2;
          const radius = 210;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          return (
            <motion.div
              key={q.symbol}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
            >
              {/* Counter-rotate so labels stay upright */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
                className={cn(
                  "rounded-full border bg-surface-2/60 px-3 py-1.5 text-[10px] font-mono backdrop-blur-sm",
                  q.changePercent >= 0 ? "border-bull/30 text-bull-light" : "border-bear/30 text-bear-light"
                )}
              >
                {q.symbol}
                <span className="ml-1 opacity-70">{q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%</span>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function MiniStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className={cn("text-sm font-mono font-semibold mt-0.5", valueClass)}>{value}</div>
    </div>
  );
}

function formatPrice(p: number): string {
  if (p >= 1000) return p.toFixed(2);
  if (p >= 10) return p.toFixed(3);
  return p.toFixed(5);
}

function thesisColor(state: string): string {
  if (state === "strong") return "text-bull-light";
  if (state === "weakening") return "text-warn";
  if (state === "damaged") return "text-orange-400";
  return "text-bear-light";
}

function eventColor(type: string): string {
  if (type.includes("tp")) return "bg-bull";
  if (type.includes("sl_hit") || type === "closed_thesis") return "bg-bear";
  if (type === "opened") return "bg-accent";
  if (type.includes("sl_moved") || type === "partial_closed") return "bg-warn";
  return "bg-muted";
}
