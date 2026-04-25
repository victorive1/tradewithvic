"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Forex session windows in UTC. Multiple sessions can be active at once
// (notably London + NY 13:00–17:00 UTC, the highest-volume overlap).
interface SessionDef {
  key: "sydney" | "tokyo" | "london" | "new_york";
  label: string;
  short: string;
  startHour: number; // UTC, inclusive
  endHour: number;   // UTC, exclusive
  emoji: string;
  className: string;
}

const SESSIONS: SessionDef[] = [
  { key: "sydney",   label: "Sydney",   short: "SYD", startHour: 22, endHour: 7,  emoji: "🇦🇺", className: "border-purple-500/40 bg-purple-500/10 text-purple-300" },
  { key: "tokyo",    label: "Tokyo",    short: "TYO", startHour: 0,  endHour: 9,  emoji: "🇯🇵", className: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
  { key: "london",   label: "London",   short: "LDN", startHour: 8,  endHour: 17, emoji: "🇬🇧", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  { key: "new_york", label: "New York", short: "NY",  startHour: 13, endHour: 22, emoji: "🇺🇸", className: "border-blue-500/40 bg-blue-500/10 text-blue-300" },
];

function isHourInWindow(h: number, start: number, end: number): boolean {
  if (start <= end) return h >= start && h < end;
  return h >= start || h < end; // wraps midnight (Sydney 22→07)
}

function activeSessions(d: Date): SessionDef[] {
  const h = d.getUTCHours();
  return SESSIONS.filter((s) => isHourInWindow(h, s.startHour, s.endHour));
}

function nextSession(d: Date): { session: SessionDef; minutesUntil: number } | null {
  const now = d.getUTCHours() * 60 + d.getUTCMinutes();
  let best: { session: SessionDef; minutesUntil: number } | null = null;
  for (const s of SESSIONS) {
    if (isHourInWindow(d.getUTCHours(), s.startHour, s.endHour)) continue;
    const startMin = s.startHour * 60;
    let diff = startMin - now;
    if (diff <= 0) diff += 24 * 60;
    if (best === null || diff < best.minutesUntil) best = { session: s, minutesUntil: diff };
  }
  return best;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function SessionTimeBar() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) {
    // SSR / first paint — render an empty placeholder of the same height
    // so the layout doesn't shift when the client hydrates.
    return <div className="h-8 border-b border-border/30 bg-surface-2/30" aria-hidden />;
  }

  const utcStr = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`;
  const localStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const active = activeSessions(now);
  const overlap = active.length >= 2;
  const upcoming = nextSession(now);

  return (
    <div className="border-b border-border/30 bg-surface-2/30 px-4 py-1.5">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <div className="flex items-center gap-2 font-mono">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted">UTC</span>
          <span className="text-foreground font-semibold tabular-nums">{utcStr}</span>
          <span className="text-muted">·</span>
          <span className="text-muted-light tabular-nums">{localStr} {tz}</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {active.length === 0 ? (
            <span className="text-[11px] text-muted">Markets closed (weekend / between sessions)</span>
          ) : (
            active.map((s) => (
              <span
                key={s.key}
                className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border", s.className)}
                title={`${s.label} session — ${pad2(s.startHour)}:00–${pad2(s.endHour)}:00 UTC`}
              >
                {s.emoji} {s.short}
              </span>
            ))
          )}
          {overlap && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-warn/40 bg-warn/10 text-warn-light">
              ⚡ OVERLAP
            </span>
          )}
          {upcoming && (
            <span className="text-[10px] text-muted">
              · {upcoming.session.short} in {formatMinutes(upcoming.minutesUntil)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
