"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface LiveCard {
  symbol: string;
  price: string;
  bias: string;
  confidence: number;
  type: string;
  color: string;
}

function FloatingCard({ card, className }: { card: LiveCard; className?: string }) {
  const borderColor = card.color === "bull" ? "border-bull/30" : card.color === "bear" ? "border-bear/30" : "border-border";
  const biasColor = card.color === "bull" ? "text-bull-light" : card.color === "bear" ? "text-bear-light" : "text-muted-light";

  return (
    <div className={`glass-card p-4 w-52 ${borderColor} ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-foreground">{card.symbol}</span>
        <span className={`text-xs font-medium ${biasColor}`}>{card.bias}</span>
      </div>
      <div className="text-lg font-bold text-foreground mb-1">{card.price}</div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{card.type}</span>
        <span className="text-xs text-accent-light">{card.confidence > 0 ? `${card.confidence}%` : "—"}</span>
      </div>
    </div>
  );
}

const defaultCards: LiveCard[] = [
  { symbol: "EUR/USD", price: "—", bias: "—", confidence: 0, type: "Loading", color: "neutral" },
  { symbol: "XAU/USD", price: "—", bias: "—", confidence: 0, type: "Loading", color: "neutral" },
  { symbol: "NAS100", price: "—", bias: "—", confidence: 0, type: "Loading", color: "neutral" },
  { symbol: "BTC/USD", price: "—", bias: "—", confidence: 0, type: "Loading", color: "neutral" },
];

export function HeroSection() {
  const [cards, setCards] = useState<LiveCard[]>(defaultCards);

  useEffect(() => {
    async function fetchLive() {
      try {
        const res = await fetch("/api/market/quotes");
        if (!res.ok) return;
        const data = await res.json();
        if (!data.quotes || data.quotes.length === 0) return;

        const targets = ["EURUSD", "XAUUSD", "NAS100", "BTCUSD"];
        const newCards: LiveCard[] = targets.map((sym) => {
          const q = data.quotes.find((quote: any) => quote.symbol === sym);
          if (!q) return defaultCards.find((c) => c.symbol.replace("/", "").includes(sym.slice(0, 3))) || defaultCards[0];
          const isBull = q.changePercent > 0;
          return {
            symbol: q.displayName,
            price: q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: q.category === "forex" ? 5 : 2 }),
            bias: isBull ? "Bullish" : "Bearish",
            confidence: Math.min(95, Math.max(50, Math.round(50 + Math.abs(q.changePercent) * 15))),
            type: Math.abs(q.changePercent) > 0.5 ? "Momentum" : "Range",
            color: isBull ? "bull" : "bear",
          };
        });
        setCards(newCards);
      } catch { /* silent */ }
    }
    fetchLive();
    const interval = setInterval(fetchLive, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      <div className="orb w-[500px] h-[500px] bg-accent/20 -top-40 -right-40" />
      <div className="orb w-[400px] h-[400px] bg-accent/10 bottom-20 -left-40" />
      <div className="orb w-[300px] h-[300px] bg-bull/10 top-1/2 right-1/4" />
      <div className="grid-bg absolute inset-0" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="max-w-2xl">
            <div className="animate-fade-in-up">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent-light text-sm mb-6">
                <span className="w-2 h-2 rounded-full bg-bull pulse-live" />
                Live Market Intelligence
              </div>
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 animate-fade-in-up-delay-1">
              Trade Smarter{" "}
              <span className="gradient-text-accent">Across Every Market</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-light max-w-xl mb-8 leading-relaxed animate-fade-in-up-delay-2">
              Analyze forex, metals, indices, and crypto with real-time insights,
              clean setups, and confidence-driven trade intelligence.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up-delay-3">
              <Link href="/auth/signup" className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-lg transition-smooth glow-accent">
                Get Started Free
              </Link>
              <Link href="/dashboard" className="inline-flex items-center justify-center px-8 py-4 rounded-xl border border-border hover:border-border-light text-foreground font-medium text-lg transition-smooth">
                View Dashboard
              </Link>
            </div>
          </div>

          <div className="relative hidden lg:block h-[500px]">
            <FloatingCard card={cards[0]} className="absolute top-8 right-8 animate-float" />
            <FloatingCard card={cards[1]} className="absolute top-32 right-48 animate-float-delayed" />
            <FloatingCard card={cards[2]} className="absolute top-64 right-4 animate-float" />
            <FloatingCard card={cards[3]} className="absolute bottom-8 right-36 animate-float-delayed" />
          </div>
        </div>
      </div>
    </section>
  );
}
