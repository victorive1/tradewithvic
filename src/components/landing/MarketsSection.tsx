"use client";

import { useState } from "react";

const marketData = {
  Forex: {
    features: ["Currency Strength Meter", "Central Bank Bias", "Macro Calendar", "Pair Analysis"],
    description: "Deep forex intelligence across all major and cross pairs with institutional-grade analysis.",
  },
  Metals: {
    features: ["Gold & Silver Insights", "USD Pressure Analysis", "Yield Sensitivity", "Volatility Regime"],
    description: "Understand gold and silver through the lens of macro, yields, and institutional flows.",
  },
  Indices: {
    features: ["NAS100 / US30 Momentum", "Risk Sentiment", "Session Behavior", "Market Structure"],
    description: "Track global equity indices with real-time momentum, structure, and session analysis.",
  },
  Crypto: {
    features: ["BTC / ETH Analytics", "Liquidation Zones", "Volatility Pulse", "Sentiment Tracking"],
    description: "Crypto market intelligence with liquidation data, volatility regimes, and sentiment analysis.",
  },
  Energy: {
    features: ["Supply/Demand Tone", "USD Relationship", "Geopolitical Sensitivity", "Volatility Regime"],
    description: "US Oil analysis with macro context, supply dynamics, and cross-market relationships.",
  },
};

type MarketKey = keyof typeof marketData;

export function MarketsSection() {
  const [active, setActive] = useState<MarketKey>("Forex");

  return (
    <section id="markets" className="relative py-24 bg-surface/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            <span className="gradient-text-accent">Every Market.</span> One Platform.
          </h2>
          <p className="text-muted-light text-lg max-w-2xl mx-auto">
            Market-specific intelligence tailored to how each asset class actually behaves.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {(Object.keys(marketData) as MarketKey[]).map((market) => (
            <button
              key={market}
              onClick={() => setActive(market)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-smooth ${
                active === market
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-muted-light border border-border/50 hover:border-border-light"
              }`}
            >
              {market}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="glass-card p-8 max-w-3xl mx-auto text-center">
          <p className="text-muted-light mb-6">{marketData[active].description}</p>
          <div className="grid grid-cols-2 gap-4">
            {marketData[active].features.map((feat) => (
              <div
                key={feat}
                className="bg-surface-2 rounded-xl px-4 py-3 border border-border/50 text-sm text-foreground"
              >
                {feat}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
