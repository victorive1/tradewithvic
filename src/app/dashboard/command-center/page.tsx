export default function CommandCenterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Command Center</h1>
        <p className="text-sm text-muted mt-1">
          Your unified workspace for monitoring markets, brain signals, and trading
          activity at a glance.
        </p>
      </div>
      <div className="glass-card p-12 text-center space-y-3">
        <div className="text-4xl">🎛️</div>
        <h2 className="text-lg font-semibold text-foreground">Coming soon</h2>
        <p className="text-sm text-muted max-w-md mx-auto">
          The Command Center is being assembled. It will combine live market pulse,
          Brain Execution queue, and your open MT5 accounts into one screen.
        </p>
      </div>
    </div>
  );
}
