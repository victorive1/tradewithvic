"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface CommentaryItem {
  id: string;
  timestamp: string;
  symbol: string;
  direction: "bullish" | "bearish" | "neutral";
  priority: "normal" | "major";
  eventType: string;
  color: "green" | "red" | "highlighted_green" | "highlighted_red" | "neutral";
  commentary: string;
}

const eventTypes = ["all", "bullish", "bearish", "major", "news", "liquidity", "breakout", "trap", "structure"];

const sampleCommentary: CommentaryItem[] = [
  { id: "1", timestamp: new Date().toLocaleTimeString(), symbol: "XAU/USD", direction: "bullish", priority: "major", eventType: "news_catalyst", color: "highlighted_green", commentary: "Soft inflation data sparks a strong upside move in gold \u2014 buyers surge into control. Major breakout through 3,285 resistance." },
  { id: "2", timestamp: new Date(Date.now() - 15000).toLocaleTimeString(), symbol: "XAU/USD", direction: "bullish", priority: "normal", eventType: "breakout", color: "green", commentary: "Buyers push through intraday resistance \u2014 bullish momentum building. Follow-through above 3,282 looks clean." },
  { id: "3", timestamp: new Date(Date.now() - 30000).toLocaleTimeString(), symbol: "XAU/USD", direction: "bullish", priority: "normal", eventType: "support_defense", color: "green", commentary: "Heavy defense at 3,275 support \u2014 buyers not giving up this zone. Absorption visible." },
  { id: "4", timestamp: new Date(Date.now() - 45000).toLocaleTimeString(), symbol: "XAU/USD", direction: "bearish", priority: "normal", eventType: "liquidity_sweep", color: "red", commentary: "Lows swept at 3,272 \u2014 sell-side liquidity taken. Watch for reversal or continuation." },
  { id: "5", timestamp: new Date(Date.now() - 60000).toLocaleTimeString(), symbol: "XAU/USD", direction: "neutral", priority: "normal", eventType: "consolidation", color: "neutral", commentary: "Price consolidating between 3,272 and 3,278. Energy building \u2014 breakout imminent." },
  { id: "6", timestamp: new Date(Date.now() - 90000).toLocaleTimeString(), symbol: "XAU/USD", direction: "bearish", priority: "normal", eventType: "rejection", color: "red", commentary: "Sharp rejection after highs taken \u2014 looks like a liquidity grab above 3,280." },
  { id: "7", timestamp: new Date(Date.now() - 120000).toLocaleTimeString(), symbol: "XAU/USD", direction: "bullish", priority: "normal", eventType: "momentum", color: "green", commentary: "Short-term structure shifts upward \u2014 buyers gaining traction after London open." },
  { id: "8", timestamp: new Date(Date.now() - 150000).toLocaleTimeString(), symbol: "XAU/USD", direction: "bearish", priority: "major", eventType: "macro_shift", color: "highlighted_red", commentary: "Hawkish Fed tone triggers selling pressure \u2014 sellers attempting to regain control. Watch for follow-through." },
  { id: "9", timestamp: new Date(Date.now() - 180000).toLocaleTimeString(), symbol: "XAU/USD", direction: "neutral", priority: "normal", eventType: "trap", color: "neutral", commentary: "Breakout lacks commitment \u2014 trap risk rising. Volume thinning into the move." },
  { id: "10", timestamp: new Date(Date.now() - 210000).toLocaleTimeString(), symbol: "XAU/USD", direction: "bullish", priority: "normal", eventType: "institutional", color: "green", commentary: "Price absorbs selling near support \u2014 buyers may be positioning. Institutional accumulation behavior." },
];

function getColorClasses(item: CommentaryItem) {
  switch (item.color) {
    case "highlighted_green":
      return "border-bull bg-bull/10 glow-bull";
    case "highlighted_red":
      return "border-bear bg-bear/10 glow-bear";
    case "green":
      return "border-bull/30 bg-bull/5";
    case "red":
      return "border-bear/30 bg-bear/5";
    default:
      return "border-border/30 bg-surface-2";
  }
}

