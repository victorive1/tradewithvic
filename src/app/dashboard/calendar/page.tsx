"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  eventTime: string;
  country: string;
  eventName: string;
  impact: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  affectedSymbols: string[];
  affectedCurrencies: string[];
  source: string;
}

interface RiskSnapshot {
  symbol: string;
  riskLevel: string;
  nearestEventName: string | null;
  nearestEventImpact: string | null;
  minutesToEvent: number | null;
}

interface CalendarPayload {
  events: CalendarEvent[];
  riskSnapshots: RiskSnapshot[];
  counts: { high: number; medium: number; low: number };
  generatedAt: string;
}

const impactColors: Record<string, string> = {
  high: "bg-bear text-white",
  medium: "bg-warn text-black",
  low: "bg-surface-3 text-muted-light",
};

export default function CalendarPage() {
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news/calendar?hours=48", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as CalendarPayload);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Economic Calendar Intelligence</h1>
          <p className="text-sm text-muted mt-1">Not just events — impact analysis, volatility expectations, and directional bias</p>
        </div>
        <button onClick={load} className="btn-ghost text-xs">↻ Refresh</button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Upcoming Events (next 48h)</h2>
          {loading && !data ? (
            <div className="glass-card p-10 text-center text-muted">Loading calendar…</div>
          ) : data && data.events.length === 0 ? (
            <div className="glass-card p-10 text-center space-y-2">
              <div className="text-3xl opacity-40">📅</div>
              <p className="text-fluid-sm text-muted">
                No events currently scheduled in the next 48 hours.
                {" "}If the Finnhub key isn't configured yet, the ingestion cron will stay idle.
              </p>
            </div>
          ) : (
            data?.events.map((event) => <EventCard key={event.id} event={event} />)
          )}
        </div>

        <div className="space-y-4">
          <EventRiskMeter counts={data?.counts ?? { high: 0, medium: 0, low: 0 }} />
          <HighRiskSymbolsCard snapshots={data?.riskSnapshots ?? []} />
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Trading Tip</h3>
            <p className="text-xs text-muted leading-relaxed">
              Avoid opening new positions 30 minutes before high-impact events.
              The algo runtime auto-filters high-risk symbols and Smart Exit Mode
              steps up a tier on open positions during those windows.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  const timeLabel = useMemo(() => formatEventTime(event.eventTime), [event.eventTime]);
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-light bg-surface-2 px-2 py-1 rounded">{timeLabel}</span>
          <span className="text-xs text-muted bg-surface-2 px-2 py-1 rounded">{event.country || "—"}</span>
          <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded", impactColors[event.impact] ?? impactColors.low)}>
            {event.impact}
          </span>
        </div>
        <span className="text-[10px] text-muted">src: {event.source}</span>
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-2">{event.eventName}</h3>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Stat label="Forecast" value={event.forecast} />
        <Stat label="Previous" value={event.previous} />
        <Stat label="Actual" value={event.actual} emphasize={!!event.actual} />
      </div>
      {event.affectedSymbols.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {event.affectedSymbols.map((m) => (
            <span key={m} className="text-[10px] bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20 font-mono">{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string | null; emphasize?: boolean }) {
  return (
    <div className="text-center bg-surface-2 rounded-lg py-2">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={cn("text-sm font-bold", emphasize ? "text-foreground" : "text-muted")}>{value ?? "—"}</div>
    </div>
  );
}

function EventRiskMeter({ counts }: { counts: { high: number; medium: number; low: number } }) {
  const riskLevel = counts.high >= 2 ? "Extreme" : counts.high === 1 ? "High" : counts.medium >= 2 ? "Moderate" : "Calm";
  const riskColor = riskLevel === "Extreme" ? "text-bear-light"
    : riskLevel === "High" ? "text-warn"
    : riskLevel === "Moderate" ? "text-accent-light"
    : "text-bull-light";
  const fillClass = riskLevel === "Extreme" ? "bg-bear w-full"
    : riskLevel === "High" ? "bg-warn w-2/3"
    : riskLevel === "Moderate" ? "bg-accent w-1/2"
    : "bg-bull w-1/6";

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold mb-3">Event Risk Meter</h3>
      <div className={cn("text-3xl font-black mb-2", riskColor)}>{riskLevel}</div>
      <p className="text-xs text-muted">{counts.high} high-impact event{counts.high === 1 ? "" : "s"} in the next 48h</p>
      <div className="mt-3 h-2 rounded-full bg-surface-3 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", fillClass)} />
      </div>
      <div className="mt-3 pt-3 border-t border-border/30 space-y-1 text-[11px]">
        <Row label="High" value={counts.high} tone="bear" />
        <Row label="Medium" value={counts.medium} tone="warn" />
        <Row label="Low" value={counts.low} tone="muted" />
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone: "bear" | "warn" | "muted" }) {
  const cls = tone === "bear" ? "text-bear-light" : tone === "warn" ? "text-warn" : "text-muted-light";
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={cn("font-bold", cls)}>{value}</span>
    </div>
  );
}

function HighRiskSymbolsCard({ snapshots }: { snapshots: RiskSnapshot[] }) {
  const risky = snapshots.filter((s) => s.riskLevel === "high" || s.riskLevel === "medium")
    .sort((a, b) => (a.minutesToEvent ?? 99999) - (b.minutesToEvent ?? 99999));
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold mb-3">Symbols Under Event Risk</h3>
      {risky.length === 0 ? (
        <p className="text-xs text-muted">No elevated event risk right now.</p>
      ) : (
        <ul className="space-y-2">
          {risky.slice(0, 8).map((s) => (
            <li key={s.symbol} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn(
                  "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
                  s.riskLevel === "high" ? "border-bear/50 bg-bear/20 text-bear-light" : "border-warn/50 bg-warn/20 text-warn-light",
                )}>{s.riskLevel}</span>
                <span className="font-mono font-semibold">{s.symbol}</span>
              </div>
              <div className="text-right text-muted-light truncate">
                {s.nearestEventName ?? "—"}
                {s.minutesToEvent != null && <span className="text-muted"> · {s.minutesToEvent}m</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((d.getTime() - now.getTime()) / 60000);
  if (diffMin < 0) return "past";
  if (diffMin < 60) return `in ${diffMin}m`;
  if (diffMin < 1440) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
