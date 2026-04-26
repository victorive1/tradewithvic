"use client";

import { useEffect, useState } from "react";

interface Quote {
  symbol: string;
  displayName: string;
  price: number;
  changePercent: number;
  category: string;
}

const categories = [
  { key: "forex", label: "Forex", accent: "text-accent-light" },
  { key: "metals", label: "Metals", accent: "text-warn" },
  { key: "energy", label: "Energy", accent: "text-bull-light" },
  { key: "crypto", label: "Crypto", accent: "text-muted-light" },
];

const fallback: Quote[] = [
  { symbol: "EURUSD", displayName: "EUR/USD", price: 1.0842, changePercent: 0.12, category: "forex" },
  { symbol: "GBPUSD", displayName: "GBP/USD", price: 1.2634, changePercent: -0.08, category: "forex" },
  { symbol: "USDJPY", displayName: "USD/JPY", price: 151.24, changePercent: 0.31, category: "forex" },
  { symbol: "XAUUSD", displayName: "XAU/USD", price: 2384.50, changePercent: 0.64, category: "metals" },
  { symbol: "XAGUSD", displayName: "XAG/USD", price: 28.42, changePercent: -0.22, category: "metals" },
  { symbol: "USOIL", displayName: "US Oil (WTI)", price: 78.42, changePercent: 0.55, category: "energy" },
  { symbol: "BTCUSD", displayName: "BTC/USD", price: 67240.5, changePercent: 1.42, category: "crypto" },
  { symbol: "ETHUSD", displayName: "ETH/USD", price: 3284.1, changePercent: 0.88, category: "crypto" },
  { symbol: "SOLUSD", displayName: "SOL/USD", price: 184.3, changePercent: -0.64, category: "crypto" },
];

function TickerItem({ q }: { q: Quote }) {
  const isBull = q.changePercent >= 0;
  const priceDigits = q.category === "forex" ? 4 : q.category === "crypto" || q.price > 1000 ? 2 : 2;
  return (
    <div className="flex items-center gap-3 px-5 py-2 border-r border-border/40 whitespace-nowrap">
      <span className="text-[11px] font-semibold tracking-wide text-muted">
        {q.displayName}
      </span>
      <span className="text-[13px] font-mono font-semibold text-foreground">
        {q.price.toLocaleString(undefined, { minimumFractionDigits: priceDigits, maximumFractionDigits: priceDigits })}
      </span>
      <span
        className={`text-[11px] font-mono font-bold flex items-center gap-0.5 ${
          isBull ? "text-bull-light" : "text-bear-light"
        }`}
      >
        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
          {isBull ? <path d="M5 1.5 9 7.5H1z" /> : <path d="M5 8.5 9 2.5H1z" />}
        </svg>
        {isBull ? "+" : ""}{q.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

export function MarketStrip() {
  const [quotes, setQuotes] = useState<Quote[]>(fallback);

  useEffect(() => {
    async function fetchLive() {
      try {
        const res = await fetch("/api/market/quotes");
        if (!res.ok) return;
        const data = await res.json();
        if (data.quotes && data.quotes.length > 0) {
          setQuotes(data.quotes.slice(0, 14));
        }
      } catch { /* silent */ }
    }
    fetchLive();
    const interval = setInterval(fetchLive, 30000);
    return () => clearInterval(interval);
  }, []);

  // Duplicate for seamless loop
  const looped = [...quotes, ...quotes];

  return (
    <section className="relative border-y border-border/60 bg-surface/40 backdrop-blur-sm overflow-hidden">
      {/* Side fades */}
      <div className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none bg-gradient-to-r from-background to-transparent" />
      <div className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none bg-gradient-to-l from-background to-transparent" />

      <div className="relative flex items-center">
        <div className="shrink-0 pl-4 sm:pl-6 lg:pl-8 pr-5 py-3 border-r border-border/60 bg-background/40 backdrop-blur-md z-20">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-bull" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.18em] text-muted uppercase">Live Tape</span>
          </div>
        </div>

        <div
          className="flex animate-marquee"
          style={{ animationDuration: `${Math.max(30, looped.length * 2)}s` }}
        >
          {looped.map((q, i) => (
            <TickerItem key={`${q.symbol}-${i}`} q={q} />
          ))}
        </div>
      </div>

      {/* Category legend (desktop only) */}
      <div className="hidden md:flex items-center justify-center gap-8 py-4 border-t border-border/60 bg-background/20">
        <span className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">Coverage</span>
        <div className="flex items-center gap-5">
          {categories.map((c) => (
            <div key={c.key} className="flex items-center gap-2">
              <span className={`w-1 h-1 rounded-full ${
                c.key === "forex" ? "bg-accent-light" :
                c.key === "metals" ? "bg-warn" :
                c.key === "energy" ? "bg-bull-light" :
                "bg-muted-light"
              }`} />
              <span className="text-[11px] font-medium text-muted-light">{c.label}</span>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}
