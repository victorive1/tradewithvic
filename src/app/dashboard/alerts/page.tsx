"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

const alertTypes = [
  { id: "price_level", label: "Price Level", desc: "Alert when price reaches a specific level" },
  { id: "setup", label: "Trade Setup", desc: "Alert when a new setup is detected" },
  { id: "volatility", label: "Volatility Spike", desc: "Alert on unusual volatility" },
  { id: "liquidity_sweep", label: "Liquidity Sweep", desc: "Alert when stop hunts occur" },
  { id: "event_risk", label: "Event Risk", desc: "Alert before major economic events" },
];

const recentAlerts = [
  { type: "Liquidity Sweep", symbol: "XAU/USD", message: "Buy-side liquidity swept above 3,292. Watch for reversal.", time: "2 min ago", color: "bull" },
  { type: "Trade Setup", symbol: "NAS100", message: "Bullish breakout setup detected. Confidence: 82%.", time: "8 min ago", color: "accent" },
  { type: "Volatility Spike", symbol: "GBP/JPY", message: "Volatility expanded +43% above 24h average.", time: "15 min ago", color: "warn" },
  { type: "Event Risk", symbol: "USD pairs", message: "US CPI release in 45 minutes. HIGH impact expected.", time: "22 min ago", color: "bear" },
  { type: "Price Level", symbol: "EUR/USD", message: "Approaching resistance at 1.0880.", time: "35 min ago", color: "accent" },
];

export default function AlertsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Smart Alerts</h1>
          <p className="text-sm text-muted mt-1">Get notified when important market conditions occur</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-light text-white text-sm font-medium transition-smooth">
          + Create Alert
        </button>
      </div>

      {/* Create alert panel */}
      {showCreate && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Create New Alert</h3>
          <div>
            <label className="text-xs text-muted-light mb-2 block">Alert Type</label>
            <div className="grid sm:grid-cols-3 gap-2">
              {alertTypes.map((t) => (
                <button key={t.id} onClick={() => setSelectedType(t.id)}
                  className={cn("p-3 rounded-xl text-left transition-smooth",
                    selectedType === t.id ? "bg-accent/10 border border-accent/30" : "bg-surface-2 border border-border/50 hover:border-border-light")}>
                  <div className="text-xs font-medium text-foreground">{t.label}</div>
                  <div className="text-[10px] text-muted mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-light mb-2 block">Instrument</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_INSTRUMENTS.slice(0, 12).map((inst) => (
                <button key={inst.symbol} onClick={() => setSelectedSymbol(inst.symbol)}
                  className={cn("px-2.5 py-1 rounded-lg text-xs transition-smooth",
                    selectedSymbol === inst.symbol ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
                  {inst.displayName}
                </button>
              ))}
            </div>
          </div>
          {selectedType === "price_level" && (
            <div>
              <label className="text-xs text-muted-light mb-1.5 block">Price Level</label>
              <input type="number" step="0.0001" placeholder="Enter price level"
                className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" />
            </div>
          )}
          <button className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-light text-white text-sm font-medium transition-smooth">
            Create Alert
          </button>
        </div>
      )}

      {/* Recent alerts */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-4">Recent Alerts</h2>
        <div className="space-y-3">
          {recentAlerts.map((alert, i) => {
            const borderColor = alert.color === "bull" ? "border-l-bull" : alert.color === "bear" ? "border-l-bear" : alert.color === "warn" ? "border-l-warn" : "border-l-accent";
            return (
              <div key={i} className={cn("glass-card p-4 border-l-4", borderColor)}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-medium",
                      alert.color === "bull" ? "text-bull-light" : alert.color === "bear" ? "text-bear-light" : alert.color === "warn" ? "text-warn" : "text-accent-light")}>
                      {alert.type}
                    </span>
                    <span className="text-xs text-muted">|</span>
                    <span className="text-xs font-medium text-foreground">{alert.symbol}</span>
                  </div>
                  <span className="text-xs text-muted">{alert.time}</span>
                </div>
                <p className="text-sm text-muted-light">{alert.message}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alert settings hint */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-2">Alert Delivery</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { label: "In-App Notifications", enabled: true },
            { label: "Email Alerts", enabled: false },
            { label: "Push Notifications", enabled: false },
          ].map((method) => (
            <div key={method.label} className="flex items-center justify-between bg-surface-2 rounded-xl p-3">
              <span className="text-xs text-muted-light">{method.label}</span>
              <div className={cn("w-8 h-4 rounded-full relative cursor-pointer transition-smooth",
                method.enabled ? "bg-accent" : "bg-surface-3")}>
                <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-smooth",
                  method.enabled ? "left-4" : "left-0.5")} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
