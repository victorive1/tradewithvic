"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface LiveRefreshProps {
  /** Server-render time (ms since epoch). Pass Date.now() from the page. */
  serverTimestamp: number;
  /** Auto-refresh interval in ms. Defaults to 15 seconds. */
  intervalMs?: number;
  /** Optional label prefix, defaults to "Live". */
  label?: string;
}

/**
 * Client indicator that calls router.refresh() on an interval so the host
 * server component re-fetches its data. Keeps server rendering (no need to
 * rewrite pages as client components) while ensuring nothing ever looks stale.
 */
export function LiveRefresh({ serverTimestamp, intervalMs = 15000, label = "Live" }: LiveRefreshProps) {
  const router = useRouter();
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(async () => {
      setRefreshing(true);
      router.refresh();
      // Show a brief spinner; clear after the RSC round-trip completes.
      setTimeout(() => setRefreshing(false), 800);
    }, intervalMs);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [intervalMs, router]);

  const age = Math.max(0, Math.round((now - serverTimestamp) / 1000));
  const ageLabel = age < 60 ? `${age}s` : `${Math.floor(age / 60)}m ${age % 60}s`;

  async function handleManual() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  return (
    <button
      onClick={handleManual}
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-surface-2/60 border border-border/50 hover:border-accent/50 transition-smooth text-[11px] font-mono"
      title="Click to refresh now"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? "bg-accent animate-pulse" : "bg-bull pulse-live"}`} />
      <span className="uppercase tracking-wider text-muted">{label}</span>
      <span className="text-muted">·</span>
      <span className="text-foreground">updated {ageLabel} ago</span>
      {refreshing && <span className="text-accent-light">↻</span>}
    </button>
  );
}
