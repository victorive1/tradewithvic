"use client";

import { cn } from "@/lib/utils";

const sentimentData = [
  { pair: "EUR/USD", retailLong: 78, retailShort: 22, smartMoney: "Bearish", signal: "Fade retail longs" },
  { pair: "GBP/USD", retailLong: 65, retailShort: 35, smartMoney: "Neutral", signal: "No clear edge" },
  { pair: "USD/JPY", retailLong: 32, retailShort: 68, smartMoney: "Bullish", signal: "Fade retail shorts" },
  { pair: "XAU/USD", retailLong: 72, retailShort: 28, smartMoney: "Bullish", signal: "Aligned with retail" },
  { pair: "GBP/JPY", retailLong: 58, retailShort: 42, smartMoney: "Bearish", signal: "Fade retail longs" },
  { pair: "AUD/USD", retailLong: 61, retailShort: 39, smartMoney: "Bearish", signal: "Fade retail longs" },
  { pair: "NAS100", retailLong: 82, retailShort: 18, smartMoney: "Neutral", signal: "Caution - crowded" },
  { pair: "BTC/USD", retailLong: 75, retailShort: 25, smartMoney: "Neutral", signal: "Monitor for reversal" },
];

function SentimentRow({ data }: { data: (typeof sentimentData)[number] }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{data.pair}</span>
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
          data.smartMoney === "Bullish" ? "badge-bull" : data.smartMoney === "Bearish" ? "badge-bear" : "badge-neutral")}>
          Smart Money: {data.smartMoney}
        </span>
      </div>

      {/* Sentiment bar */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-bull-light w-12">{data.retailLong}%</span>
        <div className="flex-1 h-3 rounded-full overflow-hidden flex">
          <div className="bg-bull h-full" style={{ width: `${data.retailLong}%` }} />
          <div className="bg-bear h-full" style={{ width: `${data.retailShort}%` }} />
        </div>
        <span className="text-xs text-bear-light w-12 text-right">{data.retailShort}%</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Retail: Long {data.retailLong}% / Short {data.retailShort}%</span>
        <span className="text-accent-light">{data.signal}</span>
      </div>
    </div>
  );
}

export default function SentimentPage() {
  const extremeLong = sentimentData.filter((d) => d.retailLong >= 70);
  const extremeShort = sentimentData.filter((d) => d.retailShort >= 70);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sentiment Dashboard</h1>
        <p className="text-sm text-muted mt-1">Retail vs institutional positioning — smart money traders often fade extreme retail sentiment</p>
        <p className="text-xs text-muted mb-4">Analysis snapshot — updated periodically from positioning data</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Extreme Long Bias</div>
          <div className="text-2xl font-bold text-bull-light">{extremeLong.length} pairs</div>
          <div className="text-xs text-muted mt-1">Potential fade opportunity</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Extreme Short Bias</div>
          <div className="text-2xl font-bold text-bear-light">{extremeShort.length} pairs</div>
          <div className="text-xs text-muted mt-1">Potential squeeze</div>
        </div>
        <div className="glass-card p-5 text-center">
          <div className="text-xs text-muted mb-2">Key Insight</div>
          <div className="text-sm font-medium text-foreground">When retail is 70%+ one direction, consider the opposite</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {sentimentData.map((data) => (
          <SentimentRow key={data.pair} data={data} />
        ))}
      </div>
    </div>
  );
}
