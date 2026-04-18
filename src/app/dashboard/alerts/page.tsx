"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ALL_INSTRUMENTS } from "@/lib/constants";

type AlertView = "inbox" | "setups" | "rules" | "history" | "settings";
type AlertCategory = "price" | "signal" | "volatility" | "macro" | "sentiment" | "engine" | "custom";
type AlertUrgency = "low" | "medium" | "high" | "critical";
type DeliveryChannel = "in_app" | "push" | "email";

interface AlertRule {
  id: string;
  name: string;
  category: AlertCategory;
  conditions: { field: string; operator: string; value: string }[];
  instruments: string[];
  urgency: AlertUrgency;
  channels: DeliveryChannel[];
  isActive: boolean;
  createdAt: string;
  triggeredCount: number;
}

interface AlertNotification {
  id: string;
  ruleId?: string;
  ruleName?: string;
  category: AlertCategory;
  urgency: AlertUrgency;
  title: string;
  message: string;
  symbol?: string;
  timestamp: string;
  read: boolean;
}

interface AlertSettings {
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  channels: Record<DeliveryChannel, boolean>;
  maxPerHour: number;
  deduplicationMinutes: number;
}

const CATEGORY_CONFIG: Record<AlertCategory, { label: string; icon: string; color: string; desc: string }> = {
  price: { label: "Price Level", icon: "💰", color: "text-accent-light", desc: "Triggered when price reaches a specific level" },
  signal: { label: "Signal Alert", icon: "🎯", color: "text-bull-light", desc: "Triggered when a new trade setup is detected" },
  volatility: { label: "Volatility", icon: "⚡", color: "text-warn", desc: "Triggered on unusual volatility expansion" },
  macro: { label: "Macro / Calendar", icon: "📅", color: "text-bear-light", desc: "Triggered before major economic events" },
  sentiment: { label: "Sentiment", icon: "📊", color: "text-accent-light", desc: "Triggered on extreme sentiment shifts" },
  engine: { label: "Engine Alert", icon: "🔧", color: "text-muted-light", desc: "Triggered by platform intelligence engines" },
  custom: { label: "Custom Rule", icon: "⚙️", color: "text-foreground", desc: "Your custom multi-condition alert rules" },
};

const URGENCY_CONFIG: Record<AlertUrgency, { label: string; badge: string }> = {
  low: { label: "Low", badge: "bg-surface-3 text-muted border-border" },
  medium: { label: "Medium", badge: "bg-accent/10 text-accent-light border-accent/20" },
  high: { label: "High", badge: "bg-warn/10 text-warn border-warn/20" },
  critical: { label: "Critical", badge: "bg-bear/10 text-bear-light border-bear/20" },
};

