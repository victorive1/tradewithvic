"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const languages = [
  { code: "en", name: "English" },
  { code: "es", name: "Espanol" },
  { code: "fr", name: "Francais" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Portugues" },
];

export default function SettingsPage() {
  const [language, setLanguage] = useState("en");
  const [theme, setTheme] = useState("dark");
  const [defaultTf, setDefaultTf] = useState("1h");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Profile</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Name</label>
            <input type="text" defaultValue="Victor" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
          </div>
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Email</label>
            <input type="email" defaultValue="victor@fxwonders.com" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" />
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Language</h3>
        <div className="flex flex-wrap gap-2">
          {languages.map((lang) => (
            <button key={lang.code} onClick={() => setLanguage(lang.code)}
              className={cn("px-4 py-2.5 rounded-xl text-sm transition-smooth",
                language === lang.code ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>
              {lang.name}
            </button>
          ))}
        </div>
      </div>

      {/* Trading Preferences */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Trading Preferences</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-light mb-2 block">Default Timeframe</label>
            <div className="flex gap-2">
              {["5m", "15m", "1h", "4h", "1d"].map((tf) => (
                <button key={tf} onClick={() => setDefaultTf(tf)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth",
                    defaultTf === tf ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-light mb-2 block">Theme</label>
            <div className="flex gap-2">
              {["dark", "light"].map((t) => (
                <button key={t} onClick={() => setTheme(t)}
                  className={cn("px-4 py-2 rounded-lg text-xs capitalize transition-smooth",
                    theme === t ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Notifications</h3>
        <div className="space-y-3">
          {[
            { label: "Trade Setup Alerts", desc: "Get notified when new setups are detected", enabled: true },
            { label: "Volatility Spikes", desc: "Alert on unusual market volatility", enabled: true },
            { label: "Event Risk Warnings", desc: "Warn before major economic events", enabled: true },
            { label: "Liquidity Sweep Alerts", desc: "Detect stop hunts and sweeps", enabled: false },
            { label: "Email Notifications", desc: "Receive alerts via email", enabled: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between bg-surface-2 rounded-xl p-4">
              <div>
                <div className="text-sm text-foreground">{item.label}</div>
                <div className="text-xs text-muted">{item.desc}</div>
              </div>
              <div className={cn("w-10 h-5 rounded-full relative cursor-pointer transition-smooth",
                item.enabled ? "bg-accent" : "bg-surface-3")}>
                <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth",
                  item.enabled ? "left-5" : "left-0.5")} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-light text-white font-medium text-sm transition-smooth">
        Save Changes
      </button>
    </div>
  );
}
