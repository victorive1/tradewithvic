"use client";

import { useState, useEffect } from "react";
import { SetupsClient } from "./SetupsClient";
import type { TradeSetup } from "@/lib/setup-engine";

export default function SetupsPage() {
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // cache: "no-store" + timestamp query defeats any Next.js / CDN
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

  return <SetupsClient initialSetups={setups} lastUpdated={lastUpdated} />;
}
