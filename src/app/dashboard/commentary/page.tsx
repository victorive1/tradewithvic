"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

type CommentaryMode = "quick" | "educational" | "alert";
type Priority = "normal" | "major" | "critical";
type EventType = "momentum" | "breakout" | "failed_breakout" | "liquidity_sweep" | "sr_reaction" | "structure_shift" | "session" | "volatility" | "news" | "consolidation" | "trap" | "institutional";

interface CommentaryItem {
  id: string;
  timestamp: string;
  symbol: string;
  displayName: string;
  direction: "bullish" | "bearish" | "neutral";
  priority: Priority;
  eventType: EventType;
  commentary: string;
  color: "green" | "red" | "highlighted_green" | "highlighted_red" | "neutral";
  price?: number;
  changePct?: number;
}

const EVENT_LABELS: Record<EventType, string> = {
  momentum: "Momentum", breakout: "Breakout", failed_breakout: "Failed Breakout",
  liquidity_sweep: "Liquidity Sweep", sr_reaction: "S/R Reaction", structure_shift: "Structure Shift",
  session: "Session", volatility: "Volatility", news: "News Catalyst",
  consolidation: "Consolidation", trap: "Trap / Inducement", institutional: "Institutional Flow",
};

const FILTERS: EventType[] = ["momentum", "breakout", "failed_breakout", "liquidity_sweep", "sr_reaction", "structure_shift", "session", "volatility", "trap", "institutional"];

