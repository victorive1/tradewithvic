"use client";

const markets = [
  { category: "Forex", instruments: ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD"] },
  { category: "Metals", instruments: ["XAU/USD", "XAG/USD"] },
  { category: "Energy", instruments: ["US Oil"] },
  { category: "Indices", instruments: ["NAS100", "US30", "S&P 500"] },
  { category: "Crypto", instruments: ["BTC/USD", "ETH/USD", "SOL/USD"] },
];

export function MarketStrip() {
  return (
    <section className="relative py-16 border-y border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-muted mb-8 uppercase tracking-widest">
          Multi-Market Coverage
        </p>
        <div className="flex flex-wrap justify-center gap-x-12 gap-y-6">
          {markets.map((market) => (
            <div key={market.category} className="text-center">
              <p className="text-xs text-accent-light font-medium mb-2">{market.category}</p>
              <div className="flex gap-3">
                {market.instruments.map((inst) => (
                  <span
                    key={inst}
                    className="text-sm text-muted-light bg-surface-2 px-3 py-1.5 rounded-lg border border-border/50"
                  >
                    {inst}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
