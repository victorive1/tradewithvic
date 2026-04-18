"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { SplineScene } from "@/components/ui/splite";
import { Card } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight";

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
        {/* 3D Hero Card */}
        <Card className="w-full bg-black/[0.96] relative overflow-hidden border-border/30 mb-12">
          <Spotlight
            className="-top-40 left-0 md:left-60 md:-top-20"
            fill="white"
          />

          <div className="flex flex-col lg:flex-row min-h-[500px]">
            {/* Left content */}
            <div className="flex-1 p-8 lg:p-12 relative z-10 flex flex-col justify-center">
              <div className="animate-fade-in-up">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent-light text-sm mb-6">
                  <span className="w-2 h-2 rounded-full bg-bull pulse-live" />
                  Live Market Intelligence
                </div>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 animate-fade-in-up-delay-1 bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                Trade Smarter{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                  Across Every Market
                </span>
              </h1>
              <p className="text-base sm:text-lg text-neutral-300 max-w-lg mb-8 leading-relaxed animate-fade-in-up-delay-2">
                Analyze forex, metals, indices, and crypto with real-time insights,
                clean setups, and confidence-driven trade intelligence.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up-delay-3">
                <Link href="/auth/signup" className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-lg transition-smooth glow-accent">
                  Get Started Free
                </Link>
                <Link href="/dashboard" className="inline-flex items-center justify-center px-8 py-4 rounded-xl border border-white/20 hover:border-white/40 text-white font-medium text-lg transition-smooth">
                  View Dashboard
                </Link>
              </div>
            </div>

            {/* Right 3D scene */}
            <div className="flex-1 relative min-h-[300px] lg:min-h-0">
              <SplineScene
                scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                className="w-full h-full"
              />
            </div>
          </div>
        </Card>

        {/* Live market cards below */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card, idx) => (
            <FloatingCard key={idx} card={card} className="animate-fade-in-up" />
          ))}
        </div>
      </div>
    </section>
  );
}
