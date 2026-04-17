"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const proSetups = [
  {
    id: "sp1", symbol: "XAU/USD", direction: "buy" as const, timeframe: "1H", setupType: "Breakout",
    entry: "3,285.40", stopLoss: "3,272.00", tp1: "3,298.00", tp2: "3,312.50", rr: 1.9,
    confidence: 89, grade: "A+", validFor: "Valid for 4 hours",
    explanation: "Gold breaks above consolidation with momentum expansion. Higher timeframe bullish, 4H structure intact. Liquidity above 3,298 is the target. Strong institutional buy-side flow detected.",
    invalidation: "Close below 3,272 invalidates the breakout thesis.",
    scoring: { trend: 18, momentum: 15, liquidity: 14, structure: 12, volatility: 8, rr: 12, event: -3 },
    status: "active" as const,
  },
  {
    id: "sp2", symbol: "GBP/JPY", direction: "sell" as const, timeframe: "15m", setupType: "Liquidity Sweep",
    entry: "191.85", stopLoss: "192.25", tp1: "191.20", tp2: "190.80", rr: 2.3,
    confidence: 82, grade: "A", validFor: "Valid for 90 minutes",
    explanation: "Price swept buy-side liquidity above 191.80 and rejected sharply. Bearish engulfing at resistance with momentum shift. Smart money likely distributing here.",
    invalidation: "Close above 192.25 invalidates the sweep reversal.",
    scoring: { trend: 14, momentum: 12, liquidity: 16, structure: 10, volatility: 9, rr: 14, event: -2 },
    status: "active" as const,
  },
  {
    id: "sp3", symbol: "NAS100", direction: "buy" as const, timeframe: "4H", setupType: "Pullback",
    entry: "19,380", stopLoss: "19,280", tp1: "19,520", tp2: "19,650", rr: 1.7,
    confidence: 77, grade: "A", validFor: "Valid for 12 hours",
    explanation: "NAS100 pulled back to demand zone within strong uptrend. 4H structure remains bullish with higher lows. Risk sentiment supportive.",
    invalidation: "Break below 19,280 shifts structure bearish.",
    scoring: { trend: 16, momentum: 10, liquidity: 11, structure: 14, volatility: 6, rr: 10, event: -4 },
    status: "active" as const,
  },
  {
    id: "sp4", symbol: "EUR/USD", direction: "sell" as const, timeframe: "1H", setupType: "Reversal",
    entry: "1.0855", stopLoss: "1.0885", tp1: "1.0810", tp2: "1.0780", rr: 2.1,
    confidence: 74, grade: "B+", validFor: "Valid for 6 hours",
    explanation: "EUR/USD showing bearish reversal at resistance. USD strength building as yields rise. Structure shift on 1H with failed breakout above 1.0880.",
    invalidation: "Close above 1.0885 invalidates the reversal.",
    scoring: { trend: 12, momentum: 11, liquidity: 10, structure: 12, volatility: 7, rr: 12, event: -5 },
    status: "active" as const,
  },
];