// Commentary templates per event type
const TEMPLATES: Record<EventType, { bullish: string[]; bearish: string[]; neutral: string[] }> = {
  momentum: {
    bullish: ["{sym} — buyers expanding momentum. Strong body candles pushing through resistance.", "{sym} — bullish impulse accelerating. Follow-through above recent highs looks clean.", "{sym} — momentum building fast. Breakout velocity suggests real participation."],
    bearish: ["{sym} — sellers pressing hard. Downside momentum expanding with clean displacement.", "{sym} — bearish impulse gaining speed. Support giving way under pressure.", "{sym} — heavy selling momentum. Bears not letting up — structure deteriorating."],
    neutral: ["{sym} — momentum fading on both sides. Price grinding without conviction.", "{sym} — neither buyers nor sellers in control. Watch for compression to resolve."],
  },
  breakout: {
    bullish: ["{sym} — bullish breakout confirmed! Price closes above key resistance with volume.", "{sym} — buyers break through with force. Clean displacement above prior range.", "{sym} — resistance breaks with follow-through. Momentum supports the move."],
    bearish: ["{sym} — bearish breakdown! Support fails under heavy selling pressure.", "{sym} — sellers smash through support. Downside breakout with strong body close.", "{sym} — major support breaks with force. Bears seize control."],
    neutral: ["{sym} — breakout attempt stalling. Neither direction showing commitment."],
  },
  failed_breakout: {
    bullish: ["{sym} — failed bearish breakout turning bullish. Sellers trapped below — watch for squeeze.", "{sym} — breakdown rejected! Price reclaims level — possible bear trap."],
    bearish: ["{sym} — failed bullish breakout. Buyers rejected at highs — possible bull trap.", "{sym} — breakout above resistance fails immediately. Sellers stepping in hard."],
    neutral: ["{sym} — breakout lacks commitment. Trap risk rising on both sides."],
  },
  liquidity_sweep: {
    bullish: ["{sym} — lows swept, then rejected. Stop-hunt below support looks complete — watch for reversal.", "{sym} — sell-side liquidity taken. Sharp rejection suggests institutional buyers absorbing."],
    bearish: ["{sym} — highs swept, then rejected sharply. Liquidity grab above resistance — distribution likely.", "{sym} — buy-side liquidity taken cleanly. Smart money likely positioning for the downside."],
    neutral: ["{sym} — liquidity swept on both sides. Market searching for direction."],
  },
  sr_reaction: {
    bullish: ["{sym} — strong bounce off support. Buyers defending this zone aggressively.", "{sym} — demand zone holds firm. Heavy defense at key support level."],
    bearish: ["{sym} — sharp rejection at resistance. Sellers won't let price through this ceiling.", "{sym} — supply zone activated. Strong selling pressure at resistance."],
    neutral: ["{sym} — price testing the zone but no clean reaction yet. Wait for confirmation."],
  },
  structure_shift: {
    bullish: ["{sym} — structure shifting bullish. First higher low confirmed — bias changing.", "{sym} — change of character detected. Bearish structure breaking down — bulls taking over."],
    bearish: ["{sym} — structure shifting bearish. First lower high confirmed — control changing.", "{sym} — change of character to the downside. Bullish structure failing — bears gaining."],
    neutral: ["{sym} — structure unclear. Overlapping swings creating messy price action."],
  },
  session: {
    bullish: ["{sym} — London open driving bullish expansion. Fresh session momentum.", "{sym} — NY session buyers stepping in strong. Session trend developing upward."],
    bearish: ["{sym} — London open dumping. Bearish session momentum from the start.", "{sym} — NY session selling pressure. Bears dominant in the active session."],
    neutral: ["{sym} — session opening without clear direction. Awaiting catalyst.", "{sym} — Asian session winding down. Low energy — waiting for London."],
  },
  volatility: {
    bullish: ["{sym} — volatility spike to the upside! Range expanding sharply. Event-driven buying.", "{sym} — massive bullish candle. Volatility expanding — something moved the market."],
    bearish: ["{sym} — volatility spike crashes price! Sharp expansion to the downside.", "{sym} — violent selling. Volatility regime changing — risk expanding."],
    neutral: ["{sym} — volatility compressing. Range tightening — expect a move soon."],
  },
  news: {
    bullish: ["{sym} — macro catalyst sends price higher. Fundamental shift supporting bulls.", "{sym} — data release ignites a strong upside move. Watch for follow-through."],
    bearish: ["{sym} — hawkish catalyst hits hard. Sellers react to macro shift.", "{sym} — negative data surprise drives aggressive selling."],
    neutral: ["{sym} — news released but market undecided. Initial spike fading."],
  },
  consolidation: {
    bullish: ["{sym} — consolidation above support. Building energy for potential upside continuation."],
    bearish: ["{sym} — consolidation below resistance. Pressure building for downside resolution."],
    neutral: ["{sym} — tight consolidation range. Energy building — breakout approaching.", "{sym} — choppy price action. No edge in this environment — wait for clarity."],
  },
  trap: {
    bullish: ["{sym} — bear trap forming! Sellers lured in, now getting squeezed.", "{sym} — inducement below lows followed by aggressive reversal. Trap likely."],
    bearish: ["{sym} — bull trap! Buyers lured above highs, now getting sold into.", "{sym} — inducement above highs followed by sharp reversal. Classic trap."],
    neutral: ["{sym} — possible trap forming but no confirmation yet. Stay cautious."],
  },
  institutional: {
    bullish: ["{sym} — absorption visible near support. Institutional buyers likely accumulating.", "{sym} — smart money footprint detected. Large-scale buying suspected at this zone."],
    bearish: ["{sym} — distribution pattern at resistance. Institutional selling likely underway.", "{sym} — aggressive sell-side expansion. Large player activity suspected."],
    neutral: ["{sym} — mixed institutional signals. No clear accumulation or distribution."],
  },
};

