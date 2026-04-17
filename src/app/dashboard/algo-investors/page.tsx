"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type InvTab = "overview" | "groups" | "investors" | "settlements" | "trades";

const groups = [
  { id: "g1", name: "Alpha Pool", bot: "Algo Trading 2.0 - A", investors: 5, pool: 250000, growth: "+12.4%", status: "Active" },
  { id: "g2", name: "Beta Pool", bot: "Algo Trading 2.0 - B", investors: 3, pool: 150000, growth: "+8.7%", status: "Active" },
];

const investors = [
  { name: "Investor Alpha", group: "Alpha Pool", deposit: 100000, ownership: "40%", estPayout: "$6,200", capUsage: "12.4%" },
  { name: "Investor Beta", group: "Alpha Pool", deposit: 75000, ownership: "30%", estPayout: "$4,650", capUsage: "12.4%" },
  { name: "Investor Charlie", group: "Alpha Pool", deposit: 50000, ownership: "20%", estPayout: "$3,100", capUsage: "12.4%" },
  { name: "Investor Delta", group: "Alpha Pool", deposit: 25000, ownership: "10%", estPayout: "$1,550", capUsage: "12.4%" },
  { name: "Investor Echo", group: "Beta Pool", deposit: 80000, ownership: "53.3%", estPayout: "$3,480", capUsage: "8.7%" },
  { name: "Investor Foxtrot", group: "Beta Pool", deposit: 40000, ownership: "26.7%", estPayout: "$1,740", capUsage: "8.7%" },
  { name: "Investor Golf", group: "Beta Pool", deposit: 30000, ownership: "20%", estPayout: "$1,305", capUsage: "8.7%" },
];

const settlements = [
  { week: "Apr 7-13, 2026", group: "Alpha Pool", opening: 250000, closing: 265500, pnl: 15500, status: "Approved" },
  { week: "Mar 31 - Apr 6", group: "Alpha Pool", opening: 242000, closing: 250000, pnl: 8000, status: "Locked" },
  { week: "Apr 7-13, 2026", group: "Beta Pool", opening: 150000, closing: 156525, pnl: 6525, status: "Draft" },
];

export default function AlgoInvestorsPage() {
  const [tab, setTab] = useState<InvTab>("overview");
  const tabs: { id: InvTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "groups", label: "Groups" },
    { id: "investors", label: "Investors" },
    { id: "settlements", label: "Settlements" },
    { id: "trades", label: "Live Trades" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Algo Investors</h1>
        <p className="text-sm text-muted mt-1">Investor dashboard and pool management for Algo Trading 2.0</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-4 py-2 rounded-xl text-xs font-medium transition-smooth",
              tab === t.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{t.label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Total AUM</div><div className="text-xl font-bold">$400,000</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Active Groups</div><div className="text-xl font-bold">2</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Total Investors</div><div className="text-xl font-bold">7</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Weekly P&L</div><div className="text-xl font-bold text-bull-light">+$22,025</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Pending Settlements</div><div className="text-xl font-bold text-warn">1</div></div>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            {groups.map((g) => (
              <div key={g.id} className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold">{g.name}</h3>
                  <span className="badge-bull text-xs">{g.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div><span className="text-muted">Bot</span><div className="text-foreground text-[11px]">{g.bot}</div></div>
                  <div><span className="text-muted">Investors</span><div className="text-foreground">{g.investors}</div></div>
                  <div><span className="text-muted">Pool Size</span><div className="text-foreground">${g.pool.toLocaleString()}</div></div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted">Growth</span>
                  <span className="text-sm font-bold text-bull-light">{g.growth}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "groups" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium">+ Create Group</button></div>
          {groups.map((g) => (
            <div key={g.id} className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">{g.name}</h3>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded-lg text-xs bg-surface-2 text-muted-light border border-border/50">Edit</button>
                  <button className="px-3 py-1.5 rounded-lg text-xs bg-surface-2 text-muted-light border border-border/50">Assign Bot</button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div><span className="text-xs text-muted block">Assigned Bot</span>{g.bot}</div>
                <div><span className="text-xs text-muted block">Investors</span>{g.investors}</div>
                <div><span className="text-xs text-muted block">Pool Size</span>${g.pool.toLocaleString()}</div>
                <div><span className="text-xs text-muted block">Growth</span><span className="text-bull-light font-bold">{g.growth}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "investors" && (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-border/50">
              <th className="text-left text-xs text-muted font-medium px-4 py-3">Investor</th>
              <th className="text-left text-xs text-muted font-medium px-3 py-3">Group</th>
              <th className="text-left text-xs text-muted font-medium px-3 py-3">Deposit</th>
              <th className="text-left text-xs text-muted font-medium px-3 py-3">Ownership</th>
              <th className="text-left text-xs text-muted font-medium px-3 py-3">Est. Payout</th>
              <th className="text-left text-xs text-muted font-medium px-3 py-3">Cap Usage</th>
            </tr></thead>
            <tbody>
              {investors.map((inv, i) => (
                <tr key={i} className="border-b border-border/20 hover:bg-surface-2/50">
                  <td className="px-4 py-3 text-sm font-medium">{inv.name}</td>
                  <td className="px-3 py-3 text-xs text-muted-light">{inv.group}</td>
                  <td className="px-3 py-3 text-sm font-mono">${inv.deposit.toLocaleString()}</td>
                  <td className="px-3 py-3 text-sm text-accent-light">{inv.ownership}</td>
                  <td className="px-3 py-3 text-sm font-mono text-bull-light">{inv.estPayout}</td>
                  <td className="px-3 py-3 text-xs text-muted">{inv.capUsage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settlements" && (
        <div className="space-y-4">
          {settlements.map((s, i) => (
            <div key={i} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div><h3 className="text-sm font-bold">{s.group}</h3><span className="text-xs text-muted">{s.week}</span></div>
                <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full",
                  s.status === "Approved" ? "badge-bull" : s.status === "Locked" ? "bg-surface-3 text-muted-light border border-border rounded-full px-2.5 py-1 text-xs" : "bg-warn/10 text-warn border border-warn/20 rounded-full px-2.5 py-1 text-xs")}>{s.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-xs text-muted block">Opening Capital</span>${s.opening.toLocaleString()}</div>
                <div><span className="text-xs text-muted block">Closing Capital</span>${s.closing.toLocaleString()}</div>
                <div><span className="text-xs text-muted block">P&L</span><span className={s.pnl >= 0 ? "text-bull-light" : "text-bear-light"}>+${s.pnl.toLocaleString()}</span></div>
              </div>
              {s.status === "Draft" && (
                <div className="mt-3 flex gap-2">
                  <button className="px-4 py-2 rounded-lg text-xs bg-accent text-white">Approve</button>
                  <button className="px-4 py-2 rounded-lg text-xs bg-surface-2 text-muted-light border border-border/50">Review Details</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "trades" && (
        <div className="glass-card p-12 text-center"><p className="text-muted">Live bot trading activity synced from Algo Trading 2.0</p></div>
      )}
    </div>
  );
}
