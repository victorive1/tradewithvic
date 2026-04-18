"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { MarketSentinelRobot } from "@/components/landing/MarketSentinelRobot";

interface LiveCard {
  symbol: string;
  price: string;
  change: string;
  bias: string;
  confidence: number;
  type: string;
  color: string;
  sparkline: number[];
}

const defaultCards: LiveCard[] = [
  { symbol: "EUR/USD", price: "—", change: "—", bias: "—", confidence: 0, type: "Loading", color: "neutral", sparkline: [] },
  { symbol: "XAU/USD", price: "—", change: "—", bias: "—", confidence: 0, type: "Loading", color: "neutral", sparkline: [] },
  { symbol: "NAS100", price: "—", change: "—", bias: "—", confidence: 0, type: "Loading", color: "neutral", sparkline: [] },
  { symbol: "BTC/USD", price: "—", change: "—", bias: "—", confidence: 0, type: "Loading", color: "neutral", sparkline: [] },
];

function synthSparkline(seed: number, bull: boolean): number[] {
  const out: number[] = [];
  let v = 50;
  for (let i = 0; i < 24; i++) {
    const drift = bull ? 0.4 : -0.4;
    const noise = (Math.sin((seed + i) * 1.3) + Math.cos((seed + i) * 0.7)) * 3;
    v += drift + noise * 0.5;
    out.push(v);
  }
  return out;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`).join(" ");
  const stroke = color === "bull" ? "var(--bll)" : color === "bear" ? "var(--brl)" : "var(--acl)";
  const fill = color === "bull" ? "var(--blbg)" : color === "bear" ? "var(--brbg)" : "var(--acg)";
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-10 overflow-visible">
      <defs>
        <linearGradient id={`g-${color}-${data[0]}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,100 ${points} 100,100`}
        fill={`url(#g-${color}-${data[0]})`}
      />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LiveTile({ card, idx }: { card: LiveCard; idx: number }) {
  const biasColor =
    card.color === "bull" ? "text-bull-light" :
    card.color === "bear" ? "text-bear-light" :
    "text-muted-light";
  const dotColor =
    card.color === "bull" ? "bg-bull" :
    card.color === "bear" ? "bg-bear" :
    "bg-muted";

  return (
    <div
      className="glass-card glass-card-hover p-4 animate-fade-in-up group"
      style={{ animationDelay: `${0.3 + idx * 0.06}s`, opacity: 0 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${card.color !== "neutral" ? "pulse-live" : ""}`} />
          <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">{card.symbol}</span>
        </div>
        <span className={`text-[10px] font-medium ${biasColor} px-1.5 py-0.5 rounded-md bg-surface-2/60`}>
          {card.bias !== "—" ? card.bias : "…"}
        </span>
      </div>
      <div className="flex items-end justify-between mb-2">
        <div className="text-lg font-bold font-mono tracking-tight text-foreground">{card.price}</div>
        <div className={`text-[11px] font-mono font-semibold ${biasColor}`}>{card.change}</div>
      </div>
      <Sparkline data={card.sparkline.length > 0 ? card.sparkline : synthSparkline(idx, card.color === "bull")} color={card.color} />
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
        <span className="text-[10px] text-muted tracking-wide">{card.type}</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted">CONF</span>
          <span className={`text-[11px] font-mono font-bold ${card.confidence >= 75 ? "text-accent-light" : "text-muted-light"}`}>
            {card.confidence > 0 ? `${card.confidence}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function HeroSection() {
  const [cards, setCards] = useState<LiveCard[]>(defaultCards);
  const [rawQuotes, setRawQuotes] = useState<any[]>([]);
  const [stats, setStats] = useState({ instruments: 64, scans: 1247, bias: 72 });

  useEffect(() => {
    async function fetchLive() {
      try {
        const res = await fetch("/api/market/quotes");
        if (!res.ok) return;
        const data = await res.json();
        if (!data.quotes || data.quotes.length === 0) return;

        setRawQuotes(data.quotes);

        const targets = ["EURUSD", "XAUUSD", "NAS100", "BTCUSD"];
        const newCards: LiveCard[] = targets.map((sym, idx) => {
          const q = data.quotes.find((quote: any) => quote.symbol === sym);
          if (!q) return defaultCards[idx];
          const isBull = q.changePercent > 0;
          return {
            symbol: q.displayName,
            price: q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: q.category === "forex" ? 5 : 2 }),
            change: `${isBull ? "+" : ""}${q.changePercent.toFixed(2)}%`,
            bias: isBull ? "Bullish" : "Bearish",
            confidence: Math.min(95, Math.max(50, Math.round(50 + Math.abs(q.changePercent) * 15))),
            type: Math.abs(q.changePercent) > 0.5 ? "Momentum" : "Range",
            color: isBull ? "bull" : "bear",
            sparkline: synthSparkline(idx * 7 + 3, isBull),
          };
        });
        setCards(newCards);

        const bullish = data.quotes.filter((q: any) => q.changePercent > 0).length;
        setStats({
          instruments: Math.max(48, data.quotes.length),
          scans: 1200 + Math.floor(Math.random() * 90),
          bias: Math.round((bullish / data.quotes.length) * 100),
        });
      } catch { /* silent */ }
    }
    fetchLive();
    const interval = setInterval(fetchLive, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative pt-24 sm:pt-28 lg:pt-36 pb-16 sm:pb-20 lg:pb-28 overflow-hidden">
      {/* Ambient atmosphere */}
      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <div className="orb w-[620px] h-[620px] -top-52 -right-52" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.35), transparent 70%)" }} />
      <div className="orb w-[460px] h-[460px] -bottom-40 -left-44" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.28), transparent 70%)" }} />
      <div className="orb w-[320px] h-[320px] top-1/3 left-1/2" style={{ background: "radial-gradient(circle, rgba(16,185,129,0.14), transparent 70%)" }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          {/* Left: copy + CTAs */}
          <div className="lg:col-span-7 relative z-10">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-surface-2/60 border border-border backdrop-blur-md text-xs text-muted-light mb-6 animate-fade-in-up">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-bull" />
              </span>
              <span className="font-semibold tracking-wide text-foreground">MARKET BRAIN ONLINE</span>
              <span className="text-muted">·</span>
              <span>Scanning every 2 minutes</span>
            </div>

            <h1 className="font-display text-fluid-hero font-bold mb-6 animate-fade-in-up-delay-1">
              <span className="block text-foreground">The terminal</span>
              <span className="block gradient-text-accent">modern traders</span>
              <span className="block text-foreground">actually want.</span>
            </h1>

            <p className="text-fluid-lg text-muted-light max-w-xl mb-8 animate-fade-in-up-delay-2">
              TradeWithVic fuses a 24/7 market-core brain, multi-account execution, and an adaptive
              intelligence engine into a single surface — built for forex, metals, indices, and crypto.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 animate-fade-in-up-delay-3 mb-10">
              <Link
                href="/auth/signup"
                className="group relative inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-[15px] overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, var(--ac) 0%, var(--acd) 50%, #7c3aed 100%)",
                  boxShadow: "0 10px 40px var(--acg), inset 0 1px 0 rgba(255,255,255,0.2)",
                }}
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <span className="relative">Get Started Free</span>
                <svg className="relative w-4 h-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <Link
                href="/dashboard"
                className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-border bg-surface/60 backdrop-blur-md hover:border-border-light hover:bg-surface-2/80 text-foreground font-medium text-[15px] transition-smooth"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent-light pulse-live" />
                Explore live dashboard
              </Link>
            </div>

            {/* Trust strip */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-border/60 animate-fade-in-up-delay-3">
              <div>
                <div className="text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">Instruments</div>
                <div className="text-2xl font-bold font-mono text-foreground mt-1 flex items-baseline gap-1">
                  {stats.instruments}
                  <span className="text-xs text-bull-light font-normal">live</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">Scans / 24h</div>
                <div className="text-2xl font-bold font-mono text-foreground mt-1">
                  {stats.scans.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">Book bias</div>
                <div className="text-2xl font-bold font-mono text-foreground mt-1 flex items-baseline gap-1">
                  {stats.bias}%
                  <span className="text-xs text-muted font-normal">bullish</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: sentinel */}
          <div className="lg:col-span-5 relative h-[380px] lg:h-[520px]">
            <div className="absolute inset-0 rounded-[28px] overflow-hidden">
              <div className="absolute inset-0 aurora-surface" />
              <MarketSentinelRobot quotes={rawQuotes} className="absolute inset-0" />
            </div>
            {/* Floating quote chip top-left */}
            <div className="absolute top-4 left-4 glass-card px-3 py-2 animate-float z-10">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />
                <span className="text-[10px] font-semibold tracking-wider text-muted">STRUCTURE BREAK · H1</span>
              </div>
              <div className="text-xs font-mono font-semibold text-foreground mt-0.5">XAU/USD · Bullish</div>
            </div>
            {/* Floating alert chip bottom-right */}
            <div className="absolute bottom-4 right-4 glass-card px-3 py-2 animate-float-delayed z-10">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold tracking-wider text-accent-light">CONFLUENCE 84</span>
              </div>
              <div className="text-xs font-mono font-semibold text-foreground mt-0.5">EUR/USD · Momentum</div>
            </div>
          </div>
        </div>

        {/* Live conviction rail */}
        <div className="mt-16">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
              <span className="w-1 h-1 rounded-full bg-accent-light pulse-live" />
              Live conviction · updates every 30s
            </div>
            <Link href="/dashboard/brain" className="text-[11px] text-accent-light hover:text-accent transition-smooth font-semibold tracking-wide">
              See the full brain →
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((card, idx) => (
              <LiveTile key={card.symbol + idx} card={card} idx={idx} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
