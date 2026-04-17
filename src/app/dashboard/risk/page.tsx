"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export default function RiskPage() {
  const [balance, setBalance] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("1");
  const [entry, setEntry] = useState("1.0840");
  const [stopLoss, setStopLoss] = useState("1.0800");
  const [takeProfit, setTakeProfit] = useState("1.0920");

  const bal = parseFloat(balance) || 0;
  const risk = parseFloat(riskPercent) || 0;
  const ent = parseFloat(entry) || 0;
  const sl = parseFloat(stopLoss) || 0;
  const tp = parseFloat(takeProfit) || 0;

  const dollarRisk = bal * (risk / 100);
  const slPips = Math.abs(ent - sl) * 10000;
  const tpPips = Math.abs(tp - ent) * 10000;
  const pipValue = slPips > 0 ? dollarRisk / slPips : 0;
  const lotSize = pipValue / 10;
  const rr = slPips > 0 ? tpPips / slPips : 0;
  const potentialProfit = dollarRisk * rr;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Position Risk Calculator</h1>
        <p className="text-sm text-muted mt-1">Calculate lot size, risk, and reward for any trade setup</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input */}
        <div className="glass-card p-6 space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Trade Parameters</h3>

          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Account Balance ($)</label>
            <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Risk Per Trade (%)</label>
            <input type="number" step="0.1" value={riskPercent} onChange={(e) => setRiskPercent(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
            <div className="flex gap-2 mt-2">
              {["0.5", "1", "1.5", "2"].map((v) => (
                <button key={v} onClick={() => setRiskPercent(v)}
                  className={cn("px-3 py-1 rounded-lg text-xs transition-smooth", riskPercent === v ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
                  {v}%
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Entry Price</label>
            <input type="number" step="0.0001" value={entry} onChange={(e) => setEntry(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-bear-light mb-1.5 block">Stop Loss</label>
            <input type="number" step="0.0001" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-bear/20 focus:border-bear focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-bull-light mb-1.5 block">Take Profit</label>
            <input type="number" step="0.0001" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-bull/20 focus:border-bull focus:outline-none text-sm text-foreground font-mono" />
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Calculation Results</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-2 rounded-xl p-4 text-center">
                <div className="text-xs text-muted mb-1">Dollar Risk</div>
                <div className="text-xl font-bold text-bear-light">${dollarRisk.toFixed(2)}</div>
              </div>
              <div className="bg-surface-2 rounded-xl p-4 text-center">
                <div className="text-xs text-muted mb-1">Lot Size</div>
                <div className="text-xl font-bold text-accent-light">{lotSize.toFixed(2)}</div>
              </div>
              <div className="bg-surface-2 rounded-xl p-4 text-center">
                <div className="text-xs text-muted mb-1">Stop Distance</div>
                <div className="text-xl font-bold text-foreground">{slPips.toFixed(1)} pips</div>
              </div>
              <div className="bg-surface-2 rounded-xl p-4 text-center">
                <div className="text-xs text-muted mb-1">Target Distance</div>
                <div className="text-xl font-bold text-foreground">{tpPips.toFixed(1)} pips</div>
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Risk/Reward</h3>
            <div className="text-center mb-4">
              <div className={cn("text-4xl font-black", rr >= 2 ? "text-bull-light" : rr >= 1.5 ? "text-warn" : "text-bear-light")}>
                1:{rr.toFixed(1)}
              </div>
              <div className="text-xs text-muted mt-1">Risk to Reward Ratio</div>
            </div>
            <div className="h-4 rounded-full overflow-hidden flex">
              <div className="bg-bear h-full" style={{ width: `${100 / (1 + rr)}%` }} />
              <div className="bg-bull h-full" style={{ width: `${(rr * 100) / (1 + rr)}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-xs">
              <span className="text-bear-light">Risk: ${dollarRisk.toFixed(2)}</span>
              <span className="text-bull-light">Reward: ${potentialProfit.toFixed(2)}</span>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted">Pip Value</span><span className="text-foreground font-mono">${pipValue.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Max Loss</span><span className="text-bear-light font-mono">${dollarRisk.toFixed(2)} ({risk}%)</span></div>
              <div className="flex justify-between"><span className="text-muted">Max Profit</span><span className="text-bull-light font-mono">${potentialProfit.toFixed(2)} ({(risk * rr).toFixed(1)}%)</span></div>
              <div className="flex justify-between"><span className="text-muted">Account After Loss</span><span className="text-foreground font-mono">${(bal - dollarRisk).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Account After Win</span><span className="text-bull-light font-mono">${(bal + potentialProfit).toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
