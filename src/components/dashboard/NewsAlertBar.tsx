"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface ActiveAlert {
  id: string;
  kind: "calendar" | "headline";
  severity: "red" | "orange" | "green";
  title: string;
  subtitle: string | null;
  affectedSymbols: string[];
  publishedAt: string;
  eventTime: string | null;
  minutesUntil: number | null;
  sourceUrl: string | null;
  sourceName: string | null;
  category: string;
}

interface AlertsPayload {
  alerts: ActiveAlert[];
  counts: { red: number; orange: number; calendar: number; headline: number };
  generatedAt: string;
}

const DISMISS_KEY = "tv.newsbar.dismissed.v1";
const POLL_MS = 60_000;
const ROTATE_MS = 6_000;

export function NewsAlertBar() {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [rotateIndex, setRotateIndex] = useState(0);
  const [dismissed, setDismissed] = useState<Record<string, string>>({}); // id -> severity at dismiss

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) setDismissed(JSON.parse(raw));
    } catch {}
  }, []);

  const persistDismissed = useCallback((next: Record<string, string>) => {
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/news/active-alerts", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as AlertsPayload;
      setAlerts(data.alerts);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Visible = not dismissed OR severity has escalated since last dismiss.
  const visible = useMemo(() => {
    return alerts.filter((a) => {
      const prev = dismissed[a.id];
      if (!prev) return true;
      if (prev === "orange" && a.severity === "red") return true;
      return false;
    });
  }, [alerts, dismissed]);

  useEffect(() => {
    if (visible.length <= 1) { setRotateIndex(0); return; }
    const t = setInterval(() => setRotateIndex((i) => (i + 1) % visible.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [visible.length]);

  const dismiss = useCallback((id: string, severity: string) => {
    persistDismissed({ ...dismissed, [id]: severity });
  }, [dismissed, persistDismissed]);

  if (visible.length === 0) return null;

  const primary = visible[rotateIndex % visible.length];
  const tone = toneStyles(primary.severity);

  return (
    <div className={cn("w-full border-b relative z-20", tone.bar, tone.border)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2 text-left"
        aria-expanded={expanded}
        aria-label="Toggle active market alerts"
      >
        <span className={cn("text-base leading-none", tone.pulse && "animate-pulse")}>{tone.icon}</span>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className={cn("text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded border shrink-0", tone.pill)}>
            {primary.severity === "red" ? "HIGH IMPACT" : "UPCOMING"}
          </span>
          <span className={cn("text-xs font-semibold truncate", tone.text)}>{primary.title}</span>
          {primary.subtitle && (
            <span className="hidden sm:inline text-[11px] text-muted truncate">· {primary.subtitle}</span>
          )}
          {primary.affectedSymbols.length > 0 && (
            <span className="hidden md:flex items-center gap-1 text-[10px] text-muted-light">
              {primary.affectedSymbols.slice(0, 4).map((s) => (
                <span key={s} className="font-mono bg-surface-2/70 px-1.5 py-0.5 rounded">{s}</span>
              ))}
            </span>
          )}
        </div>
        {visible.length > 1 && (
          <span className="text-[10px] font-mono text-muted shrink-0">
            {rotateIndex + 1}/{visible.length}
          </span>
        )}
        <span className={cn("text-[10px] font-mono text-muted shrink-0 transition-transform", expanded && "rotate-180")}>▾</span>
      </button>

      {expanded && (
        <div className="border-t border-border/40 bg-background/95 backdrop-blur-sm max-h-[60vh] overflow-y-auto">
          <ul>
            {visible.map((a) => (
              <AlertRow key={a.id} alert={a} onDismiss={() => dismiss(a.id, a.severity)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert, onDismiss }: { alert: ActiveAlert; onDismiss: () => void }) {
  const tone = toneStyles(alert.severity);
  return (
    <li className="border-b border-border/20 last:border-0 px-4 py-3 hover:bg-surface-2/30 transition-smooth">
      <div className="flex items-start gap-3">
        <span className={cn("text-sm leading-none mt-0.5")}>{tone.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border", tone.pill)}>
              {alert.severity}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted">{alert.kind}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted">· {alert.category.replace(/_/g, " ")}</span>
            {alert.minutesUntil !== null && (
              <span className="text-[10px] text-muted">
                · {alert.minutesUntil > 0 ? `in ${alert.minutesUntil}m` : `${-alert.minutesUntil}m ago`}
              </span>
            )}
          </div>
          <p className={cn("text-xs font-semibold mt-1", tone.text)}>{alert.title}</p>
          {alert.subtitle && <p className="text-[11px] text-muted-light mt-1">{alert.subtitle}</p>}
          {alert.affectedSymbols.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {alert.affectedSymbols.map((s) => (
                <span key={s} className="text-[10px] font-mono bg-surface-2 border border-border/40 px-1.5 py-0.5 rounded">{s}</span>
              ))}
            </div>
          )}
          {alert.sourceUrl && (
            <a href={alert.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-accent-light hover:text-accent mt-1 inline-block">
              {alert.sourceName ?? "source"} →
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[10px] text-muted hover:text-foreground px-2 py-1 border border-border/40 rounded shrink-0"
          aria-label={`Dismiss alert: ${alert.title}`}
        >
          dismiss
        </button>
      </div>
    </li>
  );
}

function toneStyles(severity: string) {
  if (severity === "red") {
    return {
      bar: "bg-bear/10",
      border: "border-bear/40",
      pill: "border-bear/50 bg-bear/20 text-bear-light",
      text: "text-bear-light",
      icon: "🔴",
      pulse: true,
    };
  }
  if (severity === "orange") {
    return {
      bar: "bg-warn/10",
      border: "border-warn/40",
      pill: "border-warn/50 bg-warn/20 text-warn-light",
      text: "text-warn-light",
      icon: "🟠",
      pulse: false,
    };
  }
  return {
    bar: "bg-surface-2",
    border: "border-border/40",
    pill: "border-border/50 bg-surface-3 text-muted-light",
    text: "text-muted-light",
    icon: "🟢",
    pulse: false,
  };
}