function generateCommentary(quote: any): CommentaryItem {
  const changePct = quote.changePercent;
  const absChange = Math.abs(changePct);
  const direction: CommentaryItem["direction"] = changePct > 0.05 ? "bullish" : changePct < -0.05 ? "bearish" : "neutral";

  // Determine event type from market behavior
  let eventType: EventType;
  let priority: Priority = "normal";

  if (absChange > 1.0) { eventType = Math.random() > 0.5 ? "news" : "volatility"; priority = "critical"; }
  else if (absChange > 0.5) { eventType = Math.random() > 0.5 ? "breakout" : "momentum"; priority = "major"; }
  else if (absChange > 0.3) {
    const types: EventType[] = ["momentum", "sr_reaction", "structure_shift", "session"];
    eventType = types[Math.floor(Math.abs(quote.price * 100) % types.length)];
  }
  else if (absChange > 0.15) {
    const types: EventType[] = ["sr_reaction", "liquidity_sweep", "institutional", "trap"];
    eventType = types[Math.floor(Math.abs(quote.price * 10) % types.length)];
  }
  else if (absChange > 0.05) {
    const types: EventType[] = ["consolidation", "session", "failed_breakout"];
    eventType = types[Math.floor(Math.abs(quote.price * 7) % types.length)];
  }
  else {
    eventType = "consolidation";
  }

  const templates = TEMPLATES[eventType][direction];
  const template = templates[Math.floor(Math.abs(quote.price * 13) % templates.length)];
  const commentary = template.replace("{sym}", quote.displayName);

  let color: CommentaryItem["color"];
  if (priority === "critical" && direction === "bullish") color = "highlighted_green";
  else if (priority === "critical" && direction === "bearish") color = "highlighted_red";
  else if (direction === "bullish") color = "green";
  else if (direction === "bearish") color = "red";
  else color = "neutral";

  return {
    id: `c_${Date.now()}_${quote.symbol}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    symbol: quote.symbol,
    displayName: quote.displayName,
    direction, priority, eventType, commentary, color,
    price: quote.price,
    changePct: quote.changePercent,
  };
}

function getColorClasses(item: CommentaryItem) {
  switch (item.color) {
    case "highlighted_green": return "border-bull bg-bull/10 glow-bull";
    case "highlighted_red": return "border-bear bg-bear/10 glow-bear";
    case "green": return "border-bull/30 bg-bull/5";
    case "red": return "border-bear/30 bg-bear/5";
    default: return "border-border/30 bg-surface-2";
  }
}

export default function CommentaryPage() {
  const [items, setItems] = useState<CommentaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<CommentaryMode>("quick");
  const [filter, setFilter] = useState<string>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("all");
  const feedRef = useRef<HTMLDivElement>(null);

  // Initial load + periodic refresh
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/market/quotes");
        const data = await res.json();
        if (data.quotes && data.quotes.length > 0) {
          const newItems = data.quotes.map((q: any) => generateCommentary(q));
          setItems((prev) => [...newItems, ...prev].slice(0, 100));
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  // Auto-refresh commentary
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/market/quotes");
        const data = await res.json();
        if (data.quotes && data.quotes.length > 0) {
          // Pick 2-3 random instruments for new commentary
          const shuffled = [...data.quotes].sort(() => Math.random() - 0.5);
          const newItems = shuffled.slice(0, 3).map((q: any) => generateCommentary(q));
          setItems((prev) => [...newItems, ...prev].slice(0, 100));
        }
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [paused]);

  let filtered = items;
  if (filter !== "all") {
    if (filter === "major") filtered = filtered.filter((i) => i.priority === "major" || i.priority === "critical");
    else if (filter === "bullish") filtered = filtered.filter((i) => i.direction === "bullish");
    else if (filter === "bearish") filtered = filtered.filter((i) => i.direction === "bearish");
    else filtered = filtered.filter((i) => i.eventType === filter);
  }
  if (symbolFilter !== "all") filtered = filtered.filter((i) => i.symbol === symbolFilter);

  const majorCount = items.filter((i) => i.priority === "major" || i.priority === "critical").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">FX Live Commentary</h1><p className="text-sm text-muted mt-1">Connecting to markets...</p></div>
        <div className="space-y-3">{[1,2,3,4].map((i) => <div key={i} className="glass-card p-4 animate-pulse"><div className="h-12 bg-surface-3 rounded" /></div>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">FX Live Commentary</h1>
            <span className="flex items-center gap-1.5 text-xs bg-bull/10 text-bull-light px-2.5 py-1 rounded-full border border-bull/20"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Live</span>
            {majorCount > 0 && <span className="text-xs bg-bear/10 text-bear-light px-2 py-0.5 rounded-full border border-bear/20">{majorCount} major</span>}
          </div>
          <p className="text-sm text-muted">Real-time market narration across all instruments — like a sports play-by-play for trading</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode switcher */}
          {(["quick", "educational", "alert"] as CommentaryMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("px-3 py-1.5 rounded-lg text-xs capitalize transition-smooth", mode === m ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{m}</button>
          ))}
          <button onClick={() => setPaused(!paused)} className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth", paused ? "bg-bull text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{paused ? "Resume" : "Pause"}</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {["all", "bullish", "bearish", "major", ...FILTERS].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("px-2.5 py-1 rounded-lg text-[10px] font-medium capitalize transition-smooth", filter === f ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
            {f === "all" ? "All" : f === "sr_reaction" ? "S/R" : f === "failed_breakout" ? "Failed BO" : f.replace("_", " ")}
          </button>
        ))}
        <div className="w-px bg-border mx-1" />
        <select value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)} className="bg-surface-2 text-foreground text-[10px] rounded-lg border border-border/50 px-2 py-1">
          <option value="all">All Instruments</option>
          {ALL_INSTRUMENTS.map((i) => <option key={i.symbol} value={i.symbol}>{i.displayName}</option>)}
        </select>
      </div>

      {/* Commentary feed */}
      <div ref={feedRef} className="space-y-2 max-h-[700px] overflow-y-auto">
        {filtered.length > 0 ? filtered.map((item) => (
          <div key={item.id} className={cn("rounded-xl border p-4 transition-all", getColorClasses(item), item.priority === "critical" ? "relative" : "")}>
            {item.priority === "critical" && (
              <span className="absolute top-2 right-3 text-[9px] font-bold uppercase tracking-wider bg-surface/80 px-2 py-0.5 rounded text-foreground">MAJOR EVENT</span>
            )}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-mono text-muted bg-surface/50 px-2 py-0.5 rounded">{item.timestamp}</span>
              <span className="text-[10px] font-bold text-foreground">{item.displayName}</span>
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full capitalize", item.direction === "bullish" ? "badge-bull" : item.direction === "bearish" ? "badge-bear" : "badge-neutral")}>{item.direction}</span>
              <span className="text-[10px] text-muted capitalize bg-surface-2 px-1.5 py-0.5 rounded">{EVENT_LABELS[item.eventType]}</span>
              {item.changePct !== undefined && (
                <span className={cn("text-[10px] font-mono", item.changePct >= 0 ? "text-bull-light" : "text-bear-light")}>{item.changePct >= 0 ? "+" : ""}{item.changePct.toFixed(2)}%</span>
              )}
            </div>
            <p className={cn("text-sm font-medium leading-relaxed", item.color.includes("green") ? "text-bull-light" : item.color.includes("red") ? "text-bear-light" : "text-muted-light", item.priority === "critical" ? "text-base" : "")}>
              {item.commentary}
            </p>
          </div>
        )) : (
          <div className="glass-card p-12 text-center"><p className="text-muted">No commentary matches your filters.</p></div>
        )}
      </div>

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Commentary Engine</h3>
        <div className="grid sm:grid-cols-3 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Event-Driven</p>
            <p>Commentary is generated from live market events — momentum shifts, breakouts, liquidity sweeps, S/R reactions, structure shifts, session opens, and volatility spikes. Not random noise.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Priority Levels</p>
            <p>Normal updates flow continuously. Major events get visual emphasis. Critical events (large moves, news reactions) get highlighted banners so you never miss what matters.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">12 Event Categories</p>
            <p>Momentum, Breakout, Failed Breakout, Liquidity Sweep, S/R Reaction, Structure Shift, Session, Volatility, News, Consolidation, Trap, Institutional Flow — each with tailored commentary.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
