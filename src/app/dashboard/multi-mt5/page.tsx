"use client";


export default function MultiMT5Page() {
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
      </div>

      {/* Empty State */}
      <div className="glass-card p-12 text-center space-y-4">
        <div className="text-4xl mb-2">&#128279;</div>
        <h3 className="text-lg font-semibold text-foreground">No MetaTrader accounts connected yet</h3>
        <p className="text-sm text-muted max-w-md mx-auto">
          Connect your MT4/MT5 accounts to monitor all of them from one dashboard.
        </p>
        <button className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-smooth glow-accent">
          Add Account
        </button>
      </div>

      {/* Global Kill Switch */}
      <div className="glass-card p-6 text-center space-y-3 opacity-50">
        <h3 className="text-sm font-semibold text-foreground">Emergency Controls</h3>
        <button disabled className="px-8 py-3 rounded-xl bg-surface-3 text-muted text-sm font-bold cursor-not-allowed">
          Emergency: Close All Positions Across All Accounts
        </button>
        <p className="text-xs text-muted">
          Available when accounts are connected.
        </p>
      </div>
    </div>
  );
}
