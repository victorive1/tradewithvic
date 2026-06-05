"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { isBullishDirection } from "@/lib/setups/direction";
import { FirstDroppedBadge } from "@/components/setups/FirstDroppedBadge";
import { sessionForUtc, type FxSessionKey } from "@/lib/setups/first-dropped";
import type { BacklogItem } from "@/lib/setups/backlog-query";

export type { BacklogItem };

type SourceFilter = "all" | "setup" | "intraday";
type SessionFilter = "all" | FxSessionKey;

const SOURCE_TABS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "setup", label: "Trade Setups" },
  { key: "intraday", label: "Intraday" },
];

const SESSION_TABS: { key: SessionFilter; label: string }[] = [
  { key: "all", label: "All sessions" },
  { key: "sydney", label: "Sydney" },
  { key: "tokyo", label: "Tokyo" },
  { key: "london", label: "London" },
  { key: "new_york", label: "New York" },
];

// Relative "posted X ago" — distinct from the immutable first-dropped time.
// Computed at render against the current clock, so it keeps ticking.
function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function calendarDay(iso: string): string {
  // Group header by UTC calendar date so a "day" matches the session windows.
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function BacklogClient({
  items,
  retentionDays,
  capped,
  perSourceCap,
}: {
  items: BacklogItem[];
  retentionDays: number;
  capped: boolean;
  perSourceCap: number;
}) {
  const [source, setSource] = useState<SourceFilter>("all");
  const [session, setSession] = useState<SessionFilter>("all");
  const [origin, setOrigin] = useState<string>("all");
  const [query, setQuery] = useState("");

  // Distinct source signals/tabs present in the window, for the filter.
  const originOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.origin.label))).sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return items.filter((it) => {
      if (source !== "all" && it.source !== source) return false;
      if (session !== "all" && sessionForUtc(new Date(it.createdAt)).key !== session) return false;
      if (origin !== "all" && it.origin.label !== origin) return false;
      if (q && !it.symbol.toUpperCase().includes(q)) return false;
      return true;
    });
  }, [items, source, session, origin, query]);

  // Group by UTC calendar day for a scannable timeline.
  const groups = useMemo(() => {
    const map = new Map<string, BacklogItem[]>();
    for (const it of filtered) {
      const day = calendarDay(it.createdAt);
      const arr = map.get(day);
      if (arr) arr.push(it);
      else map.set(day, [it]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Backlog</h1>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent-light uppercase tracking-wider">
            Agent / Admin
          </span>
        </div>
        <p className="text-sm text-muted mt-1">
          Every trade setup dropped in the last {retentionDays} days. Each one is stamped with the
          exact UTC date, time, and trading session it was <em>first detected</em> — that origin
          never changes — plus the signal/tab it came from.
        </p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {SOURCE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSource(t.key)}
              className={cn(
                "text-xs font-semibold px-3 py-1.5 rounded-lg transition-smooth",
                source === t.key
                  ? "bg-accent/15 text-accent-light border border-accent/30"
                  : "bg-surface-2 text-muted hover:text-foreground border border-transparent",
              )}
            >
              {t.label}
            </button>
          ))}
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent/50"
            title="Filter by source signal / tab"
          >
            <option value="all">All signals</option>
            {originOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <div className="flex-1 min-w-[160px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by symbol…"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {SESSION_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSession(t.key)}
              className={cn(
                "text-[11px] font-medium px-2.5 py-1 rounded-md transition-smooth",
                session === t.key
                  ? "bg-foreground/10 text-foreground border border-border-light"
                  : "bg-surface-2/60 text-muted hover:text-foreground border border-transparent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {filtered.length} setup{filtered.length === 1 ? "" : "s"}
          {source !== "all" || session !== "all" || origin !== "all" || query
            ? ` (filtered from ${items.length})`
            : ""}
        </span>
        {capped && (
          <span className="text-warn">
            Showing the most recent {perSourceCap} per source — older entries in the window are not listed.
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="glass-card p-12 text-center text-sm text-muted">
          No setups match these filters in the last {retentionDays} days.
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([day, dayItems]) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">{day}</h2>
                <div className="flex-1 h-px bg-border/40" />
                <span className="text-[11px] text-muted">{dayItems.length}</span>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {dayItems.map((it) => (
                  <BacklogCard key={it.id} item={it} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BacklogCard({ item }: { item: BacklogItem }) {
  const isBuy = isBullishDirection(item.direction);
  const isGoodGrade = item.grade?.toUpperCase().startsWith("A");

  return (
    <div className="glass-card overflow-hidden">
      <div className={cn("h-1", isBuy ? "bg-bull" : "bg-bear")} />
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">{item.symbol}</h3>
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                isBuy ? "badge-bull" : "badge-bear",
              )}
            >
              {isBuy ? "long" : "short"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                isGoodGrade ? "bg-bull/10 text-bull-light" : "bg-warn/10 text-warn",
              )}
            >
              {item.grade}
            </span>
            <span className="text-[11px] text-accent-light font-mono">{item.score}%</span>
          </div>
        </div>

        {/* The immutable first-dropped origin time + date */}
        <div className="mb-2">
          <FirstDroppedBadge at={item.createdAt} withDate />
        </div>

        {/* Source signal / tab this setup came from */}
        <div className="mb-3">
          {item.origin.href ? (
            <Link
              href={item.origin.href}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-accent/10 text-accent-light border border-accent/25 hover:bg-accent/20 transition-smooth"
              title={`From ${item.origin.label} — open tab`}
            >
              <span className="opacity-70">From</span> {item.origin.label}
              <span aria-hidden>↗</span>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface-2 text-muted-light border border-border/40">
              <span className="opacity-70">From</span> {item.origin.label}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 mb-3 text-[10px] text-muted flex-wrap">
          <span className="bg-surface-2 px-2 py-0.5 rounded">{item.timeframe}</span>
          <span className="bg-surface-2 px-2 py-0.5 rounded">{item.kind}</span>
          <span className="bg-surface-2 px-2 py-0.5 rounded capitalize">{item.status.replace(/_/g, " ")}</span>
        </div>

        {/* Levels */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Level label="Entry" value={item.entryLabel} tone="foreground" />
          <Level label="Stop" value={item.stopLoss} tone="bear" />
          <Level label="TP1" value={item.takeProfit1} tone="bull" />
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted">R:R {item.riskReward}:1</span>
          <span className="text-muted">Posted {timeAgo(item.createdAt)}</span>
        </div>

        {item.explanation && (
          <p className="text-[11px] text-muted leading-relaxed mt-2 line-clamp-2">{item.explanation}</p>
        )}
      </div>
    </div>
  );
}

function Level({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "foreground" | "bear" | "bull";
}) {
  const valueClass =
    tone === "bear" ? "text-bear-light" : tone === "bull" ? "text-bull-light" : "text-foreground";
  const labelClass =
    tone === "bear" ? "text-bear-light" : tone === "bull" ? "text-bull-light" : "text-muted";
  return (
    <div className="bg-surface-2 rounded-lg p-2 text-center">
      <div className={cn("text-[9px] uppercase tracking-wider mb-0.5", labelClass)}>{label}</div>
      <div className={cn("text-xs font-bold font-mono truncate", valueClass)} title={value}>
        {value}
      </div>
    </div>
  );
}
