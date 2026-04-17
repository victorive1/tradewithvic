"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type InvTab = "overview" | "groups" | "investors" | "settlements" | "trades";

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
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-foreground">Algo Investors</h1>
        </div>
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
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Total AUM</div><div className="text-xl font-bold">$0.00</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Active Groups</div><div className="text-xl font-bold">0</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Total Investors</div><div className="text-xl font-bold">0</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Weekly P&L</div><div className="text-xl font-bold">$0.00</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Pending Settlements</div><div className="text-xl font-bold">0</div></div>
          </div>
          <div className="glass-card p-12 text-center space-y-3">
            <div className="text-4xl mb-2">&#128188;</div>
            <h3 className="text-base font-semibold text-foreground">No investment groups configured yet</h3>
            <p className="text-sm text-muted max-w-md mx-auto">
              Create a group and assign a bot to get started.
            </p>
          </div>
        </div>
      )}

      {tab === "groups" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium">+ Create Group</button></div>
          <div className="glass-card p-12 text-center space-y-3">
            <div className="text-4xl mb-2">&#128101;</div>
            <h3 className="text-base font-semibold text-foreground">No groups created yet</h3>
            <p className="text-sm text-muted max-w-md mx-auto">
              Create a group to organize investors and assign a trading bot.
            </p>
          </div>
        </div>
      )}

      {tab === "investors" && (
        <div className="glass-card p-12 text-center space-y-3">
          <div className="text-4xl mb-2">&#128100;</div>
          <h3 className="text-base font-semibold text-foreground">No investors added yet</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            Add investors to a group to track their deposits, ownership, and payouts.
          </p>
        </div>
      )}

      {tab === "settlements" && (
        <div className="glass-card p-12 text-center space-y-3">
          <div className="text-4xl mb-2">&#128196;</div>
          <h3 className="text-base font-semibold text-foreground">No settlements to display</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            Settlements will appear here once groups are active and generating P&L.
          </p>
        </div>
      )}

      {tab === "trades" && (
        <div className="glass-card p-12 text-center"><p className="text-muted">Live bot trading activity synced from Algo Trading 2.0</p></div>
      )}
    </div>
  );
}
