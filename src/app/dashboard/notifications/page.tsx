export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        <p className="text-sm text-muted mt-1">
          Recent system messages, trade confirmations, and alert history.
        </p>
      </div>
      <div className="glass-card p-12 text-center space-y-3">
        <div className="text-4xl">🔔</div>
        <h2 className="text-lg font-semibold text-foreground">Coming soon</h2>
        <p className="text-sm text-muted max-w-md mx-auto">
          The notifications inbox is being built. It will consolidate Alerts,
          execution confirmations, and Brain signals into one feed.
        </p>
      </div>
    </div>
  );
}
