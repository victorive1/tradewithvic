"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type ProfileTab = "overview" | "stats" | "saved" | "signals" | "community" | "settings";

interface UserProfile {
  displayName: string;
  handle: string;
  bio: string;
  avatar: string;
  role: string;
  joinDate: string;
  plan: string;
  preferredMarkets: string[];
  preferredTimeframes: string[];
  strategyStyle: string;
  riskAppetite: string;
  visibility: { stats: boolean; activity: boolean; signals: boolean; following: boolean };
  // Stats
  savedSetups: number;
  publishedIdeas: number;
  signalsViewed: number;
  followers: number;
  following: number;
  daysActive: number;
}

interface SavedItem {
  id: string;
  type: "setup" | "chart" | "insight" | "signal";
  title: string;
  symbol: string;
  savedAt: string;
}

const defaultProfile: UserProfile = {
  displayName: "Victor", handle: "victorive", bio: "", avatar: "V", role: "admin", joinDate: "2026-04-17",
  plan: "Premium", preferredMarkets: ["forex", "metals", "crypto"], preferredTimeframes: ["1h", "4h"],
  strategyStyle: "Smart Money", riskAppetite: "Moderate",
  visibility: { stats: true, activity: true, signals: false, following: true },
  savedSetups: 0, publishedIdeas: 0, signalsViewed: 0, followers: 0, following: 0, daysActive: 1,
};

function loadProfile(): UserProfile {
  if (typeof window === "undefined") return defaultProfile;
  try { const s = localStorage.getItem("user_profile"); return s ? { ...defaultProfile, ...JSON.parse(s) } : defaultProfile; } catch { return defaultProfile; }
}

function saveProfile(profile: UserProfile) {
  localStorage.setItem("user_profile", JSON.stringify(profile));
}

function loadSavedItems(): SavedItem[] {
  if (typeof window === "undefined") return [];
  try { const s = localStorage.getItem("saved_items"); return s ? JSON.parse(s) : []; } catch { return []; }
}

function loadCustomSignals(): any[] {
  if (typeof window === "undefined") return [];
  try { const s = localStorage.getItem("custom_signals"); return s ? JSON.parse(s) : []; } catch { return []; }
}

function loadCustomBots(): any[] {
  if (typeof window === "undefined") return [];
  try { const s = localStorage.getItem("custom_bots"); return s ? JSON.parse(s) : []; } catch { return []; }
}