function getTextColor(item: CommentaryItem) {
  if (item.color.includes("green")) return "text-bull-light";
  if (item.color.includes("red")) return "text-bear-light";
  return "text-muted-light";
}

export default function CommentaryPage() {
  const [filter, setFilter] = useState("all");
  const [paused, setPaused] = useState(false);
  const [items, setItems] = useState(sampleCommentary);
  const feedRef = useRef<HTMLDivElement>(null);

  const filtered = filter === "all" ? items
    : filter === "major" ? items.filter((i) => i.priority === "major")
    : filter === "bullish" ? items.filter((i) => i.direction === "bullish")
    : filter === "bearish" ? items.filter((i) => i.direction === "bearish")
    : items.filter((i) => i.eventType.includes(filter));

  // Simulate new commentary arriving
  useEffect(() => {
    if (paused) return;
    const newComments = [
      "Momentum expanding \u2014 bullish continuation building above breakout level.",
      "Sellers reject the rally at 3,290 \u2014 downside pressure returning.",
      "Buyers reclaim short-term structure after pullback to demand.",
      "Consolidation tightening \u2014 squeeze conditions developing.",
      "Aggressive downside expansion suggests heavy sell participation.",
    ];
    const interval = setInterval(() => {
      const rand = Math.random();
      const dir = rand > 0.5 ? "bullish" : rand > 0.2 ? "bearish" : "neutral";
      const newItem: CommentaryItem = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        symbol: "XAU/USD",
        direction: dir as any,
        priority: Math.random() > 0.85 ? "major" : "normal",
        eventType: ["momentum", "rejection", "breakout", "consolidation", "liquidity_sweep"][Math.floor(Math.random() * 5)],
        color: dir === "bullish" ? (Math.random() > 0.85 ? "highlighted_green" : "green") : dir === "bearish" ? (Math.random() > 0.85 ? "highlighted_red" : "red") : "neutral",
        commentary: newComments[Math.floor(Math.random() * newComments.length)],
      };
      setItems((prev) => [newItem, ...prev].slice(0, 50));
    }, 12000);
    return () => clearInterval(interval);
  }, [paused]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">FX Commentary</h1>
            <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20">
              <span className="w-1.5 h-1.5 rounded-full bg-bull inline-block mr-1 pulse-live" />Live
            </span>
          </div>
          <p className="text-sm text-muted">Live play-by-play market commentary for XAU/USD \u2014 like sports commentary, but for trading</p>
        </div>
        <button onClick={() => setPaused(!paused)}
          className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
            paused ? "bg-bull text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
          {paused ? "Resume Feed" : "Pause Feed"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {eventTypes.map((type) => (
          <button key={type} onClick={() => setFilter(type)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth capitalize",
              filter === type ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>
            {type}
          </button>
        ))}
      </div>

      {/* Live feed */}
      <div ref={feedRef} className="space-y-3 max-h-[700px] overflow-y-auto">
        {filtered.map((item) => (
          <div key={item.id} className={cn("rounded-xl border p-4 transition-all", getColorClasses(item),
            item.priority === "major" ? "relative" : "")}>
            {item.priority === "major" && (
              <span className="absolute top-2 right-3 text-[10px] font-bold uppercase tracking-wider bg-surface/80 px-2 py-0.5 rounded text-foreground">
                MAJOR EVENT
              </span>
            )}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-mono text-muted bg-surface/50 px-2 py-0.5 rounded">{item.timestamp}</span>
              <span className="text-[10px] font-medium text-muted-light">{item.symbol}</span>
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full capitalize",
                item.direction === "bullish" ? "badge-bull" : item.direction === "bearish" ? "badge-bear" : "badge-neutral")}>
                {item.direction}
              </span>
              <span className="text-[10px] text-muted capitalize">{item.eventType.replace(/_/g, " ")}</span>
            </div>
            <p className={cn("text-sm font-medium leading-relaxed", getTextColor(item),
              item.priority === "major" ? "text-base" : "")}>
              {item.commentary}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
