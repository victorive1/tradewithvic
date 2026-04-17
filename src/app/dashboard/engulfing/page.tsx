"use client";

import { cn } from "@/lib/utils";

const engulfingSetups = [
  { symbol: "XAU/USD", type: "Bullish Engulfing", eps: 0.85, probability: "High", timeframe: "1H", session: "New York",
    entry: "3,278.20", stopLoss: "3,268.50", target: "3,298.00", rr: "2.0",
    reason: "Liquidity sweep below equal lows + strong bullish engulfing at demand zone + momentum shift confirmed. London/NY overlap.",
    scoring: { liquidity: 0.95, location: 0.85, momentum: 0.80, volatility: 0.75, session: 1.0 } },
  { symbol: "GBP/JPY", type: "Bearish Engulfing", eps: 0.78, probability: "High", timeframe: "15m", session: "London",
    entry: "192.10", stopLoss: "192.45", target: "191.20", rr: "2.6",
    reason: "Stop hunt above previous high + bearish engulfing at resistance + break of structure on 15m. Strong body close.",
    scoring: { liquidity: 0.85, location: 0.80, momentum: 0.70, volatility: 0.80, session: 1.0 } },
  { symbol: "EUR/USD", type: "Bearish Engulfing", eps: 0.71, probability: "Medium-High", timeframe: "4H", session: "New York",
    entry: "1.0868", stopLoss: "1.0895", target: "1.0810", rr: "2.1",
    reason: "Price at weekly resistance + bearish engulfing with large body + higher timeframe bearish bias confirmed.",
    scoring: { liquidity: 0.60, location: 0.90, momentum: 0.65, volatility: 0.70, session: 0.80 } },
  { symbol: "NAS100", type: "Bullish Engulfing", eps: 0.67, probability: "Medium", timeframe: "1H", session: "Cash Open",
    entry: "19,340", stopLoss: "19,280", target: "19,480", rr: "2.3",
    reason: "Engulfing at 4H demand zone. Moderate liquidity context. Trend aligned but momentum still developing.",
    scoring: { liquidity: 0.50, location: 0.75, momentum: 0.65, volatility: 0.70, session: 0.80 } },
];

function EPSMeter({ eps }: { eps: number }) {
  const pct = eps * 100;
  const color = pct >= 75 ? "bg-bull" : pct >= 60 ? "bg-accent" : "bg-warn";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold font-mono text-foreground">{eps.toFixed(2)}</span>
    </div>
  );
}

export default function EngulfingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Engulfing Candle Detector</h1>
        <p className="text-sm text-muted mt-1">Elite engulfing setups scored by the EPS formula: Liquidity + Location + Momentum + Volatility + Session</p>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">EPS Formula</h3>
        <code className="text-xs text-accent-light bg-surface-2 px-3 py-1.5 rounded-lg inline-block">
          EPS = (LQ * 0.30) + (LOC * 0.25) + (MOM * 0.20) + (VOL * 0.15) + (TIME * 0.10)
        </code>
        <div className="flex gap-4 mt-3 text-xs text-muted">
          <span>EPS &ge; 0.75 = <strong className="text-bull-light">High Probability</strong></span>
          <span>0.60-0.74 = <strong className="text-warn">Medium</strong></span>
          <span>&lt; 0.60 = <strong className="text-muted">Ignore</strong></span>
        </div>
      </div>

      <div className="space-y-4">
        {engulfingSetups.map((setup) => {
          const isBull = setup.type.includes("Bullish");
          return (
            <div key={setup.symbol + setup.timeframe} className="glass-card overflow-hidden">
              <div className={cn("h-1.5", isBull ? "bg-bull" : "bg-bear")} />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold">{setup.symbol}</h3>
                    <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", isBull ? "badge-bull" : "badge-bear")}>{setup.type}</span>
                    <span className="text-xs bg-surface-2 px-2 py-1 rounded">{setup.timeframe}</span>
                    <span className="text-xs bg-surface-2 px-2 py-1 rounded">{setup.session}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted mb-1">EPS Score</div>
                    <EPSMeter eps={setup.eps} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-surface-2 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-accent-light uppercase mb-1">Entry</div>
                    <div className="text-sm font-bold font-mono">{setup.entry}</div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-bear-light uppercase mb-1">Stop</div>
                    <div className="text-sm font-bold font-mono text-bear-light">{setup.stopLoss}</div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-bull-light uppercase mb-1">Target</div>
                    <div className="text-sm font-bold font-mono text-bull-light">{setup.target}</div>
                  </div>
                  <div className="bg-surface-2 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-muted uppercase mb-1">R:R</div>
                    <div className="text-sm font-bold font-mono">{setup.rr}</div>
                  </div>
                </div>

                <p className="text-xs text-muted-light leading-relaxed mb-4">{setup.reason}</p>

                {/* EPS breakdown */}
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(setup.scoring).map(([key, val]) => (
                    <div key={key} className="bg-surface-2 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">{key === "liquidity" ? "LQ" : key === "location" ? "LOC" : key === "momentum" ? "MOM" : key === "volatility" ? "VOL" : "TIME"}</div>
                      <div className={cn("text-xs font-bold", val >= 0.8 ? "text-bull-light" : val >= 0.6 ? "text-accent-light" : "text-warn")}>{val.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
