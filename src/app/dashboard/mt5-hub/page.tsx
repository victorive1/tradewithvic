"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Mt5HubShowcase } from "./ShowcaseView";

interface Mt5Account {
  id: string;
  platform: "MT4" | "MT5";
  login: string;
  server: string;
  broker: string;
  label?: string;
  connected: boolean;
  connectedAt: string;
}

interface HubGroup {
  id: string;
  name: string;
  colorKey: "accent" | "bull" | "bear" | "warn" | "purple" | "blue";
  sortOrder: number;
}

interface AccountMeta {
  groupId: string | null;
  favorite: boolean;
  hubLabel?: string;
}

type ViewMode = "operator" | "showcase";

const ACCOUNTS_KEY = "mt_accounts";
const GROUPS_KEY = "mt5_hub_groups";
const META_KEY = "mt5_hub_meta";
const VIEW_MODE_KEY = "tradewithvic.mt5Hub.viewMode";

const DEFAULT_GROUPS: HubGroup[] = [
  { id: "ungrouped", name: "Ungrouped", colorKey: "accent", sortOrder: 0 },
];

const COLOR_CHIPS: { key: HubGroup["colorKey"]; className: string }[] = [
  { key: "accent", className: "bg-accent/15 text-accent-light border-accent/40" },
  { key: "bull", className: "bg-bull/15 text-bull-light border-bull/40" },
  { key: "bear", className: "bg-bear/15 text-bear-light border-bear/40" },
  { key: "warn", className: "bg-warn/15 text-warn border-warn/40" },
  { key: "purple", className: "bg-purple-500/15 text-purple-400 border-purple-500/40" },
  { key: "blue", className: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
];

function loadGroups(): HubGroup[] {
  try {
    const raw = window.localStorage.getItem(GROUPS_KEY);
    if (!raw) return DEFAULT_GROUPS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_GROUPS;
  } catch { return DEFAULT_GROUPS; }
}

function loadMeta(): Record<string, AccountMeta> {
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch { return {}; }
}

function loadAccounts(): Mt5Account[] {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveGroups(groups: HubGroup[]) {
  try { window.localStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch {}
}

function saveMeta(meta: Record<string, AccountMeta>) {
  try { window.localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
}

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function colorClass(key: HubGroup["colorKey"]): string {
  return COLOR_CHIPS.find((c) => c.key === key)?.className ?? COLOR_CHIPS[0].className;
}

function classifyServer(server: string): "live" | "demo" | "other" {
  const s = server.toLowerCase();
  if (s.includes("demo") || s.includes("trial") || s.includes("practice")) return "demo";
  if (s.includes("live") || s.includes("real") || s.includes("server") || s.includes("prod")) return "live";
  return "other";
}

export default function Mt5HubPage() {
  const [accounts, setAccounts] = useState<Mt5Account[]>([]);
  const [groups, setGroups] = useState<HubGroup[]>(DEFAULT_GROUPS);
  const [meta, setMeta] = useState<Record<string, AccountMeta>>({});
  const [hydrated, setHydrated] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("operator");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "live" | "demo">("all");
  const [platformFilter, setPlatformFilter] = useState<"all" | "MT4" | "MT5">("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  useEffect(() => {
    setAccounts(loadAccounts());
    setGroups(loadGroups());
    setMeta(loadMeta());
    try {
      const m = window.localStorage.getItem(VIEW_MODE_KEY);
      if (m === "operator" || m === "showcase") setViewMode(m);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveGroups(groups);
  }, [groups, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveMeta(meta);
  }, [meta, hydrated]);

  function switchViewMode(mode: ViewMode) {
    setViewMode(mode);
    try { window.localStorage.setItem(VIEW_MODE_KEY, mode); } catch {}
  }

  const accountKey = (a: Mt5Account) => `${a.login}:${a.server}`;

  function setAccountMeta(a: Mt5Account, patch: Partial<AccountMeta>) {
    const k = accountKey(a);
    setMeta((prev) => ({
      ...prev,
      [k]: { ...{ groupId: null, favorite: false }, ...prev[k], ...patch },
    }));
  }

  function toggleFavorite(a: Mt5Account) {
    const k = accountKey(a);
    const current = meta[k]?.favorite ?? false;
    setAccountMeta(a, { favorite: !current });
  }

  function moveAccountToGroup(a: Mt5Account, groupId: string | null) {
    setAccountMeta(a, { groupId });
  }

  function addGroup(name: string, colorKey: HubGroup["colorKey"] = "accent") {
    if (!name.trim()) return;
    const newGroup: HubGroup = { id: generateId(), name: name.trim(), colorKey, sortOrder: groups.length };
    setGroups((prev) => [...prev, newGroup]);
  }

  function renameGroup(id: string, name: string) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
  }

  function setGroupColor(id: string, colorKey: HubGroup["colorKey"]) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, colorKey } : g)));
  }

  function deleteGroup(id: string) {
    if (id === "ungrouped") return;
    setGroups((prev) => prev.filter((g) => g.id !== id));
    // Unassign accounts from deleted group
    setMeta((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k].groupId === id) next[k] = { ...next[k], groupId: null };
      }
      return next;
    });
  }

  // Summaries
  const summary = useMemo(() => {
    const byPlatform = { MT4: 0, MT5: 0 };
    const byType: Record<"live" | "demo" | "other", number> = { live: 0, demo: 0, other: 0 };
    const brokerSet = new Set<string>();
    let favorites = 0;
    for (const a of accounts) {
      byPlatform[a.platform]++;
      byType[classifyServer(a.server)]++;
      brokerSet.add(a.broker);
      if (meta[accountKey(a)]?.favorite) favorites++;
    }
    return {
      total: accounts.length,
      platforms: byPlatform,
      types: byType,
      brokers: brokerSet.size,
      favorites,
    };
  }, [accounts, meta]);

  // Filtering
  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (platformFilter !== "all" && a.platform !== platformFilter) return false;
      if (typeFilter !== "all" && classifyServer(a.server) !== typeFilter) return false;
      if (onlyFavorites && !meta[accountKey(a)]?.favorite) return false;
      if (!q) return true;
      const hubLabel = meta[accountKey(a)]?.hubLabel ?? "";
      return [a.login, a.server, a.broker, a.label ?? "", hubLabel]
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [accounts, meta, search, typeFilter, platformFilter, onlyFavorites]);

  // Group accounts
  const grouped = useMemo(() => {
    const map: Record<string, Mt5Account[]> = {};
    for (const g of groups) map[g.id] = [];
    for (const a of filteredAccounts) {
      const gid = meta[accountKey(a)]?.groupId ?? "ungrouped";
      if (!map[gid]) map[gid] = [];
      map[gid].push(a);
    }
    return map;
  }, [filteredAccounts, groups, meta]);

  if (!hydrated) {
    return <div className="glass-card p-12 text-center text-muted">Loading hub…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">MT5 Multi Account Hub</h1>
          <p className="text-sm text-muted mt-1">
            Central workspace for every connected MT4 / MT5 account. Group, search, and monitor your entire portfolio in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-surface-2 border border-border/50 p-0.5">
            <button
              onClick={() => switchViewMode("operator")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-smooth",
                viewMode === "operator" ? "bg-accent text-white" : "text-muted-light hover:text-foreground")}>
              Operator
            </button>
            <button
              onClick={() => switchViewMode("showcase")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-smooth",
                viewMode === "showcase" ? "bg-accent text-white" : "text-muted-light hover:text-foreground")}>
              Showcase
            </button>
          </div>
          <Link href="/dashboard/trading-hub" className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-border/50 hover:border-accent transition-smooth">
            + Connect account
          </Link>
        </div>
      </div>

      {viewMode === "showcase" ? (
        <Mt5HubShowcase accounts={accounts} groups={groups} meta={meta} summary={summary} />
      ) : (
        <>
          <HubOverviewHeader summary={summary} />

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by login, broker, server, label…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground"
                />
                <svg className="w-4 h-4 absolute left-3 top-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <div className="flex gap-1.5">
                {(["all", "live", "demo"] as const).map((v) => (
                  <button key={v} onClick={() => setTypeFilter(v)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
                      typeFilter === v ? "bg-accent/15 text-accent-light border-accent/40" : "bg-surface-2 text-muted-light border-border/50")}>
                    {v === "all" ? "All" : v === "live" ? "Live" : "Demo"}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {(["all", "MT4", "MT5"] as const).map((v) => (
                  <button key={v} onClick={() => setPlatformFilter(v)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
                      platformFilter === v ? "bg-accent/15 text-accent-light border-accent/40" : "bg-surface-2 text-muted-light border-border/50")}>
                    {v}
                  </button>
                ))}
              </div>
              <button onClick={() => setOnlyFavorites((v) => !v)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth border",
                  onlyFavorites ? "bg-warn/15 text-warn border-warn/40" : "bg-surface-2 text-muted-light border-border/50")}>
                ★ Favorites
              </button>
            </div>
            <button onClick={() => setShowNewGroupForm((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-semibold transition-smooth">
              + New Group
            </button>
          </div>

          {showNewGroupForm && (
            <div className="glass-card p-4 flex items-center gap-3">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name (e.g. Funded, Bots, Investors, High Risk)"
                className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm"
              />
              <button
                onClick={() => { addGroup(newGroupName); setNewGroupName(""); setShowNewGroupForm(false); }}
                className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-semibold"
              >Create</button>
              <button
                onClick={() => { setNewGroupName(""); setShowNewGroupForm(false); }}
                className="text-xs text-muted hover:text-foreground"
              >Cancel</button>
            </div>
          )}

          {accounts.length === 0 ? (
            <div className="glass-card p-12 text-center space-y-3">
              <div className="text-4xl">🧩</div>
              <h3 className="text-lg font-semibold text-foreground">No accounts connected yet</h3>
              <p className="text-sm text-muted max-w-md mx-auto">
                Connect your first MT4 or MT5 account in Trading Hub — then come back here to group and manage your portfolio.
              </p>
              <Link href="/dashboard/trading-hub" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent">
                Connect MT Account
              </Link>
            </div>
          ) : (
            <>
              <GroupedAccountsBoard
                groups={groups}
                grouped={grouped}
                meta={meta}
                onToggleFavorite={toggleFavorite}
                onMoveAccount={moveAccountToGroup}
                onRenameGroup={renameGroup}
                onSetGroupColor={setGroupColor}
                onDeleteGroup={deleteGroup}
                onSetHubLabel={(a, label) => setAccountMeta(a, { hubLabel: label })}
              />
              <HubHealthStatusPanel accounts={accounts} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function HubOverviewHeader({ summary }: { summary: any }) {
  return (
    <section className="glass-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Portfolio Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Total Accounts" value={summary.total} />
        <Stat label="Live / Demo" value={`${summary.types.live} / ${summary.types.demo}`} sub={summary.types.other > 0 ? `+${summary.types.other} other` : undefined} />
        <Stat label="MT4 / MT5" value={`${summary.platforms.MT4} / ${summary.platforms.MT5}`} />
        <Stat label="Brokers" value={summary.brokers} />
        <Stat label="Favorites" value={summary.favorites} valueClass={summary.favorites > 0 ? "text-warn" : "text-muted"} />
      </div>
      <p className="text-[11px] text-muted italic mt-4">
        Balance / equity / total P&amp;L roll-ups across accounts appear here once the broker bridge is wired.
      </p>
    </section>
  );
}

function Stat({ label, value, sub, valueClass }: { label: string; value: any; sub?: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-xs text-muted uppercase tracking-wider">{label}</div>
      <div className={cn("text-2xl font-bold font-mono mt-1", valueClass)}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function GroupedAccountsBoard({
  groups, grouped, meta,
  onToggleFavorite, onMoveAccount, onRenameGroup, onSetGroupColor, onDeleteGroup, onSetHubLabel,
}: {
  groups: HubGroup[];
  grouped: Record<string, Mt5Account[]>;
  meta: Record<string, AccountMeta>;
  onToggleFavorite: (a: Mt5Account) => void;
  onMoveAccount: (a: Mt5Account, groupId: string | null) => void;
  onRenameGroup: (id: string, name: string) => void;
  onSetGroupColor: (id: string, c: HubGroup["colorKey"]) => void;
  onDeleteGroup: (id: string) => void;
  onSetHubLabel: (a: Mt5Account, label: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[...groups].sort((a, b) => a.sortOrder - b.sortOrder).map((g) => (
        <HubGroupCard
          key={g.id}
          group={g}
          accounts={grouped[g.id] ?? []}
          allGroups={groups}
          meta={meta}
          onToggleFavorite={onToggleFavorite}
          onMoveAccount={onMoveAccount}
          onRenameGroup={onRenameGroup}
          onSetGroupColor={onSetGroupColor}
          onDeleteGroup={onDeleteGroup}
          onSetHubLabel={onSetHubLabel}
        />
      ))}
    </div>
  );
}

function HubGroupCard({
  group, accounts, allGroups, meta,
  onToggleFavorite, onMoveAccount, onRenameGroup, onSetGroupColor, onDeleteGroup, onSetHubLabel,
}: any) {
  const [editName, setEditName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const [showMenu, setShowMenu] = useState(false);
  const isDefault = group.id === "ungrouped";

  return (
    <section className={cn("rounded-2xl border p-4", colorClass(group.colorKey))}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {editName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { onRenameGroup(group.id, nameDraft.trim() || group.name); setEditName(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { onRenameGroup(group.id, nameDraft.trim() || group.name); setEditName(false); } }}
              className="bg-surface-2 px-2 py-1 rounded text-sm font-semibold"
            />
          ) : (
            <button onClick={() => !isDefault && setEditName(true)} className="text-sm font-bold uppercase tracking-wide">
              {group.name}
            </button>
          )}
          <span className="text-[11px] opacity-70">({accounts.length})</span>
        </div>
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="text-xs opacity-60 hover:opacity-100">⋯</button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-lg shadow-xl z-10 p-1">
              <div className="px-2 py-1.5 text-[10px] text-muted uppercase tracking-wider">Color</div>
              <div className="grid grid-cols-6 gap-1 px-2 pb-2">
                {COLOR_CHIPS.map((c) => (
                  <button key={c.key} onClick={() => { onSetGroupColor(group.id, c.key); setShowMenu(false); }}
                    className={cn("h-5 rounded border", c.className)} />
                ))}
              </div>
              {!isDefault && (
                <button
                  onClick={() => { if (confirm(`Delete group "${group.name}"? Accounts will move to Ungrouped.`)) onDeleteGroup(group.id); setShowMenu(false); }}
                  className="w-full text-left px-2 py-1.5 text-xs text-bear-light hover:bg-surface-2 rounded"
                >Delete group</button>
              )}
            </div>
          )}
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-xs opacity-60 italic py-4 text-center">No accounts in this group.</div>
      ) : (
        <div className="space-y-2">
          {accounts.map((a: Mt5Account) => {
            const key = `${a.login}:${a.server}`;
            const m = meta[key] ?? { favorite: false, groupId: null };
            return (
              <div key={a.id} className="rounded-lg bg-surface/60 p-3 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onToggleFavorite(a)} className={cn("text-sm", m.favorite ? "text-warn" : "text-muted opacity-60 hover:opacity-100")}>
                      ★
                    </button>
                    <span className="text-sm font-semibold">
                      {m.hubLabel || a.label || `${a.broker} · ${a.login}`}
                    </span>
                    <span className="px-1.5 py-0.5 text-[9px] rounded bg-surface-2 text-muted uppercase">{a.platform}</span>
                    <span className={cn("px-1.5 py-0.5 text-[9px] rounded",
                      classifyServer(a.server) === "live" ? "bg-accent/10 text-accent-light" :
                      classifyServer(a.server) === "demo" ? "bg-bull/10 text-bull-light" :
                      "bg-surface-2 text-muted")}>
                      {classifyServer(a.server)}
                    </span>
                  </div>
                  <select
                    value={m.groupId ?? "ungrouped"}
                    onChange={(e) => onMoveAccount(a, e.target.value === "ungrouped" ? null : e.target.value)}
                    className="text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 text-muted-light"
                  >
                    {allGroups.map((g: HubGroup) => (
                      <option key={g.id} value={g.id === "ungrouped" ? "ungrouped" : g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] mt-1">
                  <div>
                    <div className="text-muted uppercase">Broker</div>
                    <div className="text-foreground">{a.broker}</div>
                  </div>
                  <div>
                    <div className="text-muted uppercase">Login</div>
                    <div className="font-mono text-foreground">{a.login}</div>
                  </div>
                  <div>
                    <div className="text-muted uppercase">Server</div>
                    <div className="font-mono text-foreground truncate">{a.server}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] mt-2 pt-2 border-t border-border/30 text-muted">
                  <div><span className="uppercase opacity-70">Balance</span><span className="ml-1 font-mono">pending</span></div>
                  <div><span className="uppercase opacity-70">Equity</span><span className="ml-1 font-mono">pending</span></div>
                  <div><span className="uppercase opacity-70">Positions</span><span className="ml-1 font-mono">pending</span></div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                  <input
                    type="text"
                    value={m.hubLabel ?? ""}
                    placeholder="Add hub label…"
                    onChange={(e) => onSetHubLabel(a, e.target.value)}
                    className="flex-1 bg-transparent border-b border-border/30 focus:border-accent focus:outline-none text-muted-light placeholder:text-muted"
                  />
                  <Link href="/dashboard/trading-hub" className="text-accent-light underline underline-offset-2">open →</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function HubHealthStatusPanel({ accounts }: { accounts: Mt5Account[] }) {
  const checks = [
    { name: "Connector", status: "pending", message: "MT bridge not yet wired — balances shown as placeholders." },
    { name: "Registry", status: "ok", message: `${accounts.length} account(s) registered in hub.` },
    { name: "Sync", status: accounts.length > 0 ? "pending" : "idle", message: accounts.length > 0 ? "Awaiting live sync feed." : "No accounts to sync." },
    { name: "Permissions", status: "ok", message: "Local-only (no shared viewers configured)." },
  ];
  const statusColor: Record<string, string> = {
    ok: "text-bull-light",
    pending: "text-warn",
    idle: "text-muted",
    error: "text-bear-light",
  };
  return (
    <section className="glass-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3">Hub Health</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {checks.map((c) => (
          <div key={c.name} className="rounded-lg border border-border/50 p-3 bg-surface-2/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{c.name}</span>
              <span className={cn("text-[10px] uppercase tracking-wider font-bold", statusColor[c.status])}>{c.status}</span>
            </div>
            <div className="text-[10px] text-muted mt-1">{c.message}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
