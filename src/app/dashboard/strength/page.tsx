"use client";

import { useState, useEffect } from "react";
import { StrengthClient } from "./StrengthClient";
import type { MarketQuote, CurrencyStrength } from "@/lib/market-data";

export default function StrengthPage() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [strength, setStrength] = useState<CurrencyStrength[]>([]);
  const [capturedAt, setCapturedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/market/quotes");
        const data = await res.json();
        if (data.quotes) setQuotes(data.quotes);
        if (data.currencyStrength) setStrength(data.currencyStrength);
        // Prefer the scanner's capturedAt (when our snapshot was taken) over
        // TwelveData's bar-close time. Fall back to the API response time.
        const cap = data.capturedAt ? new Date(data.capturedAt).getTime() : null;
        setCapturedAt(cap || data.timestamp || Date.now());
      } catch (e) {
        console.error("Failed to load:", e);
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
        <div><h1 className="text-2xl font-bold text-foreground">Currency Strength Meter</h1><p className="text-sm text-muted mt-1">Loading live strength data...</p></div>
        <div className="space-y-3">{[1,2,3,4,5,6,7,8].map((i) => (<div key={i} className="glass-card p-5 animate-pulse"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-surface-3 rounded-xl" /><div className="flex-1"><div className="h-3 bg-surface-3 rounded w-full" /></div></div></div>))}</div>
      </div>
    );
  }

  return <StrengthClient strength={strength} quotes={quotes} capturedAt={capturedAt} />;
}
