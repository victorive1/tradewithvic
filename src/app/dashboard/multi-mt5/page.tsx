"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface DemoAccount {
  id: string;
  alias: string;
  broker: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  openTrades: number;
  dayPnl: number;
  connected: boolean;
}

const demoAccounts: DemoAccount[] = [
  {
    id: "1",
    alias: "ICMarkets Demo",
    broker: "IC Markets",
    server: "ICMarketsSC-Demo",
    balance: 10000.0,
    equity: 10234.5,
    margin: 312.4,
    openTrades: 3,
    dayPnl: 234.5,
    connected: true,
  },
  {
    id: "2",
    alias: "Pepperstone Live",
    broker: "Pepperstone",
    server: "Pepperstone-Edge04",
    balance: 25000.0,
    equity: 24812.3,
    margin: 1250.0,
    openTrades: 5,
    dayPnl: -187.7,
    connected: true,
  },
  {
    id: "3",
    alias: "FTMO Challenge",
    broker: "FTMO",
    server: "FTMO-Server3",
    balance: 100000.0,
    equity: 100450.0,
    margin: 2100.0,
    openTrades: 2,
    dayPnl: 450.0,
    connected: false,
  },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function MultiMT5Page() {
  const [accounts] = useState<DemoAccount[]>(demoAccounts);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalEquity = accounts.reduce((sum, a) => sum + a.equity, 0);
  const totalFloatingPnl = totalEquity - totalBalance;
  const totalOpenTrades = accounts.reduce((sum, a) => sum + a.openTrades, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Multi MT5 Interface</h1>
          <p className="text-sm text-muted mt-1">
            Monitor and manage multiple MetaTrader 5 accounts from a single dashboard
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-accent/15 text-accent-light text-xs font-semibold">
          Demo Mode
        </span>
      </div>

      {/* Portfolio Summary */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Portfolio Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-xs text-muted mb-1">Total Balance</div>
            <div className="text-lg font-bold text-foreground">{formatCurrency(totalBalance)}</div>
          </div>
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-xs text-muted mb-1">Total Equity</div>
            <div className="text-lg font-bold text-foreground">{formatCurrency(totalEquity)}</div>
          </div>
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-xs text-muted mb-1">Total Floating P&L</div>
            <div
              className={cn(
                "text-lg font-bold",
                totalFloatingPnl >= 0 ? "text-bull-light" : "text-bear-light"
              )}
            >
              {totalFloatingPnl >= 0 ? "+" : ""}
              {formatCurrency(totalFloatingPnl)}
            </div>
          </div>
          <div className="bg-surface-2 rounded-xl p-4 text-center">
            <div className="text-xs text-muted mb-1">Total Open Trades</div>
            <div className="text-lg font-bold text-accent-light">{totalOpenTrades}</div>
          </div>
        </div>
      </div>

      {/* Account Tiles */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-4">Connected Accounts</h2>
        <div className="grid lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <div key={account.id} className="glass-card p-5 space-y-4">
              {/* Account header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">{account.alias}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {account.broker} / {account.server}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      account.connected ? "bg-bull pulse-live" : "bg-bear"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      account.connected ? "text-bull-light" : "text-bear-light"
                    )}
                  >
                    {account.connected ? "Connected" : "Disconnected"}
                  </span>
                </div>
              </div>

              {/* Account stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-2 rounded-lg p-3">
                  <div className="text-[10px] text-muted uppercase tracking-wide">Balance</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {formatCurrency(account.balance)}
                  </div>
                </div>
                <div className="bg-surface-2 rounded-lg p-3">
                  <div className="text-[10px] text-muted uppercase tracking-wide">Equity</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {formatCurrency(account.equity)}
                  </div>
                </div>
                <div className="bg-surface-2 rounded-lg p-3">
                  <div className="text-[10px] text-muted uppercase tracking-wide">Margin Used</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {formatCurrency(account.margin)}
                  </div>
                </div>
                <div className="bg-surface-2 rounded-lg p-3">
                  <div className="text-[10px] text-muted uppercase tracking-wide">Open Trades</div>
                  <div className="text-sm font-bold text-accent-light mt-0.5">
                    {account.openTrades}
                  </div>
                </div>
              </div>

              {/* Day P&L */}
              <div className="bg-surface-2 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs text-muted">Day P&L</span>
                <span
                  className={cn(
                    "text-sm font-bold",
                    account.dayPnl >= 0 ? "text-bull-light" : "text-bear-light"
                  )}
                >
                  {account.dayPnl >= 0 ? "+" : ""}
                  {formatCurrency(account.dayPnl)}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button className="flex-1 px-3 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent-light text-xs font-medium transition-smooth">
                  View Trades
                </button>
                <button className="flex-1 px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-muted-light text-xs font-medium transition-smooth border border-border/50">
                  Manage
                </button>
                <button className="flex-1 px-3 py-2 rounded-xl bg-bear/10 hover:bg-bear/20 text-bear-light text-xs font-medium transition-smooth">
                  Disconnect
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Global Kill Switch */}
      <div className="glass-card p-6 text-center space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Emergency Controls</h3>
        <button className="px-8 py-3 rounded-xl bg-bear hover:bg-bear-light text-white text-sm font-bold transition-smooth shadow-lg shadow-bear/20">
          Emergency: Close All Positions Across All Accounts
        </button>
        <p className="text-xs text-muted">
          This will attempt to close every open position on all connected accounts immediately.
        </p>
      </div>

      {/* Footer note */}
      <div className="text-center py-4">
        <p className="text-xs text-muted">
          Connect your real MT4/MT5 accounts to see live data
        </p>
      </div>
    </div>
  );
}
