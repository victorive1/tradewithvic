"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import { useTheme } from "@/components/ui/ThemeProvider";

// ==================== WIDGET TYPES ====================
type WidgetType = "price_card" | "chart" | "watchlist" | "setups" | "strength" | "news" | "calendar" | "screener" | "notes" | "clock" | "signal_feed" | "quick_trade" | "pnl_tracker" | "market_pulse";

interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  config: any;
  size: "small" | "medium" | "large" | "full";
  order: number;
}

const WIDGET_CATALOG: { type: WidgetType; label: string; desc: string; icon: string; defaultSize: DashboardWidget["size"] }[] = [
  { type: "price_card", label: "Price Card", desc: "Live price for any instrument", icon: "💰", defaultSize: "small" },
  { type: "chart", label: "Live Chart", desc: "TradingView chart for any pair", icon: "📊", defaultSize: "large" },
  { type: "watchlist", label: "Watchlist", desc: "Your favorite instruments", icon: "⭐", defaultSize: "medium" },
  { type: "setups", label: "Trade Setups", desc: "Live trade setups from the engine", icon: "🎯", defaultSize: "medium" },
  { type: "strength", label: "Currency Strength", desc: "8-currency strength ranking", icon: "💪", defaultSize: "medium" },
  { type: "signal_feed", label: "Signal Feed", desc: "Your custom signal alerts", icon: "📡", defaultSize: "medium" },
  { type: "news", label: "Market News", desc: "Latest market events and catalysts", icon: "📰", defaultSize: "medium" },
  { type: "calendar", label: "Event Calendar", desc: "Upcoming economic events", icon: "📅", defaultSize: "medium" },
  { type: "screener", label: "Quick Screener", desc: "Top movers and opportunities", icon: "🔍", defaultSize: "medium" },
  { type: "market_pulse", label: "Market Pulse", desc: "Overall market bias summary", icon: "🫀", defaultSize: "small" },
  { type: "quick_trade", label: "Quick Trade", desc: "One-click trade execution panel", icon: "⚡", defaultSize: "medium" },
  { type: "pnl_tracker", label: "P&L Tracker", desc: "Track your daily performance", icon: "📈", defaultSize: "small" },
  { type: "clock", label: "Session Clock", desc: "Market session times worldwide", icon: "🕐", defaultSize: "small" },
  { type: "notes", label: "Trading Notes", desc: "Your personal trading journal", icon: "📝", defaultSize: "medium" },
];

