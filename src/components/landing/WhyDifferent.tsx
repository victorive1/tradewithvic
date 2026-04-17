"use client";

const points = [
  "Real-time market intelligence, not delayed indicators",
  "Clean, digestible insights instead of chart clutter",
  "Multi-market coverage: Forex, Metals, Oil, Indices, Crypto",
  "Confidence-driven setups with transparent scoring",
  "Liquidity maps and institutional flow tracking",
  "Beginner-friendly, yet deep enough for advanced traders",
];

export function WhyDifferent() {
  return (
    <section className="relative py-24 bg-surface/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              Why It Feels{" "}
              <span className="gradient-text-accent">Different</span>
            </h2>
            <p className="text-muted-light text-lg mb-8 leading-relaxed">
              Most trading platforms overwhelm you with charts and noise.
              TradeWithVic turns complex market activity into clean, actionable
              intelligence you can act on in seconds.
            </p>
            <div className="space-y-4">
              {points.map((point) => (
                <div key={point} className="flex items-start gap-3">
                  <div className="mt-1 w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-3 h-3 text-accent-light"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <span className="text-sm text-muted-light">{point}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual side */}
          <div className="glass-card p-8">
            <div className="text-center mb-6">
              <div className="text-5xl font-black gradient-text-accent">30+</div>
              <div className="text-sm text-muted mt-1">Trading Intelligence Modules</div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-surface-2 rounded-xl p-4 border border-border/50">
                <div className="text-2xl font-bold text-foreground">22+</div>
                <div className="text-xs text-muted">Instruments</div>
              </div>
              <div className="bg-surface-2 rounded-xl p-4 border border-border/50">
                <div className="text-2xl font-bold text-foreground">5</div>
                <div className="text-xs text-muted">Market Types</div>
              </div>
              <div className="bg-surface-2 rounded-xl p-4 border border-border/50">
                <div className="text-2xl font-bold text-foreground">24/7</div>
                <div className="text-xs text-muted">Market Scanning</div>
              </div>
              <div className="bg-surface-2 rounded-xl p-4 border border-border/50">
                <div className="text-2xl font-bold text-foreground">A+</div>
                <div className="text-xs text-muted">Setup Quality</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
