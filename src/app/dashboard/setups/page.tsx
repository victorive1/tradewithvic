"use client";

import { useEffect, useRef, useState } from "react";
import { SetupsClient } from "./SetupsClient";
import type { TradeSetup } from "@/lib/setup-engine";

export default function SetupsPage() {
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  // pausedRef lets us pause the polling timer while the user has the
  // mouse over the setups area — entry/SL/TP numbers stay frozen so
  // they can be read or copied without the values shifting underneath.
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (pausedRef.current) return; // skip this tick — user is interacting
      try {
        // cache: "no-store" + timestamp query defeats Next.js / CDN
        // caching so the setups always reflect the latest quote snapshot.
        const res = await fetch(`/api/market/setups?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data.setups) {
          setSetups(data.setups);
          setLastUpdated(data.timestamp ?? Date.now());
        }
      } catch (e) {
        console.error("Failed to load setups:", e);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Trade Setups</h1><p className="text-sm text-muted mt-1">Scanning markets for setups...</p></div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse"><div className="h-1 bg-surface-3 rounded-t" /><div className="h-4 bg-surface-3 rounded w-24 mb-3 mt-4" /><div className="h-6 bg-surface-3 rounded w-32 mb-2" /><div className="h-20 bg-surface-3 rounded" /></div>
          ))}
        </div>
      </div>
    );
  }

  // The hover handlers wrap the entire SetupsClient so any interaction
  // inside (hovering a card, focusing the Execute button, opening
  // Details) freezes refreshes. mouseLeave resumes them and immediately
  // applies the latest snapshot.
  return (
    <div
      onMouseEnter={() => { pausedRef.current = true; setPaused(true); }}
      onMouseLeave={() => { pausedRef.current = false; setPaused(false); }}
    >
      <SetupsClient initialSetups={setups} lastUpdated={lastUpdated} paused={paused} />
    </div>
  );
}
