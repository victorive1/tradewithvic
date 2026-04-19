"use client";

import { useState, useEffect } from "react";
import { MarketRadarClient } from "@/components/dashboard/MarketRadarClient";
import type { MarketQuote, CurrencyStrength } from "@/lib/market-data";
import type { TradeSetup } from "@/lib/setup-engine";

export default function DashboardPage() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [strength, setStrength] = useState<CurrencyStrength[]>([]);
  const [setups, setSetups] = useState<TradeSetup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [quotesRes, setupsRes] = await Promise.all([
          fetch("/api/market/quotes"),
          fetch("/api/market/setups"),
        ]);
        const quotesData = await quotesRes.json();
        const setupsData = await setupsRes.json().catch(() => ({ setups: [] }));
        if (quotesData.quotes) setQuotes(quotesData.quotes);
        if (quotesData.currencyStrength) setStrength(quotesData.currencyStrength);
        if (setupsData.setups) setSetups(setupsData.setups);
      } catch (e) {
        console.error("Failed to load market data:", e);
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Market Radar</h1><p className="text-sm text-muted mt-1">Loading live market data...</p></div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse"><div className="h-4 bg-surface-3 rounded w-24 mb-3" /><div className="h-8 bg-surface-3 rounded w-32 mb-2" /><div className="h-3 bg-surface-3 rounded w-16" /></div>
          ))}
        </div>
      </div>
    );
  }

  return <MarketRadarClient initialQuotes={quotes} initialStrength={strength} initialSetups={setups} />;
}