function genId() { return `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

function loadDashboard(): DashboardWidget[] {
  if (typeof window === "undefined") return [];
  try { const s = localStorage.getItem("my_dashboard"); return s ? JSON.parse(s) : []; } catch { return []; }
}

function saveDashboard(widgets: DashboardWidget[]) {
  localStorage.setItem("my_dashboard", JSON.stringify(widgets));
}

// ==================== WIDGET RENDERERS ====================

function PriceCardWidget({ config, quotes }: { config: any; quotes: any[] }) {
  const q = quotes.find((x: any) => x.symbol === config.symbol);
  if (!q) return <div className="text-xs text-muted text-center py-4">Select an instrument</div>;
  return (
    <div className="text-center py-2">
      <div className="text-xs text-muted mb-1">{q.displayName}</div>
      <div className="text-2xl font-black text-foreground font-mono">{q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: q.category === "forex" ? 5 : 2 })}</div>
      <div className={cn("text-sm font-medium mt-1", q.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>{q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%</div>
    </div>
  );
}

function ChartWidget({ config }: { config: any }) {
  const { theme } = useTheme();
  return <div className="h-[300px]"><TradingViewWidget symbol={config.symbol || "EURUSD"} interval={config.interval || "60"} theme={theme} height={300} autosize={false} /></div>;
}

function WatchlistWidget({ quotes }: { quotes: any[] }) {
  const watchSymbols = ["EURUSD", "XAUUSD", "BTCUSD", "GBPUSD", "NAS100"];
  return (
    <div className="space-y-2">
      {watchSymbols.map((sym) => {
        const q = quotes.find((x: any) => x.symbol === sym);
        if (!q) return null;
        return (
          <div key={sym} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
            <div><div className="text-xs font-medium text-foreground">{q.displayName}</div><div className="text-[10px] text-muted capitalize">{q.category}</div></div>
            <div className="text-right"><div className="text-xs font-mono text-foreground">{q.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <div className={cn("text-[10px]", q.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>{q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%</div></div>
          </div>
        );
      })}
    </div>
  );
}

function SetupsWidget({ setups }: { setups: any[] }) {
  const top = setups.slice(0, 4);
  return top.length > 0 ? (
    <div className="space-y-2">
      {top.map((s: any) => (
        <div key={s.id} className="bg-surface-2 rounded-lg p-2.5 flex items-center justify-between">
          <div><div className="text-xs font-medium">{s.displayName}</div><div className="text-[10px] text-muted">{s.setupType} • {s.timeframe}</div></div>
          <div className="text-right"><span className={cn("text-xs font-bold", s.direction === "buy" ? "text-bull-light" : "text-bear-light")}>{s.direction.toUpperCase()}</span>
            <div className="text-[10px] text-accent-light">{s.confidenceScore}%</div></div>
        </div>
      ))}
    </div>
  ) : <div className="text-xs text-muted text-center py-4">Loading setups...</div>;
}

function StrengthWidget({ strength }: { strength: any[] }) {
  return (
    <div className="space-y-1.5">
      {strength.slice(0, 8).map((s: any) => (
        <div key={s.currency} className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted w-7">{s.currency}</span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden"><div className={cn("h-full rounded-full", s.score > 55 ? "bg-bull" : s.score < 45 ? "bg-bear" : "bg-accent")} style={{ width: `${s.score}%` }} /></div>
          <span className="text-[10px] font-mono text-muted w-8 text-right">{s.score.toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
}

function ScreenerWidget({ quotes }: { quotes: any[] }) {
  const sorted = [...quotes].sort((a: any, b: any) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 5);
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted mb-1">Top Movers</div>
      {sorted.map((q: any) => (
        <div key={q.symbol} className="flex items-center justify-between">
          <span className="text-xs text-foreground">{q.displayName}</span>
          <span className={cn("text-xs font-mono font-medium", q.changePercent >= 0 ? "text-bull-light" : "text-bear-light")}>{q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
}

function MarketPulseWidget({ quotes, strength }: { quotes: any[]; strength: any[] }) {
  const bullish = quotes.filter((q: any) => q.changePercent > 0).length;
  const total = quotes.length || 1;
  const sentiment = bullish / total > 0.6 ? "Risk-On" : bullish / total < 0.4 ? "Risk-Off" : "Mixed";
  return (
    <div className="text-center py-2">
      <div className={cn("text-xl font-black", sentiment === "Risk-On" ? "text-bull-light" : sentiment === "Risk-Off" ? "text-bear-light" : "text-warn")}>{sentiment}</div>
      <div className="text-[10px] text-muted mt-1">{bullish}/{quotes.length} markets bullish</div>
      {strength[0] && <div className="text-[10px] text-muted mt-1">Strongest: <span className="text-foreground">{strength[0].currency}</span></div>}
    </div>
  );
}

function ClockWidget() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(i); }, []);
  const utcH = time.getUTCHours();
  const sessions = [
    { name: "Sydney", open: utcH >= 21 || utcH < 6, tz: "UTC+10" },
    { name: "Tokyo", open: utcH >= 0 && utcH < 9, tz: "UTC+9" },
    { name: "London", open: utcH >= 7 && utcH < 16, tz: "UTC+0" },
    { name: "New York", open: utcH >= 12 && utcH < 21, tz: "UTC-5" },
  ];
  return (
    <div className="space-y-2">
      <div className="text-center text-lg font-mono font-bold text-foreground">{time.toUTCString().slice(17, 25)} UTC</div>
      {sessions.map((s) => (
        <div key={s.name} className="flex items-center justify-between">
          <div className="flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", s.open ? "bg-bull pulse-live" : "bg-muted")} /><span className="text-xs text-foreground">{s.name}</span></div>
          <span className={cn("text-[10px]", s.open ? "text-bull-light" : "text-muted")}>{s.open ? "Open" : "Closed"}</span>
        </div>
      ))}
    </div>
  );
}

function NotesWidget({ config, onUpdate }: { config: any; onUpdate: (config: any) => void }) {
  return (
    <textarea value={config.text || ""} onChange={(e) => onUpdate({ ...config, text: e.target.value })}
      placeholder="Write your trading notes for today..."
      className="w-full h-full min-h-[120px] bg-transparent text-sm text-foreground placeholder-muted resize-none focus:outline-none leading-relaxed" />
  );
}

function CalendarWidget() {
  const events = [
    { time: "08:30", event: "US CPI", impact: "HIGH" },
    { time: "13:00", event: "BOE Rate", impact: "HIGH" },
    { time: "14:30", event: "ECB Speech", impact: "MED" },
  ];
  return (
    <div className="space-y-2">
      {events.map((e, i) => (
        <div key={i} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2"><span className="text-[10px] font-mono text-muted">{e.time}</span><span className="text-xs text-foreground">{e.event}</span></div>
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", e.impact === "HIGH" ? "bg-bear text-white" : "bg-warn text-black")}>{e.impact}</span>
        </div>
      ))}
    </div>
  );
}

function QuickTradeWidget() {
  const mt = typeof window !== "undefined" ? localStorage.getItem("mt_account") : null;
  if (!mt) return <div className="text-xs text-muted text-center py-4">Connect a trading account in Trading Hub first</div>;
  return (
    <div className="space-y-3">
      <select className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs text-foreground"><option>XAU/USD</option><option>EUR/USD</option><option>GBP/USD</option><option>BTC/USD</option><option>NAS100</option></select>
      <div className="grid grid-cols-2 gap-2">
        <button className="py-2.5 rounded-lg bg-bull/20 text-bull-light border border-bull/30 text-xs font-bold">BUY</button>
        <button className="py-2.5 rounded-lg bg-bear/20 text-bear-light border border-bear/30 text-xs font-bold">SELL</button>
      </div>
      <input type="number" defaultValue="0.10" step="0.01" className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs text-foreground font-mono" />
    </div>
  );
}

function PnlWidget() {
  return (
    <div className="text-center py-2">
      <div className="text-[10px] text-muted mb-1">Today&apos;s P&L</div>
      <div className="text-2xl font-black text-muted">$0.00</div>
      <div className="text-[10px] text-muted mt-1">Connect account to track</div>
    </div>
  );
}

function SignalFeedWidget({ setups }: { setups: any[] }) {
  const signals = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("custom_signals") || "[]") : [];
  return signals.length > 0 ? (
    <div className="space-y-2">
      {signals.map((s: any, i: number) => (
        <div key={i} className="bg-surface-2 rounded-lg p-2.5"><div className="text-xs font-medium text-foreground">{s.name}</div><div className="text-[10px] text-muted">{s.detectedStrategy} • Min: {s.minScore}/100</div></div>
      ))}
    </div>
  ) : (
    <div className="text-center py-4"><div className="text-xs text-muted">No custom signals yet</div><a href="/dashboard/custom-signals" className="text-[10px] text-accent-light">Build one →</a></div>
  );
}

// ==================== MAIN PAGE ====================
export default function MyDashboardPage() {
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [editing, setEditing] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [strength, setStrength] = useState<any[]>([]);
  const [setups, setSetups] = useState<any[]>([]);
  const [configWidget, setConfigWidget] = useState<string | null>(null);

  useEffect(() => {
    setWidgets(loadDashboard());
    async function fetchData() {
      try {
        const [qRes, sRes] = await Promise.all([fetch("/api/market/quotes"), fetch("/api/market/setups")]);
        const qData = await qRes.json();
        const sData = await sRes.json();
        if (qData.quotes) setQuotes(qData.quotes);
        if (qData.currencyStrength) setStrength(qData.currencyStrength);
        if (sData.setups) setSetups(sData.setups);
      } catch {}
    }
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const save = useCallback((w: DashboardWidget[]) => { setWidgets(w); saveDashboard(w); }, []);

  function addWidget(type: WidgetType) {
    const cat = WIDGET_CATALOG.find((c) => c.type === type);
    if (!cat) return;
    const widget: DashboardWidget = {
      id: genId(), type, title: cat.label, config: { symbol: "EURUSD", interval: "60", text: "" },
      size: cat.defaultSize, order: widgets.length,
    };
    save([...widgets, widget]);
    setShowCatalog(false);
  }

  function removeWidget(id: string) { save(widgets.filter((w) => w.id !== id)); }
  function moveUp(id: string) {
    const idx = widgets.findIndex((w) => w.id === id);
    if (idx <= 0) return;
    const arr = [...widgets]; [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    save(arr);
  }
  function moveDown(id: string) {
    const idx = widgets.findIndex((w) => w.id === id);
    if (idx >= widgets.length - 1) return;
    const arr = [...widgets]; [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    save(arr);
  }
  function updateWidgetConfig(id: string, config: any) { save(widgets.map((w) => w.id === id ? { ...w, config } : w)); }
  function updateWidgetSize(id: string, size: DashboardWidget["size"]) { save(widgets.map((w) => w.id === id ? { ...w, size } : w)); }
  function renameWidget(id: string, title: string) { save(widgets.map((w) => w.id === id ? { ...w, title } : w)); }

  function renderWidget(widget: DashboardWidget) {
    switch (widget.type) {
      case "price_card": return <PriceCardWidget config={widget.config} quotes={quotes} />;
      case "chart": return <ChartWidget config={widget.config} />;
      case "watchlist": return <WatchlistWidget quotes={quotes} />;
      case "setups": return <SetupsWidget setups={setups} />;
      case "strength": return <StrengthWidget strength={strength} />;
      case "signal_feed": return <SignalFeedWidget setups={setups} />;
      case "news": return <CalendarWidget />;
      case "calendar": return <CalendarWidget />;
      case "screener": return <ScreenerWidget quotes={quotes} />;
      case "market_pulse": return <MarketPulseWidget quotes={quotes} strength={strength} />;
      case "quick_trade": return <QuickTradeWidget />;
      case "pnl_tracker": return <PnlWidget />;
      case "clock": return <ClockWidget />;
      case "notes": return <NotesWidget config={widget.config} onUpdate={(c) => updateWidgetConfig(widget.id, c)} />;
      default: return <div className="text-xs text-muted">Unknown widget</div>;
    }
  }

  const sizeClasses: Record<string, string> = { small: "col-span-1", medium: "col-span-1 sm:col-span-2", large: "col-span-1 sm:col-span-2 lg:col-span-3", full: "col-span-1 sm:col-span-2 lg:col-span-4" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Dashboard</h1>
          <p className="text-sm text-muted mt-1">Your personalized trading command center — add any widget you want</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(!editing)} className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth", editing ? "bg-warn text-black" : "bg-surface-2 text-muted-light border border-border/50")}>
            {editing ? "Done Editing" : "Customize"}
          </button>
          <button onClick={() => setShowCatalog(!showCatalog)} className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium transition-smooth">+ Add Widget</button>
        </div>
      </div>

      {/* Widget Catalog */}
      {showCatalog && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Widget Catalog — Click to Add</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {WIDGET_CATALOG.map((cat) => (
              <button key={cat.type} onClick={() => addWidget(cat.type)}
                className="text-left p-3 rounded-xl bg-surface-2 border border-border/50 hover:border-accent/50 transition-smooth">
                <div className="flex items-center gap-2 mb-1"><span className="text-lg">{cat.icon}</span><span className="text-xs font-semibold text-foreground">{cat.label}</span></div>
                <p className="text-[10px] text-muted">{cat.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dashboard Grid */}
      {widgets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {widgets.map((widget) => (
            <div key={widget.id} className={cn("glass-card overflow-hidden", sizeClasses[widget.size])}>
              {/* Widget header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
                <span className="text-xs font-semibold text-foreground">{widget.title}</span>
                {editing && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveUp(widget.id)} className="text-muted hover:text-muted-light p-0.5"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg></button>
                    <button onClick={() => moveDown(widget.id)} className="text-muted hover:text-muted-light p-0.5"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
                    <button onClick={() => setConfigWidget(configWidget === widget.id ? null : widget.id)} className="text-muted hover:text-accent-light p-0.5"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
                    <button onClick={() => removeWidget(widget.id)} className="text-muted hover:text-bear-light p-0.5"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>
                )}
              </div>

              {/* Widget config panel */}
              {configWidget === widget.id && (
                <div className="px-4 py-3 bg-surface-2/50 border-b border-border/30 space-y-2">
                  <div><label className="text-[10px] text-muted block mb-0.5">Title</label>
                    <input type="text" value={widget.title} onChange={(e) => renameWidget(widget.id, e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-xs text-foreground focus:border-accent focus:outline-none" /></div>
                  {(widget.type === "price_card" || widget.type === "chart") && (
                    <div><label className="text-[10px] text-muted block mb-0.5">Instrument</label>
                      <select value={widget.config.symbol} onChange={(e) => updateWidgetConfig(widget.id, { ...widget.config, symbol: e.target.value })} className="w-full px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-xs text-foreground">
                        {ALL_INSTRUMENTS.map((i) => <option key={i.symbol} value={i.symbol}>{i.displayName}</option>)}</select></div>
                  )}
                  <div><label className="text-[10px] text-muted block mb-0.5">Size</label>
                    <div className="flex gap-1">{(["small", "medium", "large", "full"] as const).map((s) => (
                      <button key={s} onClick={() => updateWidgetSize(widget.id, s)} className={cn("px-2 py-1 rounded text-[10px] capitalize transition-smooth", widget.size === s ? "bg-accent text-white" : "bg-surface-2 text-muted")}>{s}</button>
                    ))}</div></div>
                </div>
              )}

              {/* Widget content */}
              <div className="p-4">{renderWidget(widget)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-16 text-center">
          <div className="text-5xl mb-4">🎨</div>
          <h3 className="text-xl font-bold text-foreground mb-2">Build Your Dashboard</h3>
          <p className="text-sm text-muted max-w-md mx-auto mb-6">Click &ldquo;+ Add Widget&rdquo; to start adding price cards, charts, signals, news, and more. Arrange them however you like.</p>
          <button onClick={() => setShowCatalog(true)} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium transition-smooth glow-accent">+ Add Your First Widget</button>
        </div>
      )}
    </div>
  );
}
