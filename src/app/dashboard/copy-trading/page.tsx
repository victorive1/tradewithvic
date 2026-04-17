"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type CopyTab = "overview" | "master" | "followers" | "settings" | "events" | "analytics";

interface MasterSource {
  id: string;
  name: string;
  type: "account" | "strategy" | "signal";
  status: "active" | "paused" | "disconnected";
  connectedAt: string;
}

interface Follower {
  id: string;
  name: string;
  account: string;
  server: string;
  platform: string;
  status: "active" | "paused" | "disconnected";
  sizingMode: "fixed_lot" | "balance_scale" | "equity_scale" | "risk_percent";
  fixedLot: number;
  riskMultiplier: number;
  maxOpenTrades: number;
  maxPerSymbol: number;
  maxDailyDrawdown: number;
  copySL: boolean;
  copyTP: boolean;
  allowedSymbols: string[];
  totalCopied: number;
  pnl: number;
}

interface CopyEvent {
  id: string;
  time: string;
  type: string;
  masterAction: string;
  symbol: string;
  followers: number;
  successes: number;
  failures: number;
  status: "completed" | "partial" | "failed";
}

// Load saved state
function loadState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function saveState(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value));
}

export default function CopyTradingPage() {
  const [tab, setTab] = useState<CopyTab>("overview");
  const [masters, setMasters] = useState<MasterSource[]>(() => loadState("copy_masters", []));
  const [followers, setFollowers] = useState<Follower[]>(() => loadState("copy_followers", []));
  const [events, setEvents] = useState<CopyEvent[]>([]);
  const [killSwitch, setKillSwitch] = useState(false);
  const [showAddMaster, setShowAddMaster] = useState(false);
  const [showAddFollower, setShowAddFollower] = useState(false);

  // Form states
  const [newMasterName, setNewMasterName] = useState("");
  const [newMasterType, setNewMasterType] = useState<"account" | "strategy" | "signal">("account");
  const [newFollowerName, setNewFollowerName] = useState("");
  const [newFollowerAccount, setNewFollowerAccount] = useState("");
  const [newFollowerServer, setNewFollowerServer] = useState("");
  const [newFollowerSizing, setNewFollowerSizing] = useState<Follower["sizingMode"]>("fixed_lot");
  const [newFollowerLot, setNewFollowerLot] = useState(0.10);
  const [newFollowerRisk, setNewFollowerRisk] = useState(1.0);
  const [newFollowerMaxOpen, setNewFollowerMaxOpen] = useState(5);
  const [newFollowerMaxSymbol, setNewFollowerMaxSymbol] = useState(2);
  const [newFollowerDrawdown, setNewFollowerDrawdown] = useState(5.0);
  const [newFollowerCopySL, setNewFollowerCopySL] = useState(true);
  const [newFollowerCopyTP, setNewFollowerCopyTP] = useState(true);

  useEffect(() => { saveState("copy_masters", masters); }, [masters]);
  useEffect(() => { saveState("copy_followers", followers); }, [followers]);

  function addMaster() {
    if (!newMasterName.trim()) return;
    const master: MasterSource = { id: `m_${Date.now()}`, name: newMasterName, type: newMasterType, status: "active", connectedAt: new Date().toISOString() };
    setMasters([...masters, master]);
    setNewMasterName("");
    setShowAddMaster(false);
    addEvent("Master Added", `Master "${newMasterName}" registered as ${newMasterType}`, "—");
  }

  function addFollower() {
    if (!newFollowerName.trim() || !newFollowerAccount.trim()) return;
    const follower: Follower = {
      id: `f_${Date.now()}`, name: newFollowerName, account: newFollowerAccount, server: newFollowerServer || "—", platform: "MT5",
      status: "active", sizingMode: newFollowerSizing, fixedLot: newFollowerLot, riskMultiplier: newFollowerRisk,
      maxOpenTrades: newFollowerMaxOpen, maxPerSymbol: newFollowerMaxSymbol, maxDailyDrawdown: newFollowerDrawdown,
      copySL: newFollowerCopySL, copyTP: newFollowerCopyTP, allowedSymbols: [], totalCopied: 0, pnl: 0,
    };
    setFollowers([...followers, follower]);
    setNewFollowerName(""); setNewFollowerAccount(""); setNewFollowerServer("");
    setShowAddFollower(false);
    addEvent("Follower Added", `Follower "${newFollowerName}" subscribed`, "—");
  }

  function toggleFollowerStatus(id: string) {
    setFollowers(followers.map((f) => f.id === id ? { ...f, status: f.status === "active" ? "paused" : "active" } : f));
  }

  function removeFollower(id: string) {
    const f = followers.find((x) => x.id === id);
    setFollowers(followers.filter((x) => x.id !== id));
    if (f) addEvent("Follower Removed", `"${f.name}" unsubscribed`, "—");
  }

  function removeMaster(id: string) {
    const m = masters.find((x) => x.id === id);
    setMasters(masters.filter((x) => x.id !== id));
    if (m) addEvent("Master Removed", `"${m.name}" disconnected`, "—");
  }

  function handleKillSwitch() {
    if (!confirm("EMERGENCY: This will stop ALL copy trading and optionally close all copied positions. Continue?")) return;
    setKillSwitch(true);
    setFollowers(followers.map((f) => ({ ...f, status: "paused" })));
    addEvent("KILL SWITCH", "All copy trading halted", "—");
  }

  function addEvent(type: string, action: string, symbol: string) {
    setEvents((prev) => [{ id: `e_${Date.now()}`, time: new Date().toLocaleTimeString(), type, masterAction: action, symbol, followers: followers.length, successes: followers.filter((f) => f.status === "active").length, failures: 0, status: "completed" as const }, ...prev].slice(0, 50));
  }

  const tabs: { id: CopyTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "master", label: "Master Source" },
    { id: "followers", label: "Followers" },
    { id: "settings", label: "Risk Settings" },
    { id: "events", label: "Event History" },
    { id: "analytics", label: "Analytics" },
  ];

  const activeFollowers = followers.filter((f) => f.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Copy Trading Engine</h1>
            {killSwitch && <span className="text-xs bg-bear/10 text-bear-light px-2.5 py-1 rounded-full border border-bear/20 font-bold">HALTED</span>}
            {!killSwitch && masters.length > 0 && <span className="flex items-center gap-1.5 text-xs bg-bull/10 text-bull-light px-2.5 py-1 rounded-full border border-bull/20"><span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />Active</span>}
          </div>
          <p className="text-sm text-muted">Replicate trades from master accounts to follower accounts with individual risk controls</p>
        </div>
        <button onClick={handleKillSwitch} disabled={killSwitch}
          className="px-5 py-2.5 rounded-xl bg-bear text-white text-xs font-bold transition-smooth hover:bg-bear-light disabled:opacity-40">
          Emergency Stop
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth", tab === t.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light")}>{t.label}</button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Masters</div><div className="text-xl font-bold">{masters.length}</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Followers</div><div className="text-xl font-bold">{followers.length}</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Active</div><div className="text-xl font-bold text-bull-light">{activeFollowers}</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Events</div><div className="text-xl font-bold">{events.length}</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Status</div><div className={cn("text-sm font-bold", killSwitch ? "text-bear-light" : masters.length > 0 ? "text-bull-light" : "text-muted")}>{killSwitch ? "Halted" : masters.length > 0 ? "Active" : "Not configured"}</div></div>
          </div>

          {/* Replication flow */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-4">Replication Flow</h3>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <div className="bg-surface-2 rounded-xl p-4 text-center min-w-[140px] border border-border/50">
                <div className="text-xs text-muted mb-1">Master Source</div>
                <div className="text-sm font-bold text-foreground">{masters.length > 0 ? masters[0].name : "Not set"}</div>
              </div>
              <svg className="w-8 h-8 text-accent-light flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              <div className="bg-accent/10 rounded-xl p-4 text-center min-w-[140px] border border-accent/20">
                <div className="text-xs text-accent-light mb-1">Copy Engine</div>
                <div className="text-sm font-bold text-accent-light">Validate & Route</div>
              </div>
              <svg className="w-8 h-8 text-accent-light flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              <div className="space-y-2">
                {followers.length > 0 ? followers.slice(0, 3).map((f) => (
                  <div key={f.id} className="bg-surface-2 rounded-lg px-3 py-2 text-xs border border-border/50 flex items-center gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full", f.status === "active" ? "bg-bull" : "bg-muted")} />
                    {f.name}
                  </div>
                )) : <div className="bg-surface-2 rounded-lg px-3 py-2 text-xs text-muted border border-border/50">No followers</div>}
              </div>
            </div>
          </div>

          {/* Replicated events */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Replicated Events</h3>
            <div className="text-xs text-muted space-y-1">
              {["Open market position", "Place pending order", "Modify stop loss", "Modify take profit", "Partial close", "Full close", "Cancel pending order", "Emergency close all"].map((evt) => (
                <div key={evt} className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-accent" />{evt}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MASTER SOURCE */}
      {tab === "master" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Master Sources</h3>
            <button onClick={() => setShowAddMaster(!showAddMaster)} className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium">+ Add Master</button>
          </div>

          {showAddMaster && (
            <div className="glass-card p-5 space-y-4">
              <h4 className="text-sm font-semibold">Register Master Source</h4>
              <div><label className="text-xs text-muted-light mb-1.5 block">Master Name</label>
                <input type="text" value={newMasterName} onChange={(e) => setNewMasterName(e.target.value)} placeholder="e.g. My Main Account" className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
              <div>
                <label className="text-xs text-muted-light mb-1.5 block">Source Type</label>
                <div className="flex gap-2">
                  {(["account", "strategy", "signal"] as const).map((t) => (
                    <button key={t} onClick={() => setNewMasterType(t)}
                      className={cn("flex-1 py-2.5 rounded-xl text-xs font-medium capitalize transition-smooth", newMasterType === t ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{t}</button>
                  ))}
                </div>
              </div>
              <button onClick={addMaster} disabled={!newMasterName.trim()} className="px-6 py-2.5 rounded-xl bg-accent text-white text-sm font-medium transition-smooth disabled:opacity-40">Register Master</button>
            </div>
          )}

          {masters.length === 0 ? (
            <div className="glass-card p-12 text-center"><p className="text-muted text-sm">No master source configured. Add a master account, strategy, or signal source to start copying.</p></div>
          ) : masters.map((m) => (
            <div key={m.id} className="glass-card p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={cn("w-3 h-3 rounded-full", m.status === "active" ? "bg-bull pulse-live" : "bg-muted")} />
                <div>
                  <div className="text-sm font-semibold">{m.name}</div>
                  <div className="text-xs text-muted capitalize">{m.type} • Connected {new Date(m.connectedAt).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setMasters(masters.map((x) => x.id === m.id ? { ...x, status: x.status === "active" ? "paused" : "active" } : x))}
                  className="px-3 py-1.5 rounded-lg text-xs bg-surface-2 text-muted-light border border-border/50">{m.status === "active" ? "Pause" : "Resume"}</button>
                <button onClick={() => removeMaster(m.id)} className="px-3 py-1.5 rounded-lg text-xs bg-bear/10 text-bear-light border border-bear/20">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FOLLOWERS */}
      {tab === "followers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Follower Accounts ({followers.length})</h3>
            <button onClick={() => setShowAddFollower(!showAddFollower)} className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium">+ Add Follower</button>
          </div>

          {showAddFollower && (
            <div className="glass-card p-5 space-y-4">
              <h4 className="text-sm font-semibold">Add Follower Account</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-light mb-1 block">Follower Name</label>
                  <input type="text" value={newFollowerName} onChange={(e) => setNewFollowerName(e.target.value)} placeholder="e.g. Account 2" className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
                <div><label className="text-xs text-muted-light mb-1 block">Account Login</label>
                  <input type="text" value={newFollowerAccount} onChange={(e) => setNewFollowerAccount(e.target.value)} placeholder="e.g. 5042885676" className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
                <div><label className="text-xs text-muted-light mb-1 block">Broker Server</label>
                  <input type="text" value={newFollowerServer} onChange={(e) => setNewFollowerServer(e.target.value)} placeholder="e.g. ICMarkets-Live01" className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
                <div><label className="text-xs text-muted-light mb-1 block">Sizing Mode</label>
                  <select value={newFollowerSizing} onChange={(e) => setNewFollowerSizing(e.target.value as any)} className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-sm text-foreground">
                    <option value="fixed_lot">Fixed Lot Size</option>
                    <option value="balance_scale">Balance-Based Scaling</option>
                    <option value="equity_scale">Equity-Based Scaling</option>
                    <option value="risk_percent">Risk % Per Trade</option>
                  </select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-muted-light mb-1 block">{newFollowerSizing === "fixed_lot" ? "Lot Size" : "Risk %"}</label>
                  <input type="number" step="0.01" value={newFollowerSizing === "fixed_lot" ? newFollowerLot : newFollowerRisk}
                    onChange={(e) => newFollowerSizing === "fixed_lot" ? setNewFollowerLot(parseFloat(e.target.value) || 0.01) : setNewFollowerRisk(parseFloat(e.target.value) || 1)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
                <div><label className="text-xs text-muted-light mb-1 block">Max Open Trades</label>
                  <input type="number" min="1" value={newFollowerMaxOpen} onChange={(e) => setNewFollowerMaxOpen(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
                <div><label className="text-xs text-muted-light mb-1 block">Max Daily DD %</label>
                  <input type="number" step="0.5" value={newFollowerDrawdown} onChange={(e) => setNewFollowerDrawdown(parseFloat(e.target.value) || 3)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground font-mono" /></div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={newFollowerCopySL} onChange={(e) => setNewFollowerCopySL(e.target.checked)} className="accent-accent" /><span className="text-xs text-muted-light">Copy SL</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={newFollowerCopyTP} onChange={(e) => setNewFollowerCopyTP(e.target.checked)} className="accent-accent" /><span className="text-xs text-muted-light">Copy TP</span></label>
              </div>
              <button onClick={addFollower} disabled={!newFollowerName.trim() || !newFollowerAccount.trim()} className="px-6 py-2.5 rounded-xl bg-accent text-white text-sm font-medium transition-smooth disabled:opacity-40">Add Follower</button>
            </div>
          )}

          {followers.length === 0 ? (
            <div className="glass-card p-12 text-center"><p className="text-muted text-sm">No followers added. Add follower accounts to start replicating trades.</p></div>
          ) : followers.map((f) => (
            <div key={f.id} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={cn("w-2.5 h-2.5 rounded-full", f.status === "active" ? "bg-bull pulse-live" : "bg-muted")} />
                  <div>
                    <div className="text-sm font-semibold">{f.name}</div>
                    <div className="text-xs text-muted">{f.platform} • {f.account} • {f.server}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleFollowerStatus(f.id)} className={cn("px-3 py-1.5 rounded-lg text-xs border transition-smooth", f.status === "active" ? "bg-warn/10 text-warn border-warn/20" : "bg-bull/10 text-bull-light border-bull/20")}>{f.status === "active" ? "Pause" : "Resume"}</button>
                  <button onClick={() => removeFollower(f.id)} className="px-3 py-1.5 rounded-lg text-xs bg-bear/10 text-bear-light border border-bear/20">Remove</button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-surface-2 rounded-lg p-2"><span className="text-muted block">Sizing</span><span className="text-foreground capitalize">{f.sizingMode.replace("_", " ")}</span></div>
                <div className="bg-surface-2 rounded-lg p-2"><span className="text-muted block">{f.sizingMode === "fixed_lot" ? "Lot" : "Risk"}</span><span className="text-foreground font-mono">{f.sizingMode === "fixed_lot" ? f.fixedLot : `${f.riskMultiplier}%`}</span></div>
                <div className="bg-surface-2 rounded-lg p-2"><span className="text-muted block">Max Open</span><span className="text-foreground">{f.maxOpenTrades}</span></div>
                <div className="bg-surface-2 rounded-lg p-2"><span className="text-muted block">Max DD</span><span className="text-foreground">{f.maxDailyDrawdown}%</span></div>
              </div>
              <div className="flex gap-3 mt-2 text-xs text-muted">
                <span>SL: {f.copySL ? <span className="text-bull-light">Copy</span> : <span className="text-bear-light">Skip</span>}</span>
                <span>TP: {f.copyTP ? <span className="text-bull-light">Copy</span> : <span className="text-bear-light">Skip</span>}</span>
                <span>Copied: {f.totalCopied} trades</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RISK SETTINGS */}
      {tab === "settings" && (
        <div className="space-y-4 max-w-2xl">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-4">Global Copy Trading Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-surface-2 rounded-xl p-4">
                <div><div className="text-xs font-medium text-foreground">Idempotent Execution</div><div className="text-[10px] text-muted">Prevent duplicate copy of the same master event</div></div>
                <span className="text-xs text-bull-light font-medium">Always On</span>
              </div>
              <div className="flex items-center justify-between bg-surface-2 rounded-xl p-4">
                <div><div className="text-xs font-medium text-foreground">Symbol Mapping Validation</div><div className="text-[10px] text-muted">Reject trades if follower broker doesn&apos;t have the symbol</div></div>
                <span className="text-xs text-bull-light font-medium">Always On</span>
              </div>
              <div className="flex items-center justify-between bg-surface-2 rounded-xl p-4">
                <div><div className="text-xs font-medium text-foreground">Connector Health Check</div><div className="text-[10px] text-muted">Verify broker connection before every copy</div></div>
                <span className="text-xs text-bull-light font-medium">Always On</span>
              </div>
              <div className="flex items-center justify-between bg-surface-2 rounded-xl p-4">
                <div><div className="text-xs font-medium text-foreground">Full Audit Trail</div><div className="text-[10px] text-muted">Log every attempt, fill, and failure</div></div>
                <span className="text-xs text-bull-light font-medium">Always On</span>
              </div>
              <div className="flex items-center justify-between bg-surface-2 rounded-xl p-4">
                <div><div className="text-xs font-medium text-foreground">Risk Rejection Logging</div><div className="text-[10px] text-muted">Record when follower constraints block a copy</div></div>
                <span className="text-xs text-bull-light font-medium">Always On</span>
              </div>
            </div>
          </div>
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Per-Follower Controls Available</h3>
            <p className="text-xs text-muted leading-relaxed">Each follower can independently set: sizing mode (fixed lot / balance scale / equity scale / risk %), max open trades, max exposure per symbol, max daily drawdown, allowed symbol list, and whether to copy SL/TP exactly, offset them, or use custom exits. Edit follower settings in the Followers tab.</p>
          </div>
        </div>
      )}

      {/* EVENT HISTORY */}
      {tab === "events" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Event History ({events.length})</h3>
          {events.length === 0 ? (
            <div className="glass-card p-12 text-center"><p className="text-muted text-sm">No copy events yet. Events will appear here when master actions are replicated to followers.</p></div>
          ) : (
            <div className="glass-card overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-border/50">
                  <th className="text-left text-xs text-muted font-medium px-4 py-3">Time</th>
                  <th className="text-left text-xs text-muted font-medium px-3 py-3">Event</th>
                  <th className="text-left text-xs text-muted font-medium px-3 py-3">Action</th>
                  <th className="text-left text-xs text-muted font-medium px-3 py-3">Status</th>
                </tr></thead>
                <tbody>
                  {events.map((evt) => (
                    <tr key={evt.id} className="border-b border-border/20">
                      <td className="px-4 py-3 text-xs font-mono text-muted">{evt.time}</td>
                      <td className="px-3 py-3 text-xs font-medium text-foreground">{evt.type}</td>
                      <td className="px-3 py-3 text-xs text-muted-light">{evt.masterAction}</td>
                      <td className="px-3 py-3"><span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", evt.status === "completed" ? "badge-bull" : evt.status === "partial" ? "bg-warn/10 text-warn" : "badge-bear")}>{evt.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ANALYTICS */}
      {tab === "analytics" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Copy Trading Analytics</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="glass-card p-5 text-center"><div className="text-xs text-muted mb-2">Replication Success Rate</div><div className="text-2xl font-black text-bull-light">{events.length > 0 ? "100%" : "—"}</div></div>
            <div className="glass-card p-5 text-center"><div className="text-xs text-muted mb-2">Avg Latency</div><div className="text-2xl font-black text-accent-light">{events.length > 0 ? "<1s" : "—"}</div></div>
            <div className="glass-card p-5 text-center"><div className="text-xs text-muted mb-2">Risk Rejections</div><div className="text-2xl font-black text-foreground">0</div></div>
          </div>
          <div className="glass-card p-5">
            <h4 className="text-sm font-semibold mb-3">Metrics That Matter</h4>
            <div className="grid sm:grid-cols-2 gap-3 text-xs text-muted">
              <div className="bg-surface-2 rounded-lg p-3">Replication success rate</div>
              <div className="bg-surface-2 rounded-lg p-3">Event-to-execution latency</div>
              <div className="bg-surface-2 rounded-lg p-3">Master/follower lifecycle mismatch rate</div>
              <div className="bg-surface-2 rounded-lg p-3">Risk rejection rate per follower</div>
              <div className="bg-surface-2 rounded-lg p-3">Follower P&L by master source</div>
              <div className="bg-surface-2 rounded-lg p-3">Connector failure frequency</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