export default function ProfilePage() {
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(defaultProfile);
  const [savedItems] = useState<SavedItem[]>(loadSavedItems);
  const [customSignals, setCustomSignals] = useState<any[]>([]);
  const [customBots, setCustomBots] = useState<any[]>([]);

  useEffect(() => {
    setProfile(loadProfile());
    setCustomSignals(loadCustomSignals());
    setCustomBots(loadCustomBots());
    // Count days active
    const join = new Date(loadProfile().joinDate);
    const days = Math.max(1, Math.ceil((Date.now() - join.getTime()) / (1000 * 60 * 60 * 24)));
    setProfile((p) => ({ ...p, daysActive: days, savedSetups: loadSavedItems().length, publishedIdeas: loadCustomSignals().length }));
  }, []);

  function update(partial: Partial<UserProfile>) {
    const updated = { ...profile, ...partial };
    setProfile(updated);
    saveProfile(updated);
  }

  function handleSaveEdit() {
    update(editForm);
    setEditing(false);
  }

  const tabs: { id: ProfileTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "stats", label: "Stats" },
    { id: "saved", label: "Saved" },
    { id: "signals", label: "My Signals" },
    { id: "community", label: "Community" },
    { id: "settings", label: "Settings" },
  ];

  const allMarkets = ["forex", "metals", "energy", "indices", "crypto"];
  const allTimeframes = ["5m", "15m", "1h", "4h", "1d"];
  const strategyStyles = ["Smart Money", "Price Action", "Scalping", "Swing Trading", "Breakout", "Trend Following", "Reversal", "Order Flow"];
  const riskLevels = ["Conservative", "Moderate", "Aggressive"];

  return (
    <div className="space-y-6">
      {/* Profile Hero */}
      <div className="glass-card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center text-white text-3xl font-black">
              {profile.avatar || profile.displayName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-foreground">{profile.displayName}</h1>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                  profile.role === "admin" ? "bg-accent/20 text-accent-light border border-accent/30" : "bg-surface-3 text-muted")}>{profile.role}</span>
                <span className="text-[10px] bg-bull/10 text-bull-light px-2 py-0.5 rounded-full border border-bull/20">{profile.plan}</span>
              </div>
              <p className="text-sm text-muted mb-1">@{profile.handle}</p>
              <p className="text-xs text-muted-light max-w-md">{profile.bio || "No bio yet — tell the community about your trading style"}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                <span>Joined {new Date(profile.joinDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                <span>{profile.daysActive} days active</span>
                <span className="capitalize">{profile.strategyStyle} trader</span>
              </div>
            </div>
          </div>
          <button onClick={() => { setEditForm(profile); setEditing(true); }} className="px-4 py-2 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-xs font-medium hover:border-border-light transition-smooth">
            Edit Profile
          </button>
        </div>

        {/* Quick stats bar */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-5 pt-5 border-t border-border/30">
          {[
            { label: "Saved Setups", value: savedItems.length + customBots.length },
            { label: "Custom Signals", value: customSignals.length },
            { label: "Custom Bots", value: customBots.length },
            { label: "Preferred Markets", value: profile.preferredMarkets.length },
            { label: "Followers", value: profile.followers },
            { label: "Following", value: profile.following },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-lg font-bold text-foreground">{stat.value}</div>
              <div className="text-[10px] text-muted">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Edit Profile</h3>
            <button onClick={() => setEditing(false)} className="text-muted hover:text-muted-light">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-xs text-muted-light mb-1 block">Display Name</label>
              <input type="text" value={editForm.displayName} onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div>
            <div><label className="text-xs text-muted-light mb-1 block">Handle</label>
              <div className="flex items-center"><span className="text-sm text-muted mr-1">@</span>
              <input type="text" value={editForm.handle} onChange={(e) => setEditForm({ ...editForm, handle: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground" /></div></div>
          </div>
          <div><label className="text-xs text-muted-light mb-1 block">Bio</label>
            <textarea value={editForm.bio} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} placeholder="Tell the community about your trading style..." rows={3} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground resize-none" /></div>
          <div><label className="text-xs text-muted-light mb-2 block">Preferred Markets</label>
            <div className="flex flex-wrap gap-2">{allMarkets.map((m) => (
              <button key={m} onClick={() => setEditForm({ ...editForm, preferredMarkets: editForm.preferredMarkets.includes(m) ? editForm.preferredMarkets.filter((x) => x !== m) : [...editForm.preferredMarkets, m] })}
                className={cn("px-3 py-1.5 rounded-lg text-xs capitalize transition-smooth", editForm.preferredMarkets.includes(m) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{m}</button>
            ))}</div></div>
          <div><label className="text-xs text-muted-light mb-2 block">Preferred Timeframes</label>
            <div className="flex gap-2">{allTimeframes.map((tf) => (
              <button key={tf} onClick={() => setEditForm({ ...editForm, preferredTimeframes: editForm.preferredTimeframes.includes(tf) ? editForm.preferredTimeframes.filter((x) => x !== tf) : [...editForm.preferredTimeframes, tf] })}
                className={cn("px-3 py-1.5 rounded-lg text-xs transition-smooth", editForm.preferredTimeframes.includes(tf) ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{tf}</button>
            ))}</div></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-xs text-muted-light mb-1 block">Strategy Style</label>
              <select value={editForm.strategyStyle} onChange={(e) => setEditForm({ ...editForm, strategyStyle: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border text-sm text-foreground">
                {strategyStyles.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div><label className="text-xs text-muted-light mb-1 block">Risk Appetite</label>
              <div className="flex gap-2">{riskLevels.map((r) => (
                <button key={r} onClick={() => setEditForm({ ...editForm, riskAppetite: r })}
                  className={cn("flex-1 py-2.5 rounded-xl text-xs font-medium transition-smooth", editForm.riskAppetite === r ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{r}</button>
              ))}</div></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setEditing(false)} className="px-6 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">Cancel</button>
            <button onClick={handleSaveEdit} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium transition-smooth glow-accent">Save Profile</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth", tab === t.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{t.label}</button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Trading Identity</h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between"><span className="text-muted">Markets</span><span className="text-foreground capitalize">{profile.preferredMarkets.join(", ")}</span></div>
              <div className="flex justify-between"><span className="text-muted">Timeframes</span><span className="text-foreground">{profile.preferredTimeframes.join(", ")}</span></div>
              <div className="flex justify-between"><span className="text-muted">Style</span><span className="text-foreground">{profile.strategyStyle}</span></div>
              <div className="flex justify-between"><span className="text-muted">Risk</span><span className={cn("font-medium", profile.riskAppetite === "Conservative" ? "text-bull-light" : profile.riskAppetite === "Aggressive" ? "text-bear-light" : "text-accent-light")}>{profile.riskAppetite}</span></div>
              <div className="flex justify-between"><span className="text-muted">Plan</span><span className="text-bull-light">{profile.plan}</span></div>
            </div>
          </div>
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Recent Activity</h3>
            {customSignals.length > 0 || customBots.length > 0 ? (
              <div className="space-y-2">
                {customSignals.slice(0, 3).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-surface-2 rounded-lg p-2.5">
                    <div className="text-xs"><span className="text-foreground font-medium">{s.name}</span><span className="text-muted ml-2">Custom Signal</span></div>
                    <span className="text-[10px] text-muted">{new Date(s.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
                {customBots.slice(0, 3).map((b: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-surface-2 rounded-lg p-2.5">
                    <div className="text-xs"><span className="text-foreground font-medium">{b.botName}</span><span className="text-muted ml-2">Custom Bot</span></div>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded capitalize", b.status === "paper" ? "text-warn" : "text-muted")}>{b.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">No recent activity yet. Build custom signals or bots to see them here.</p>
            )}
          </div>
          <div className="glass-card p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-3">Public Profile URL</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 px-4 py-2.5 rounded-xl bg-surface-2 border border-border/50 text-sm text-muted-light font-mono">tradewithvic.com/u/{profile.handle}</div>
              <button onClick={() => { navigator.clipboard.writeText(`tradewithvic.com/u/${profile.handle}`); alert("Copied!"); }} className="px-4 py-2.5 rounded-xl bg-accent text-white text-xs font-medium">Copy</button>
            </div>
          </div>
        </div>
      )}

      {/* STATS */}
      {tab === "stats" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="glass-card p-5 text-center"><div className="text-2xl font-black text-foreground">{savedItems.length + customBots.length}</div><div className="text-xs text-muted mt-1">Saved Items</div></div>
            <div className="glass-card p-5 text-center"><div className="text-2xl font-black text-accent-light">{customSignals.length}</div><div className="text-xs text-muted mt-1">Signal Engines</div></div>
            <div className="glass-card p-5 text-center"><div className="text-2xl font-black text-bull-light">{customBots.length}</div><div className="text-xs text-muted mt-1">Custom Bots</div></div>
            <div className="glass-card p-5 text-center"><div className="text-2xl font-black text-foreground">{profile.daysActive}</div><div className="text-xs text-muted mt-1">Days Active</div></div>
          </div>
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Platform Engagement</h3>
            <div className="grid sm:grid-cols-3 gap-4 text-xs">
              <div className="bg-surface-2 rounded-xl p-4 text-center"><div className="text-lg font-bold">{profile.preferredMarkets.length}</div><div className="text-muted mt-1">Markets Tracked</div></div>
              <div className="bg-surface-2 rounded-xl p-4 text-center"><div className="text-lg font-bold">{profile.preferredTimeframes.length}</div><div className="text-muted mt-1">Timeframes Used</div></div>
              <div className="bg-surface-2 rounded-xl p-4 text-center"><div className="text-lg font-bold">{profile.followers}</div><div className="text-muted mt-1">Community Followers</div></div>
            </div>
          </div>
        </div>
      )}

      {/* SAVED */}
      {tab === "saved" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Saved Items</h3>
          {savedItems.length > 0 ? savedItems.map((item) => (
            <div key={item.id} className="glass-card p-4 flex items-center justify-between">
              <div><div className="text-sm font-medium">{item.title}</div><div className="text-xs text-muted">{item.symbol} • {item.type} • Saved {new Date(item.savedAt).toLocaleDateString()}</div></div>
              <span className="text-xs bg-surface-2 px-2 py-0.5 rounded capitalize">{item.type}</span>
            </div>
          )) : (
            <div className="glass-card p-12 text-center"><p className="text-muted text-sm">No saved items yet. Save setups, charts, or signals from across the platform and they&apos;ll appear here.</p></div>
          )}
        </div>
      )}

      {/* MY SIGNALS */}
      {tab === "signals" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">My Custom Signals ({customSignals.length})</h3>
            <a href="/dashboard/custom-signals" className="text-xs text-accent-light hover:text-accent">+ Build New Signal</a>
          </div>
          {customSignals.length > 0 ? customSignals.map((sig: any, i: number) => (
            <div key={i} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div><div className="text-sm font-bold">{sig.name}</div><div className="text-xs text-muted">{sig.detectedStrategy}</div></div>
                <span className="text-xs bg-bull/10 text-bull-light px-2 py-0.5 rounded border border-bull/20">Active</span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted">
                <span>{sig.confluences?.filter((c: any) => c.enabled)?.length || 0} confluences</span>
                <span>Min score: {sig.minScore}/100</span>
                <span>TFs: {sig.timeframes?.join(", ") || "—"}</span>
                <span>Session: {sig.session || "All"}</span>
              </div>
            </div>
          )) : (
            <div className="glass-card p-12 text-center">
              <p className="text-muted text-sm mb-3">No custom signals yet.</p>
              <a href="/dashboard/custom-signals" className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium inline-block">Build Your First Signal</a>
            </div>
          )}

          {/* Custom bots section */}
          <div className="flex items-center justify-between mt-6">
            <h3 className="text-sm font-semibold">My Custom Bots ({customBots.length})</h3>
            <a href="/dashboard/custom-bot" className="text-xs text-accent-light hover:text-accent">+ Build New Bot</a>
          </div>
          {customBots.length > 0 ? customBots.map((bot: any, i: number) => (
            <div key={i} className="glass-card p-5">
              <div className="flex items-center justify-between mb-2">
                <div><div className="text-sm font-bold">{bot.botName}</div><div className="text-xs text-muted capitalize">{bot.botFamily} • {bot.symbols?.length || 0} pairs</div></div>
                <span className={cn("text-xs px-2 py-0.5 rounded capitalize", bot.status === "paper" ? "bg-warn/10 text-warn" : bot.status === "live" ? "bg-bull/10 text-bull-light" : "bg-surface-3 text-muted")}>{bot.status}</span>
              </div>
            </div>
          )) : (
            <div className="glass-card p-12 text-center">
              <p className="text-muted text-sm mb-3">No custom bots yet.</p>
              <a href="/dashboard/custom-bot" className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium inline-block">Build Your First Bot</a>
            </div>
          )}
        </div>
      )}

      {/* COMMUNITY */}
      {tab === "community" && (
        <div className="space-y-4">
          <div className="glass-card p-12 text-center">
            <div className="text-4xl mb-3">👥</div>
            <h3 className="text-lg font-semibold mb-2">Community Features Coming Soon</h3>
            <p className="text-sm text-muted max-w-md mx-auto">Follow other traders, share setups, react to ideas, and build your reputation in the TradeWithVic community.</p>
          </div>
        </div>
      )}

      {/* SETTINGS */}
      {tab === "settings" && (
        <div className="max-w-2xl space-y-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Privacy & Visibility</h3>
            <div className="space-y-3">
              {[
                { key: "stats" as const, label: "Show Stats Publicly", desc: "Others can see your signal count, bot count, and engagement" },
                { key: "activity" as const, label: "Show Recent Activity", desc: "Others can see your recent signals and bot activity" },
                { key: "signals" as const, label: "Show My Signals", desc: "Others can see your custom signal engines" },
                { key: "following" as const, label: "Show Following List", desc: "Others can see who you follow" },
              ].map((setting) => (
                <div key={setting.key} className="flex items-center justify-between bg-surface-2 rounded-xl p-3">
                  <div><div className="text-xs font-medium text-foreground">{setting.label}</div><div className="text-[10px] text-muted">{setting.desc}</div></div>
                  <button onClick={() => update({ visibility: { ...profile.visibility, [setting.key]: !profile.visibility[setting.key] } })}
                    className={cn("w-10 h-5 rounded-full relative transition-smooth", profile.visibility[setting.key] ? "bg-accent" : "bg-surface-3")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-smooth", profile.visibility[setting.key] ? "left-5" : "left-0.5")} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Account</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted">Email</span><span className="text-foreground">{profile.handle}@tradewithvic.com</span></div>
              <div className="flex justify-between"><span className="text-muted">Role</span><span className="text-foreground capitalize">{profile.role}</span></div>
              <div className="flex justify-between"><span className="text-muted">Plan</span><span className="text-bull-light">{profile.plan}</span></div>
              <div className="flex justify-between"><span className="text-muted">Joined</span><span className="text-foreground">{new Date(profile.joinDate).toLocaleDateString()}</span></div>
            </div>
          </div>
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Linked Accounts</h3>
            {(() => {
              const mt = typeof window !== "undefined" ? localStorage.getItem("mt_account") : null;
              if (mt) { const acct = JSON.parse(mt); return <div className="flex items-center justify-between bg-surface-2 rounded-xl p-3"><div className="text-xs"><span className="text-foreground font-medium">{acct.broker}</span><span className="text-muted ml-2">{acct.server} • {acct.login}</span></div><span className="text-xs text-bull-light">Connected</span></div>; }
              return <p className="text-xs text-muted">No trading accounts linked. Go to Trading Hub to connect.</p>;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