function ProSetupCard({ setup }: { setup: typeof proSetups[number] }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = setup.direction === "buy";

  return (
    <div className="glass-card overflow-hidden">
      <div className={cn("h-1.5", isBuy ? "bg-bull" : "bg-bear")} />
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-foreground">{setup.symbol}</h3>
            <span className={cn("text-xs font-bold px-3 py-1 rounded-full uppercase", isBuy ? "badge-bull" : "badge-bear")}>{setup.direction}</span>
            <span className="text-xs bg-surface-2 px-2 py-1 rounded text-muted-light">{setup.timeframe}</span>
            <span className="text-xs bg-surface-2 px-2 py-1 rounded text-muted-light">{setup.setupType}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-sm font-bold px-3 py-1 rounded-lg", setup.grade.startsWith("A") ? "bg-bull/10 text-bull-light" : "bg-warn/10 text-warn")}>{setup.grade}</span>
            <span className="text-lg font-black text-accent-light">{setup.confidence}%</span>
          </div>
        </div>

        {/* Chart placeholder */}
        <div className="h-48 rounded-xl bg-surface-2 border border-border/30 mb-4 relative overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 opacity-30">
            {/* Simulated chart lines */}
            <svg className="w-full h-full" viewBox="0 0 400 200">
              <path d={isBuy ? "M 0 150 Q 50 140, 100 120 T 200 100 T 300 80 T 400 40" : "M 0 50 Q 50 60, 100 80 T 200 100 T 300 130 T 400 170"}
                stroke={isBuy ? "#10b981" : "#f43f5e"} strokeWidth="2" fill="none" />
              {/* Entry line */}
              <line x1="0" y1="100" x2="400" y2="100" stroke="#6366f1" strokeWidth="1" strokeDasharray="4" opacity="0.5" />
              {/* SL line */}
              <line x1="0" y1={isBuy ? "140" : "60"} x2="400" y2={isBuy ? "140" : "60"} stroke="#f43f5e" strokeWidth="1" strokeDasharray="4" opacity="0.5" />
              {/* TP line */}
              <line x1="0" y1={isBuy ? "60" : "150"} x2="400" y2={isBuy ? "60" : "150"} stroke="#10b981" strokeWidth="1" strokeDasharray="4" opacity="0.5" />
            </svg>
          </div>
          <button className="relative z-10 px-4 py-2 bg-accent/20 border border-accent/30 rounded-xl text-sm text-accent-light hover:bg-accent/30 transition-smooth">
            Tap to View Full Chart
          </button>
        </div>

        {/* Trade levels */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-accent-light uppercase tracking-wider mb-1">Entry</div>
            <div className="text-sm font-bold text-foreground font-mono">{setup.entry}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-bear-light uppercase tracking-wider mb-1">Stop</div>
            <div className="text-sm font-bold text-bear-light font-mono">{setup.stopLoss}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-bull-light uppercase tracking-wider mb-1">TP1</div>
            <div className="text-sm font-bold text-bull-light font-mono">{setup.tp1}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 text-center">
            <div className="text-[10px] text-bull-light uppercase tracking-wider mb-1">TP2</div>
            <div className="text-sm font-bold text-bull-light font-mono">{setup.tp2}</div>
          </div>
        </div>

        {/* RR and validity */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted">R:R <strong className="text-foreground">{setup.rr}:1</strong></span>
            <span className="text-xs text-accent-light">{setup.validFor}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-bull pulse-live" />
            <span className="text-xs text-bull-light font-medium">Active</span>
          </div>
        </div>

        {/* Explanation */}
        <div className="bg-surface-2 rounded-xl p-4 mb-4">
          <p className="text-sm text-muted-light leading-relaxed">{setup.explanation}</p>
        </div>

        <button onClick={() => setExpanded(!expanded)} className="text-xs text-accent-light hover:text-accent transition-smooth">
          {expanded ? "Hide scoring breakdown" : "View scoring breakdown"}
        </button>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(setup.scoring).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                  <span className="text-xs text-muted capitalize">{key === "rr" ? "Risk/Reward" : key}</span>
                  <span className={cn("text-xs font-bold font-mono", value >= 0 ? "text-bull-light" : "text-bear-light")}>
                    {value >= 0 ? "+" : ""}{value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-bear/5 border border-bear/10 rounded-lg">
              <span className="text-xs text-bear-light font-medium">Invalidation: </span>
              <span className="text-xs text-muted">{setup.invalidation}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SetupProPage() {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? proSetups : proSetups.filter((s) => s.direction === filter);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">Trade Setup Pro</h1>
          <span className="text-xs bg-accent/20 text-accent-light px-2 py-0.5 rounded-full border border-accent/30">Premium</span>
        </div>
        <p className="text-sm text-muted">Curated A+ setups only. Quality over quantity. Each setup includes chart, scoring breakdown, and clear invalidation.</p>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Active Setups</div><div className="text-2xl font-bold text-foreground">{proSetups.length}</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">A+ Grade</div><div className="text-2xl font-bold text-bull-light">{proSetups.filter((s) => s.grade === "A+").length}</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Avg Confidence</div><div className="text-2xl font-bold text-accent-light">{Math.round(proSetups.reduce((a, b) => a + b.confidence, 0) / proSetups.length)}%</div></div>
        <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Avg R:R</div><div className="text-2xl font-bold text-warn">{(proSetups.reduce((a, b) => a + b.rr, 0) / proSetups.length).toFixed(1)}</div></div>
      </div>

      <div className="flex gap-2">
        {["all", "buy", "sell"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth capitalize",
              filter === f ? (f === "buy" ? "bg-bull text-white" : f === "sell" ? "bg-bear text-white" : "bg-accent text-white") : "bg-surface-2 text-muted-light border border-border/50")}>
            {f === "all" ? "All Setups" : f === "buy" ? "Bullish" : "Bearish"}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {filtered.map((setup) => (<ProSetupCard key={setup.id} setup={setup} />))}
      </div>
    </div>
  );
}
