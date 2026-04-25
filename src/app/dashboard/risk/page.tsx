"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { computeLotSize } from "@/lib/trading/lot-sizing";

type RiskMode = "percent" | "dollar";

export default function RiskPage() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [balance, setBalance] = useState("10000");
  const [riskMode, setRiskMode] = useState<RiskMode>("percent");
  const [riskPercent, setRiskPercent] = useState("1");
  const [riskDollar, setRiskDollar] = useState("100");
  const [entry, setEntry] = useState("1.0840");
  const [stopLoss, setStopLoss] = useState("1.0800");
  const [takeProfit, setTakeProfit] = useState("1.0920");

  const bal = parseFloat(balance) || 0;
  const ent = parseFloat(entry) || 0;
  const sl = parseFloat(stopLoss) || 0;
  const tp = parseFloat(takeProfit) || 0;

  // Risk amount comes from whichever input the user is currently driving;
  // the derived value of the other lane is shown alongside so they can see
  // the equivalent at a glance.
  const dollarRisk = riskMode === "percent"
    ? bal * ((parseFloat(riskPercent) || 0) / 100)
    : (parseFloat(riskDollar) || 0);
  const effectivePercent = bal > 0 ? (dollarRisk / bal) * 100 : 0;
  const risk = effectivePercent;

  const result = useMemo(
    () => computeLotSize({ symbol, entry: ent, stopLoss: sl, riskUSD: dollarRisk }),
    [symbol, ent, sl, dollarRisk],
  );

  const tpDistance = Math.abs(tp - ent);
  const tpUnits = result.pipDecimal > 0 ? tpDistance / result.pipDecimal : 0;
  const rr = result.slPips > 0 ? tpUnits / result.slPips : 0;
  const potentialProfit = dollarRisk * rr;
  const dollarPerUnit = result.pipDecimal > 0 ? result.pipValue / 1 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Position Risk Calculator</h1>
        <p className="text-sm text-muted mt-1">
          Symbol-aware lot sizing — picks the right pip math for forex, metals, indices, crypto, and oil.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input */}
        <div className="glass-card p-6 space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Trade Parameters</h3>

          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Instrument</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono"
            >
              <optgroup label="Forex">
                {ALL_INSTRUMENTS.filter((i) => i.category === "forex").map((i) => (
                  <option key={i.symbol} value={i.symbol}>{i.displayName}</option>
                ))}
              </optgroup>
              <optgroup label="Metals">
                {ALL_INSTRUMENTS.filter((i) => i.category === "metals").map((i) => (
                  <option key={i.symbol} value={i.symbol}>{i.displayName}</option>
                ))}
              </optgroup>
              <optgroup label="Indices">
                {ALL_INSTRUMENTS.filter((i) => i.category === "indices").map((i) => (
                  <option key={i.symbol} value={i.symbol}>{i.displayName}</option>
                ))}
              </optgroup>
              <optgroup label="Energy">
                {ALL_INSTRUMENTS.filter((i) => i.category === "energy").map((i) => (
                  <option key={i.symbol} value={i.symbol}>{i.displayName}</option>
                ))}
              </optgroup>
              <optgroup label="Crypto">
                {ALL_INSTRUMENTS.filter((i) => i.category === "crypto").map((i) => (
                  <option key={i.symbol} value={i.symbol}>{i.displayName}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Account Balance ($)</label>
            <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted-light">Risk Per Trade</label>
              <div className="inline-flex rounded-lg border border-border/50 bg-surface-2 p-0.5">
                <button
                  type="button"
                  onClick={() => setRiskMode("percent")}
                  className={cn(
                    "px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-smooth",
                    riskMode === "percent" ? "bg-accent text-white" : "text-muted-light hover:text-foreground"
                  )}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setRiskMode("dollar")}
                  className={cn(
                    "px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-smooth",
                    riskMode === "dollar" ? "bg-accent text-white" : "text-muted-light hover:text-foreground"
                  )}
                >
                  $
                </button>
              </div>
            </div>

            {riskMode === "percent" ? (
              <>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(e.target.value)}
                    className="w-full px-4 py-3 pr-10 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {["0.25", "0.5", "1", "2"].map((v) => (
                    <button key={v} onClick={() => setRiskPercent(v)}
                      className={cn("px-3 py-1 rounded-lg text-xs transition-smooth", riskPercent === v ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
                      {v}%
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-muted mt-2">
                  ≈ <span className="text-foreground font-mono">${dollarRisk.toFixed(2)}</span> at this account size
                </div>
              </>
            ) : (
              <>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
                  <input
                    type="number"
                    step="1"
                    value={riskDollar}
                    onChange={(e) => setRiskDollar(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {["25", "50", "100", "250", "500"].map((v) => (
                    <button key={v} onClick={() => setRiskDollar(v)}
                      className={cn("px-3 py-1 rounded-lg text-xs transition-smooth", riskDollar === v ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
                      ${v}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-muted mt-2">
                  ≈ <span className={cn("font-mono", effectivePercent > 5 ? "text-bear-light font-semibold" : effectivePercent > 2 ? "text-warn" : "text-foreground")}>
                    {effectivePercent.toFixed(2)}%
                  </span> of account balance
                  {effectivePercent > 5 && <span className="text-bear-light"> · over 5% risk is aggressive</span>}
                </div>
              </>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Entry Price</label>
            <input type="number" step="any" value={entry} onChange={(e) => setEntry(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-bear-light mb-1.5 block">Stop Loss</label>
            <input type="number" step="any" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-bear/20 focus:border-bear focus:outline-none text-sm text-foreground font-mono" />
          </div>
          <div>
            <label className="text-xs text-bull-light mb-1.5 block">Take Profit</label>
            <input type="number" step="any" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-bull/20 focus:border-bull focus:outline-none text-sm text-foreground font-mono" />
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {/* HERO: lot size — the answer the user actually wants */}
          <div className="glass-card p-6 border-2 border-accent/30">
            <h3 className="text-sm font-semibold text-foreground mb-4">Position Size</h3>
            <div className="text-center mb-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Standard Lots</div>
              <div className="text-5xl font-black text-accent-light mt-1">
                {result.lotSize >= 0.01 ? result.lotSize.toFixed(2) : result.lotSize.toExponential(2)}
              </div>
              <div className="text-xs text-muted mt-1">
                = {formatNum(result.miniLots, 2)} mini · {formatNum(result.microLots, 0)} micro · {formatNum(result.units, result.units < 1 ? 4 : 0)} {symbol === "XAUUSD" ? "oz" : symbol === "XAGUSD" ? "oz" : (symbol.startsWith("BTC") || symbol.startsWith("ETH") || symbol.startsWith("SOL") || symbol.startsWith("XRP")) ? "coins" : symbol === "USOIL" ? "barrels" : ALL_INSTRUMENTS.find((i) => i.symbol === symbol)?.category === "indices" ? "contracts" : "units"}
              </div>
            </div>
            {result.warnings.length > 0 && (
              <div className="text-[11px] text-bear-light bg-bear/5 border border-bear/30 rounded-lg p-2 mt-2 space-y-0.5">
                {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            {result.notes.length > 0 && (
              <p className="text-[10px] text-muted mt-2">
                {result.notes.join(" · ")}
              </p>
            )}
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Risk Breakdown</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-2 rounded-xl p-4 text-center">
                <div className="text-xs text-muted mb-1">Dollar Risk</div>
                <div className="text-xl font-bold text-bear-light">${dollarRisk.toFixed(2)}</div>
              </div>
              <div className="bg-surface-2 rounded-xl p-4 text-center">
                <div className="text-xs text-muted mb-1">Pip Value</div>
                <div className="text-xl font-bold text-foreground">${result.pipValue.toFixed(2)}</div>
                <div className="text-[10px] text-muted">per {result.pipUnitLabel} per std lot</div>
              </div>
              <div className="bg-surface-2 rounded-xl p-4 text-center">
                <div className="text-xs text-muted mb-1">Stop Distance</div>
                <div className="text-xl font-bold text-foreground">{result.slPips.toFixed(1)}</div>
                <div className="text-[10px] text-muted">{result.pipUnitLabel}s</div>
              </div>
              <div className="bg-surface-2 rounded-xl p-4 text-center">
                <div className="text-xs text-muted mb-1">Target Distance</div>
                <div className="text-xl font-bold text-foreground">{tpUnits.toFixed(1)}</div>
                <div className="text-[10px] text-muted">{result.pipUnitLabel}s</div>
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Risk/Reward</h3>
            <div className="text-center mb-4">
              <div className={cn("text-4xl font-black", rr >= 2 ? "text-bull-light" : rr >= 1.5 ? "text-warn" : "text-bear-light")}>
                1:{rr.toFixed(2)}
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
              <div className="flex justify-between"><span className="text-muted">Symbol</span><span className="text-foreground font-mono">{symbol} ({ALL_INSTRUMENTS.find((i) => i.symbol === symbol)?.category})</span></div>
              <div className="flex justify-between"><span className="text-muted">Contract Size</span><span className="text-foreground font-mono">{formatNum(result.contractSize, 0)} units / lot</span></div>
              <div className="flex justify-between"><span className="text-muted">{result.pipUnitLabel === "pip" ? "Pip" : result.pipUnitLabel === "point" ? "Point" : "Step"} Size</span><span className="text-foreground font-mono">{result.pipDecimal}</span></div>
              <div className="flex justify-between"><span className="text-muted">Max Loss</span><span className="text-bear-light font-mono">${dollarRisk.toFixed(2)} ({risk.toFixed(2)}%)</span></div>
              <div className="flex justify-between"><span className="text-muted">Max Profit</span><span className="text-bull-light font-mono">${potentialProfit.toFixed(2)} ({(risk * rr).toFixed(2)}%)</span></div>
              <div className="flex justify-between"><span className="text-muted">Account After Loss</span><span className="text-foreground font-mono">${(bal - dollarRisk).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Account After Win</span><span className="text-bull-light font-mono">${(bal + potentialProfit).toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatNum(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
