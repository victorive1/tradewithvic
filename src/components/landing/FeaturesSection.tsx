"use client";

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "Market Radar",
    description: "See the full market picture instantly. Strongest currencies, biggest movers, top setups, and macro events — all in one clean view.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    title: "Trade Setups",
    description: "Curated, high-quality trade ideas with entry, stop, target, risk/reward, and confidence scores. Like premium sports picks, but for trading.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    title: "Liquidity Intelligence",
    description: "Understand where stop clusters sit, where smart money hunts liquidity, and where price is likely to sweep next.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
    title: "Macro + Sentiment",
    description: "Central bank bias, economic calendar intelligence, currency strength, and real-time sentiment across all major markets.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative section-py">
      <div className="page-container">
        <div className="text-center mb-10 sm:mb-14 lg:mb-16 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-2/60 border border-border text-fluid-xs text-muted mb-4">
            <span className="w-1 h-1 rounded-full bg-accent-light" />
            <span className="font-semibold tracking-wider uppercase">Capabilities</span>
          </div>
          <h2 className="font-display text-fluid-4xl font-bold mb-4">
            Everything a{" "}
            <span className="gradient-text-accent">serious trader</span> needs
          </h2>
          <p className="text-muted-light text-fluid-lg">
            Clean, digestible market intelligence. Not chart noise.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="glass-card glass-card-hover p-6 group"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent-light mb-4 group-hover:bg-accent/20 transition-smooth">
                {feature.icon}
              </div>
              <h3 className="text-fluid-xl font-semibold mb-2 text-foreground">
                {feature.title}
              </h3>
              <p className="text-fluid-sm text-muted">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