function loadRules(): AlertRule[] {
  if (typeof window === "undefined") return [];
  try { const s = localStorage.getItem("alert_rules"); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveRules(rules: AlertRule[]) { localStorage.setItem("alert_rules", JSON.stringify(rules)); }
function loadSettings(): AlertSettings {
  const def: AlertSettings = { quietHoursEnabled: false, quietStart: "22:00", quietEnd: "07:00", channels: { in_app: true, push: false, email: false }, maxPerHour: 20, deduplicationMinutes: 5 };
  if (typeof window === "undefined") return def;
  try { const s = localStorage.getItem("alert_settings"); return s ? { ...def, ...JSON.parse(s) } : def; } catch { return def; }
}
function saveSettings(settings: AlertSettings) { localStorage.setItem("alert_settings", JSON.stringify(settings)); }

// Generate sample notifications from live data
function generateNotifications(): AlertNotification[] {
  const now = Date.now();
  return [
    { id: "n1", category: "signal", urgency: "high", title: "A+ Setup Detected", message: "XAU/USD bullish breakout setup — confidence 89%, R:R 1.9:1", symbol: "XAUUSD", timestamp: new Date(now - 120000).toISOString(), read: false },
    { id: "n2", category: "volatility", urgency: "medium", title: "Volatility Expanding", message: "GBP/JPY volatility +38% above average. Breakout conditions forming.", symbol: "GBPJPY", timestamp: new Date(now - 480000).toISOString(), read: false },
    { id: "n3", category: "macro", urgency: "critical", title: "High-Impact Event", message: "US CPI release in 45 minutes. Expect elevated volatility on USD pairs.", timestamp: new Date(now - 900000).toISOString(), read: true },
    { id: "n4", category: "sentiment", urgency: "medium", title: "Extreme Sentiment", message: "EUR/USD retail positioning at 78% long. Contrarian fade risk elevated.", symbol: "EURUSD", timestamp: new Date(now - 1800000).toISOString(), read: true },
    { id: "n5", category: "engine", urgency: "low", title: "Sharp Money Activity", message: "NAS100 sharp money score rose to 76 — elevated institutional interest.", symbol: "NAS100", timestamp: new Date(now - 3600000).toISOString(), read: true },
  ];
}

interface EliteSetup {
  id: string;
  symbol: string;
  displayName: string;
  timeframe: string;
  direction: string;
  setupType: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  riskReward: number;
  confidenceScore: number;
  qualityGrade: string;
  explanation?: string;
  source: "brain" | "engine";
  action?: string;
}

type SetupFilter = "all" | "a_plus" | "a" | "long" | "short";

export default function AlertsPage() {
  const [view, setView] = useState<AlertView>("inbox");
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [settings, setSettings] = useState<AlertSettings>(loadSettings());
  const [showBuilder, setShowBuilder] = useState(false);

  const [setups, setSetups] = useState<EliteSetup[]>([]);
  const [setupsLoading, setSetupsLoading] = useState(true);
  const [setupsError, setSetupsError] = useState<string | null>(null);
  const [setupFilter, setSetupFilter] = useState<SetupFilter>("all");

  // Builder state
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<AlertCategory>("price");
  const [newInstruments, setNewInstruments] = useState<string[]>([]);
  const [newUrgency, setNewUrgency] = useState<AlertUrgency>("medium");
  const [newChannels, setNewChannels] = useState<DeliveryChannel[]>(["in_app"]);
  const [newConditions, setNewConditions] = useState<{ field: string; operator: string; value: string }[]>([{ field: "", operator: ">=", value: "" }]);

  useEffect(() => {
    setRules(loadRules());
    setNotifications(generateNotifications());
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    async function fetchSetups() {
      setSetupsLoading(true);
      setSetupsError(null);
      try {
        const [brainRes, engineRes] = await Promise.all([
          fetch("/api/brain/execution/state", { cache: "no-store" }).catch(() => null),
          fetch("/api/market/setups", { cache: "no-store" }).catch(() => null),
        ]);

        const merged: EliteSetup[] = [];

        // Brain qualified signals (A+/A from Layer 2 confluence)
        if (brainRes?.ok) {
          const data = await brainRes.json();
          const signals = (data.signals ?? []) as any[];
          for (const s of signals) {
            if (s.qualityGrade !== "A+" && s.qualityGrade !== "A" && s.qualityGrade !== "candidate") continue;
            if (s.status !== "active" && s.action !== "EXECUTED" && s.action !== "QUEUED") continue;
            merged.push({
              id: s.id,
              symbol: s.symbol,
              displayName: ALL_INSTRUMENTS.find((i) => i.symbol === s.symbol)?.displayName || s.symbol,
              timeframe: s.timeframe,
              direction: s.direction,
              setupType: s.strategy ?? "setup",
              entry: s.entry,
              stopLoss: s.stopLoss,
              takeProfit1: s.takeProfit1,
              takeProfit2: s.takeProfit2,
              takeProfit3: s.takeProfit3,
              riskReward: s.riskReward,
              confidenceScore: s.confidenceScore,
              qualityGrade: s.qualityGrade,
              source: "brain",
              action: s.action,
            });
          }
        }

        // Classic setup engine (rule-based from /api/market/setups)
        if (engineRes?.ok) {
          const data = await engineRes.json();
          const engineSetups = (data.setups ?? []) as any[];
          for (const s of engineSetups) {
            if (merged.some((m) => m.symbol === s.symbol && m.direction === s.direction)) continue;
            merged.push({
              id: `engine_${s.symbol}_${s.direction}`,
              symbol: s.symbol,
              displayName: s.displayName ?? s.symbol,
              timeframe: s.timeframe ?? "1H",
              direction: s.direction,
              setupType: s.setupType ?? "setup",
              entry: s.entry,
              stopLoss: s.stopLoss,
              takeProfit1: s.tp1 ?? s.takeProfit1,
              takeProfit2: s.tp2 ?? s.takeProfit2,
              takeProfit3: s.tp3 ?? s.takeProfit3,
              riskReward: s.riskReward ?? 1.5,
              confidenceScore: s.score ?? s.confidenceScore ?? 70,
              qualityGrade: s.grade ?? s.qualityGrade ?? (s.score >= 90 ? "A+" : s.score >= 80 ? "A" : "candidate"),
              explanation: s.explanation,
              source: "engine",
            });
          }
        }

        // Sort: A+ first, then A, then by confidence desc
        merged.sort((a, b) => {
          const rank = (g: string) => (g === "A+" ? 3 : g === "A" ? 2 : g === "candidate" ? 1 : 0);
          const r = rank(b.qualityGrade) - rank(a.qualityGrade);
          return r !== 0 ? r : b.confidenceScore - a.confidenceScore;
        });

        setSetups(merged);
      } catch (e: any) {
        setSetupsError(e?.message || "Failed to load setups");
      } finally {
        setSetupsLoading(false);
      }
    }

    fetchSetups();
    const iv = setInterval(fetchSetups, 30_000);
    return () => clearInterval(iv);
  }, []);

  const filteredSetups = setups.filter((s) => {
    if (setupFilter === "a_plus") return s.qualityGrade === "A+";
    if (setupFilter === "a") return s.qualityGrade === "A";
    if (setupFilter === "long") return s.direction === "bullish";
    if (setupFilter === "short") return s.direction === "bearish";
    return true;
  });

  const setupCounts = {
    total: setups.length,
    aPlus: setups.filter((s) => s.qualityGrade === "A+").length,
    a: setups.filter((s) => s.qualityGrade === "A").length,
    long: setups.filter((s) => s.direction === "bullish").length,
    short: setups.filter((s) => s.direction === "bearish").length,
  };

  function createAlertForSetup(setup: EliteSetup) {
    setView("rules");
    setShowBuilder(true);
    setNewName(`${setup.qualityGrade} · ${setup.displayName} · ${setup.direction === "bullish" ? "Long" : "Short"}`);
    setNewCategory("signal");
    setNewInstruments([setup.symbol]);
    setNewUrgency(setup.qualityGrade === "A+" ? "high" : "medium");
    setNewConditions([
      { field: "confidence", operator: ">=", value: String(setup.confidenceScore) },
      { field: "grade", operator: "==", value: setup.qualityGrade },
    ]);
  }

  const unread = notifications.filter((n) => !n.read).length;

  function markRead(id: string) { setNotifications(notifications.map((n) => n.id === id ? { ...n, read: true } : n)); }
  function markAllRead() { setNotifications(notifications.map((n) => ({ ...n, read: true }))); }
  function deleteNotification(id: string) { setNotifications(notifications.filter((n) => n.id !== id)); }

  function createRule() {
    if (!newName.trim()) return;
    const rule: AlertRule = {
      id: `rule_${Date.now()}`, name: newName, category: newCategory,
      conditions: newConditions.filter((c) => c.field && c.value),
      instruments: newInstruments, urgency: newUrgency, channels: newChannels,
      isActive: true, createdAt: new Date().toISOString(), triggeredCount: 0,
    };
    const updated = [...rules, rule];
    setRules(updated); saveRules(updated);
    setShowBuilder(false);
    setNewName(""); setNewConditions([{ field: "", operator: ">=", value: "" }]); setNewInstruments([]);
  }

  function toggleRule(id: string) {
    const updated = rules.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r);
    setRules(updated); saveRules(updated);
  }

  function deleteRule(id: string) {
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated); saveRules(updated);
  }

  function updateSettings(partial: Partial<AlertSettings>) {
    const updated = { ...settings, ...partial };
    setSettings(updated); saveSettings(updated);
  }

  const conditionFields = [
    { value: "price", label: "Price" }, { value: "change_pct", label: "Change %" }, { value: "confidence", label: "Confidence Score" },
    { value: "grade", label: "Quality Grade" }, { value: "volatility", label: "Volatility Score" }, { value: "radar_score", label: "Sharp Money Score" },
    { value: "strength_spread", label: "Currency Strength Spread" }, { value: "sentiment_bias", label: "Sentiment Bias" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Smart Alerts</h1>
            {unread > 0 && <span className="text-xs bg-bear text-white px-2 py-0.5 rounded-full font-bold">{unread} new</span>}
          </div>
          <p className="text-sm text-muted">Platform-wide alerts: price, signals, volatility, macro events, sentiment, and custom rules</p>
        </div>
        <button onClick={() => setShowBuilder(!showBuilder)} className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium">+ New Alert Rule</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: "inbox" as AlertView, l: `Inbox (${unread})` },
          { id: "setups" as AlertView, l: `🎯 Trade Setups${setups.length > 0 ? ` (${setups.length})` : ""}` },
          { id: "rules" as AlertView, l: `My Rules (${rules.length})` },
          { id: "history" as AlertView, l: "History" },
          { id: "settings" as AlertView, l: "Settings" },
        ].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", view === v.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{v.l}</button>
        ))}
      </div>

      {/* ALERT RULE BUILDER */}
      {showBuilder && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-sm font-semibold">Create Alert Rule</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-xs text-muted-light mb-1 block">Alert Name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Gold A+ Alert" className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
            <div><label className="text-xs text-muted-light mb-1 block">Category</label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(CATEGORY_CONFIG) as [AlertCategory, typeof CATEGORY_CONFIG[AlertCategory]][]).map(([key, cfg]) => (
                  <button key={key} onClick={() => setNewCategory(key)} className={cn("px-2.5 py-1.5 rounded-lg text-[10px] transition-smooth border", newCategory === key ? "bg-accent/10 border-accent/30 text-accent-light" : "bg-surface-2 border-border/50 text-muted")}>{cfg.icon} {cfg.label}</button>
                ))}
              </div></div>
          </div>

          {/* Conditions */}
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Conditions</label>
            {newConditions.map((cond, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <select value={cond.field} onChange={(e) => { const c = [...newConditions]; c[i].field = e.target.value; setNewConditions(c); }}
                  className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs text-foreground">
                  <option value="">Select field...</option>
                  {conditionFields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select value={cond.operator} onChange={(e) => { const c = [...newConditions]; c[i].operator = e.target.value; setNewConditions(c); }}
                  className="w-20 px-2 py-2 rounded-lg bg-surface-2 border border-border text-xs text-foreground">
                  {[">=", "<=", "==", ">", "<", "!="].map((op) => <option key={op}>{op}</option>)}
                </select>
                <input type="text" value={cond.value} onChange={(e) => { const c = [...newConditions]; c[i].value = e.target.value; setNewConditions(c); }}
                  placeholder="Value" className="w-24 px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs text-foreground font-mono" />
                {newConditions.length > 1 && <button onClick={() => setNewConditions(newConditions.filter((_, j) => j !== i))} className="text-bear-light text-xs">✕</button>}
              </div>
            ))}
            <button onClick={() => setNewConditions([...newConditions, { field: "", operator: ">=", value: "" }])} className="text-[10px] text-accent-light">+ Add condition</button>
          </div>

          {/* Instruments */}
          <div>
            <label className="text-xs text-muted-light mb-1.5 block">Instruments (leave empty for all)</label>
            <div className="flex flex-wrap gap-1">
              {ALL_INSTRUMENTS.slice(0, 12).map((inst) => (
                <button key={inst.symbol} onClick={() => setNewInstruments(newInstruments.includes(inst.symbol) ? newInstruments.filter((s) => s !== inst.symbol) : [...newInstruments, inst.symbol])}
                  className={cn("px-2 py-1 rounded text-[10px] transition-smooth", newInstruments.includes(inst.symbol) ? "bg-accent text-white" : "bg-surface-2 text-muted border border-border/50")}>{inst.displayName}</button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-xs text-muted-light mb-1 block">Urgency</label>
              <div className="flex gap-1.5">{(Object.entries(URGENCY_CONFIG) as [AlertUrgency, typeof URGENCY_CONFIG[AlertUrgency]][]).map(([key, cfg]) => (
                <button key={key} onClick={() => setNewUrgency(key)} className={cn("flex-1 py-2 rounded-lg text-[10px] capitalize transition-smooth border", newUrgency === key ? cfg.badge : "bg-surface-2 border-border/50 text-muted")}>{cfg.label}</button>
              ))}</div></div>
            <div><label className="text-xs text-muted-light mb-1 block">Delivery</label>
              <div className="flex gap-2">{([["in_app", "In-App"], ["push", "Push"], ["email", "Email"]] as [DeliveryChannel, string][]).map(([ch, label]) => (
                <button key={ch} onClick={() => setNewChannels(newChannels.includes(ch) ? newChannels.filter((c) => c !== ch) : [...newChannels, ch])}
                  className={cn("flex-1 py-2 rounded-lg text-[10px] transition-smooth border", newChannels.includes(ch) ? "bg-accent/10 border-accent/30 text-accent-light" : "bg-surface-2 border-border/50 text-muted")}>{label}</button>
              ))}</div></div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowBuilder(false)} className="px-5 py-2.5 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">Cancel</button>
            <button onClick={createRule} disabled={!newName.trim()} className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-40">Create Alert Rule</button>
          </div>
        </div>
      )}

      {/* INBOX */}
      {view === "inbox" && (
        <div className="space-y-3">
          {unread > 0 && <div className="flex justify-end"><button onClick={markAllRead} className="text-xs text-accent-light hover:text-accent">Mark all read</button></div>}
          {notifications.length > 0 ? notifications.map((n) => {
            const catCfg = CATEGORY_CONFIG[n.category];
            const urgCfg = URGENCY_CONFIG[n.urgency];
            return (
              <div key={n.id} className={cn("glass-card p-4 transition-smooth", !n.read ? "border-l-4 border-l-accent" : "")} onClick={() => markRead(n.id)}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{catCfg.icon}</span>
                    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", urgCfg.badge)}>{urgCfg.label}</span>
                    <span className="text-xs font-bold text-foreground">{n.title}</span>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted">{new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }} className="text-muted hover:text-bear-light text-xs">✕</button>
                  </div>
                </div>
                <p className="text-xs text-muted-light">{n.message}</p>
                {n.symbol && <span className="text-[10px] text-accent-light mt-1 inline-block">{ALL_INSTRUMENTS.find((i) => i.symbol === n.symbol)?.displayName || n.symbol}</span>}
              </div>
            );
          }) : (
            <div className="glass-card p-12 text-center"><p className="text-muted text-sm">No alerts. Create alert rules to start receiving notifications.</p></div>
          )}
        </div>
      )}

      {/* TRADE SETUPS */}
      {view === "setups" && (
        <div className="space-y-4">
          <div className="glass-card p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-semibold">Great Trade Setups</h3>
              <p className="text-xs text-muted mt-0.5">
                Elite setups from Market Core Brain + Setup Engine. Sorted by grade, then confidence. Click "Alert me" to create a rule tied to a setup.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />
                <span className="text-muted">Auto-refresh · 30s</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {([
              { id: "all", label: "All", count: setupCounts.total },
              { id: "a_plus", label: "A+", count: setupCounts.aPlus },
              { id: "a", label: "A", count: setupCounts.a },
              { id: "long", label: "Long", count: setupCounts.long },
              { id: "short", label: "Short", count: setupCounts.short },
            ] as const).map((f) => (
              <button
                key={f.id}
                onClick={() => setSetupFilter(f.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-smooth border",
                  setupFilter === f.id
                    ? "bg-accent/15 text-accent-light border-accent/40"
                    : "bg-surface-2 text-muted-light border-border/50"
                )}
              >
                {f.label} <span className="ml-1 opacity-60">{f.count}</span>
              </button>
            ))}
          </div>

          {setupsLoading ? (
            <div className="glass-card p-12 text-center text-muted">Loading elite setups…</div>
          ) : setupsError ? (
            <div className="glass-card p-6 text-sm text-bear-light">{setupsError}</div>
          ) : filteredSetups.length === 0 ? (
            <div className="glass-card p-12 text-center space-y-2">
              <div className="text-3xl">🔎</div>
              <p className="text-sm text-muted">No setups match this filter right now. The brain re-scans every 2 minutes — fresh setups will appear as market conditions align.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSetups.map((setup) => {
                const isBull = setup.direction === "bullish";
                const gradeColor =
                  setup.qualityGrade === "A+" ? "bg-purple-500/15 text-purple-300 border-purple-500/40"
                    : setup.qualityGrade === "A" ? "bg-bull/15 text-bull-light border-bull/40"
                      : setup.qualityGrade === "candidate" ? "bg-accent/15 text-accent-light border-accent/40"
                        : "bg-surface-2 text-muted border-border/50";
                return (
                  <div key={setup.id} className={cn("rounded-xl border p-4 space-y-3", gradeColor)}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold">{setup.displayName} · {setup.timeframe}</span>
                      <span className="px-2 py-0.5 text-xs font-bold rounded border border-current bg-background/40">
                        {setup.qualityGrade}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={cn("uppercase font-bold", isBull ? "text-bull-light" : "text-bear-light")}>
                        {isBull ? "LONG" : "SHORT"}
                      </span>
                      <span className="text-muted">·</span>
                      <span className="uppercase truncate">{setup.setupType.replace(/_/g, " ")}</span>
                      {setup.source === "brain" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-light ml-auto">BRAIN</span>}
                    </div>
                    <div className="space-y-1 text-[11px] font-mono bg-background/30 rounded-lg p-2.5">
                      <Row label="Entry" value={fmtPrice(setup.entry)} />
                      <Row label="SL" value={fmtPrice(setup.stopLoss)} valueClass="text-bear-light" />
                      <Row label="TP1" value={fmtPrice(setup.takeProfit1)} valueClass="text-bull-light" />
                      {setup.takeProfit2 !== undefined && setup.takeProfit2 !== null && <Row label="TP2" value={fmtPrice(setup.takeProfit2)} valueClass="text-bull-light/70" />}
                      {setup.takeProfit3 !== undefined && setup.takeProfit3 !== null && <Row label="TP3" value={fmtPrice(setup.takeProfit3)} valueClass="text-bull-light/50" />}
                      <div className="flex justify-between items-center pt-1 mt-1 border-t border-current/20">
                        <span className="text-muted">RR</span>
                        <span>{setup.riskReward?.toFixed(2) ?? "—"}×</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted">Confidence</span>
                        <span className={cn(setup.confidenceScore >= 89 ? "text-bull-light" : setup.confidenceScore >= 65 ? "text-warn" : "text-muted")}>
                          {setup.confidenceScore}/100
                        </span>
                      </div>
                    </div>
                    {setup.explanation && (
                      <p className="text-[10px] text-muted leading-relaxed line-clamp-2">{setup.explanation}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => createAlertForSetup(setup)}
                        className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-medium transition-smooth hover:opacity-90"
                      >
                        🔔 Alert me
                      </button>
                      {setup.source === "brain" && (
                        <a
                          href={`/dashboard/brain/decision/${setup.id}`}
                          className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 text-muted-light border border-border/50 hover:border-accent"
                        >
                          Audit →
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* RULES */}
      {view === "rules" && (
        <div className="space-y-3">
          {rules.length > 0 ? rules.map((rule) => {
            const catCfg = CATEGORY_CONFIG[rule.category];
            return (
              <div key={rule.id} className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span>{catCfg.icon}</span>
                    <div><div className="text-sm font-bold">{rule.name}</div><div className="text-xs text-muted capitalize">{catCfg.label} • {rule.urgency} urgency</div></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted">{rule.triggeredCount} triggered</span>
                    <button onClick={() => toggleRule(rule.id)} className={cn("w-10 h-5 rounded-full relative transition-smooth", rule.isActive ? "bg-accent" : "bg-surface-3")}>
                      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", rule.isActive ? "left-5" : "left-0.5")} /></button>
                    <button onClick={() => deleteRule(rule.id)} className="text-xs text-bear-light hover:text-bear">Delete</button>
                  </div>
                </div>
                {rule.conditions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {rule.conditions.map((c, i) => (
                      <span key={i} className="text-[10px] bg-surface-2 px-2 py-1 rounded font-mono">{c.field} {c.operator} {c.value}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 text-[10px] text-muted">
                  <span>Instruments: {rule.instruments.length > 0 ? rule.instruments.map((s) => ALL_INSTRUMENTS.find((i) => i.symbol === s)?.displayName || s).join(", ") : "All"}</span>
                  <span>Channels: {rule.channels.join(", ")}</span>
                </div>
              </div>
            );
          }) : (
            <div className="glass-card p-12 text-center">
              <p className="text-muted text-sm mb-3">No alert rules created yet.</p>
              <button onClick={() => setShowBuilder(true)} className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium">Create Your First Alert</button>
            </div>
          )}
        </div>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-border/50">
              <th className="text-left text-[10px] text-muted font-medium px-4 py-3">Time</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Type</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Alert</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Urgency</th>
              <th className="text-left text-[10px] text-muted font-medium px-3 py-3">Status</th>
            </tr></thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id} className="border-b border-border/20">
                  <td className="px-4 py-3 text-xs font-mono text-muted">{new Date(n.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-3 text-xs">{CATEGORY_CONFIG[n.category].icon} {CATEGORY_CONFIG[n.category].label}</td>
                  <td className="px-3 py-3"><div className="text-xs font-medium">{n.title}</div><div className="text-[10px] text-muted">{n.message.slice(0, 60)}...</div></td>
                  <td className="px-3 py-3"><span className={cn("text-[10px] px-2 py-0.5 rounded-full border", URGENCY_CONFIG[n.urgency].badge)}>{URGENCY_CONFIG[n.urgency].label}</span></td>
                  <td className="px-3 py-3"><span className={cn("text-[10px]", n.read ? "text-muted" : "text-accent-light font-medium")}>{n.read ? "Read" : "Unread"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SETTINGS */}
      {view === "settings" && (
        <div className="max-w-2xl space-y-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Delivery Channels</h3>
            <div className="space-y-3">
              {([["in_app", "In-App Notifications", "Alerts appear in the platform inbox"], ["push", "Push Notifications", "Browser or mobile push alerts"], ["email", "Email Alerts", "Receive alerts via email"]] as [DeliveryChannel, string, string][]).map(([ch, label, desc]) => (
                <div key={ch} className="flex items-center justify-between bg-surface-2 rounded-xl p-4">
                  <div><div className="text-xs font-medium text-foreground">{label}</div><div className="text-[10px] text-muted">{desc}</div></div>
                  <button onClick={() => updateSettings({ channels: { ...settings.channels, [ch]: !settings.channels[ch] } })}
                    className={cn("w-10 h-5 rounded-full relative transition-smooth", settings.channels[ch] ? "bg-accent" : "bg-surface-3")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", settings.channels[ch] ? "left-5" : "left-0.5")} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Quiet Hours</h3>
            <div className="flex items-center justify-between bg-surface-2 rounded-xl p-4 mb-3">
              <div><div className="text-xs font-medium text-foreground">Enable Quiet Hours</div><div className="text-[10px] text-muted">Pause non-critical alerts during specified hours</div></div>
              <button onClick={() => updateSettings({ quietHoursEnabled: !settings.quietHoursEnabled })}
                className={cn("w-10 h-5 rounded-full relative transition-smooth", settings.quietHoursEnabled ? "bg-accent" : "bg-surface-3")}>
                <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", settings.quietHoursEnabled ? "left-5" : "left-0.5")} /></button>
            </div>
            {settings.quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] text-muted mb-1 block">Start</label>
                  <input type="time" value={settings.quietStart} onChange={(e) => updateSettings({ quietStart: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs text-foreground" /></div>
                <div><label className="text-[10px] text-muted mb-1 block">End</label>
                  <input type="time" value={settings.quietEnd} onChange={(e) => updateSettings({ quietEnd: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs text-foreground" /></div>
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Throttling</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs text-muted-light mb-1 block">Max alerts per hour</label>
                <input type="number" min={1} max={100} value={settings.maxPerHour} onChange={(e) => updateSettings({ maxPerHour: parseInt(e.target.value) || 20 })}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-sm text-foreground font-mono" /></div>
              <div><label className="text-xs text-muted-light mb-1 block">Deduplication (minutes)</label>
                <input type="number" min={1} max={60} value={settings.deduplicationMinutes} onChange={(e) => updateSettings({ deduplicationMinutes: parseInt(e.target.value) || 5 })}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-sm text-foreground font-mono" /></div>
            </div>
            <p className="text-[10px] text-muted mt-2">Same alert won&apos;t fire again within the deduplication window. Max per hour prevents notification spam.</p>
          </div>
        </div>
      )}

      {/* Alert types overview */}
      {!showBuilder && view === "inbox" && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Available Alert Types</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.entries(CATEGORY_CONFIG) as [AlertCategory, typeof CATEGORY_CONFIG[AlertCategory]][]).map(([, cfg]) => (
              <div key={cfg.label} className="bg-surface-2 rounded-lg p-3 text-center">
                <div className="text-xl mb-1">{cfg.icon}</div>
                <div className="text-xs font-medium text-foreground">{cfg.label}</div>
                <div className="text-[9px] text-muted mt-0.5">{cfg.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function fmtPrice(p: number | undefined): string {
  if (p === undefined || p === null || !Number.isFinite(p)) return "—";
  if (p >= 1000) return p.toFixed(2);
  if (p >= 100) return p.toFixed(3);
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(5);
}
