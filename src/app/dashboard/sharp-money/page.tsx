"use client";

import { cn } from "@/lib/utils";

const sharpMoneyData = [
  { symbol: "XAU/USD", score: 84, direction: "Bullish", signals: ["Liquidity sweep above prior highs with strong rejection", "Aggressive buy-side flow detected", "Institutional accumulation pattern forming"], activity: "high" },
  { symbol: "NAS100", score: 76, direction: "Bullish", signals: ["Strong momentum with institutional participation", "Dip buyers absorbing sell pressure at support"], activity: "high" },
  { symbol: "EUR/USD", score: 68, direction: "Bearish", signals: ["Distribution pattern at resistance", "Smart money likely positioned short after failed breakout"], activity: "medium" },
  { symbol: "GBP/JPY", score: 72, direction: "Bearish", signals: ["Stop hunt above highs followed by aggressive selling", "Institutional distribution visible on volume"], activity: "medium" },
  { symbol: "BTC/USD", score: 55, direction: "Neutral", signals: ["Mixed signals — no clear institutional bias", "Low conviction positioning"], activity: "low" },
  { symbol: "US Oil", score: 71, direction: "Bullish", signals: ["Accumulation at key support", "Smart money buyers defending the zone"], activity: "medium" },
  { symbol: "USD/JPY", score: 63, direction: "Bearish", signals: ["Yield-driven positioning shifting", "Large trader exposure reducing longs"], activity: "medium" },
  { symbol: "XAG/USD", score: 78, direction: "Bullish", signals: ["Following gold institutional flow", "Breakout with strong participation"], activity: "high" },
];

function ScoreMeter({ score }: { score: number }) {
  const color = score >= 75 ? "bg-bull" : score >= 60 ? "bg-accent" : score >= 45 ? "bg-warn" : "bg-muted";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 rounded-full bg-surface-3 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-bold font-mono text-foreground">{score}</span>
    </div>
  );
}

export default function SharpMoneyPage() {
  const sorted = [...sharpMoneyData].sort((a, b) => b.score - a.score);
  const highActivity = sorted.filter((d) => d.activity === "high");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sharp Money Tracker</h1>
        <p className="text-sm text-muted mt-1">Detect institutional activity across all markets. Where is smart money positioning?</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Highest Activity</div>
          <div className="text-2xl font-black text-bull-light">{highActivity[0]?.symbol || "—"}</div>
          <div className="text-xs text-muted mt-1">Score: {highActivity[0]?.score}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Markets Scanned</div>
          <div className="text-2xl font-bold text-foreground">{sorted.length}</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">High Activity</div>
          <div className="text-2xl font-bold text-accent-light">{highActivity.length}</div>
        </div>
      </div>

      <div className="space-y-4">
        {sorted.map((item) => (
          <div key={item.symbol} className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h3 className="text-base font-bold text-foreground">{item.symbol}</h3>
                <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full",
                  item.direction === "Bullish" ? "badge-bull" : item.direction === "Bearish" ? "badge-bear" : "badge-neutral")}>
                  {item.direction}
                </span>
                <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded",
                  item.activity === "high" ? "bg-bull/10 text-bull-light" : item.activity === "medium" ? "bg-accent/10 text-accent-light" : "bg-surface-3 text-muted")}>
                  {item.activity} activity
                </span>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Sharp Money Score</div>
                <ScoreMeter score={item.score} />
              </div>
            </div>
            <div className="space-y-2">
              {item.signals.map((signal, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                    item.direction === "Bullish" ? "bg-bull" : item.direction === "Bearish" ? "bg-bear" : "bg-muted")} />
                  <span className="text-xs text-muted-light">{signal}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
