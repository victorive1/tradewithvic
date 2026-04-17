"use client";

import { cn } from "@/lib/utils";

const briefPoints = [
  { market: "USD", icon: "bull", text: "USD strong on rising bond yields and hawkish Fed tone. Rate cut expectations pushed back." },
  { market: "Gold", icon: "bull", text: "Gold testing all-time highs with institutional buy-side flow. Safe-haven demand rising on geopolitical uncertainty." },
  { market: "NAS100", icon: "bull", text: "NAS100 bullish momentum continues. Tech earnings driving optimism. Watch 19,500 resistance." },
  { market: "EUR", icon: "bear", text: "EUR under pressure as ECB signals June cut. German manufacturing data disappointed." },
  { market: "Oil", icon: "bull", text: "Oil rising on OPEC+ supply concerns and Middle East tensions. WTI testing $63 resistance." },
  { market: "BTC", icon: "neutral", text: "Bitcoin consolidating near $84K resistance. Liquidation map shows large cluster above. Waiting for catalyst." },
  { market: "GBP", icon: "neutral", text: "GBP range-bound ahead of BOE decision. Market pricing no change. Statement tone is key." },
  { market: "JPY", icon: "bear", text: "JPY weakening despite BOJ rate hike expectations. Carry trade flows dominating." },
];

const keyLevels = [
  { pair: "XAU/USD", support: "3,268", resistance: "3,298", bias: "Bullish" },
  { pair: "EUR/USD", support: "1.0800", resistance: "1.0880", bias: "Bearish" },
  { pair: "NAS100", support: "19,280", resistance: "19,520", bias: "Bullish" },
  { pair: "GBP/JPY", support: "190.80", resistance: "192.40", bias: "Bearish" },
];

export default function BriefPage() {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Daily Market Brief</h1>
        <p className="text-sm text-muted mt-1">{today}</p>
      </div>

      {/* Quick pulse */}
      <div className="glass-card p-6 glow-accent">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-bull pulse-live" />
          <h2 className="text-sm font-semibold text-foreground">Today&apos;s Market Pulse</h2>
        </div>
        <div className="grid sm:grid-cols-4 gap-4 mb-4">
          <div className="text-center"><div className="text-xs text-muted mb-1">USD</div><div className="text-sm font-bold text-bull-light">Strong</div></div>
          <div className="text-center"><div className="text-xs text-muted mb-1">Gold</div><div className="text-sm font-bold text-bull-light">Bullish</div></div>
          <div className="text-center"><div className="text-xs text-muted mb-1">Risk</div><div className="text-sm font-bold text-bull-light">Risk-On</div></div>
          <div className="text-center"><div className="text-xs text-muted mb-1">Volatility</div><div className="text-sm font-bold text-warn">Elevated</div></div>
        </div>
      </div>

      {/* Brief bullets */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">What&apos;s Moving Today</h2>
        <div className="space-y-4">
          {briefPoints.map((point, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                point.icon === "bull" ? "bg-bull" : point.icon === "bear" ? "bg-bear" : "bg-muted")} />
              <div>
                <span className="text-xs font-bold text-foreground">{point.market}: </span>
                <span className="text-xs text-muted-light">{point.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Key levels */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Key Levels to Watch</h3>
          <div className="space-y-3">
            {keyLevels.map((level) => (
              <div key={level.pair} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <span className="text-sm font-medium text-foreground">{level.pair}</span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-bear-light">S: {level.support}</span>
                  <span className="text-bull-light">R: {level.resistance}</span>
                  <span className={cn("font-medium px-2 py-0.5 rounded-full",
                    level.bias === "Bullish" ? "badge-bull" : "badge-bear")}>{level.bias}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Events */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Today&apos;s Events</h3>
          <div className="space-y-3">
            {[
              { time: "08:30", event: "US CPI (YoY)", impact: "HIGH", flag: "US" },
              { time: "13:00", event: "BOE Rate Decision", impact: "HIGH", flag: "UK" },
              { time: "14:30", event: "ECB Lagarde Speech", impact: "MED", flag: "EU" },
            ].map((event, i) => (
              <div key={i} className="flex items-center justify-between bg-surface-2 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted">{event.time}</span>
                  <span className="text-xs text-foreground">{event.event}</span>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded",
                  event.impact === "HIGH" ? "bg-bear text-white" : "bg-warn text-black")}>{event.impact}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Summary</h3>
        <p className="text-sm text-muted-light leading-relaxed">
          Markets are in a risk-on environment with USD strength dominating. Gold continues to test highs on institutional demand. Major focus today is US CPI data and BOE rate decision — expect elevated volatility around those events. Best opportunities likely in gold (bullish continuation), NAS100 (momentum long), and EUR/USD (bearish on ECB divergence).
        </p>
      </div>
    </div>
  );
}
