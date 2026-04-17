"use client";

export function DashboardPreview() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="orb w-[600px] h-[600px] bg-accent/10 top-0 left-1/2 -translate-x-1/2" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Your Market <span className="gradient-text-accent">Command Center</span>
          </h2>
          <p className="text-muted-light text-lg max-w-2xl mx-auto">
            Powerful, organized, and easy to use. Everything you need to make
            better trading decisions.
          </p>
        </div>

        {/* Mock Dashboard */}
        <div className="glass-card p-6 sm:p-8 glow-accent max-w-5xl mx-auto">
          <div className="grid grid-cols-12 gap-4">
            {/* Top bar */}
            <div className="col-span-12 flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-bull pulse-live" />
                <span className="text-sm font-medium text-foreground">Market Radar</span>
                <span className="text-xs text-muted">Live</span>
              </div>
              <div className="flex gap-2">
                {["All", "Forex", "Metals", "Indices", "Crypto"].map((tab) => (
                  <span
                    key={tab}
                    className={`text-xs px-3 py-1 rounded-lg ${
                      tab === "All"
                        ? "bg-accent/20 text-accent-light"
                        : "text-muted hover:text-muted-light"
                    }`}
                  >
                    {tab}
                  </span>
                ))}
              </div>
            </div>

            {/* Setup cards row */}
            {[
              { pair: "XAU/USD", dir: "Bullish", score: 87, grade: "A+", price: "3,284.50" },
              { pair: "GBP/JPY", dir: "Bearish", score: 79, grade: "A", price: "191.42" },
              { pair: "NAS100", dir: "Bullish", score: 74, grade: "B+", price: "19,432.1" },
              { pair: "EUR/USD", dir: "Bearish", score: 68, grade: "B", price: "1.0842" },
            ].map((setup) => (
              <div
                key={setup.pair}
                className="col-span-6 lg:col-span-3 bg-surface-2 rounded-xl p-4 border border-border/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{setup.pair}</span>
                  <span
                    className={`text-xs font-medium ${
                      setup.dir === "Bullish" ? "text-bull-light" : "text-bear-light"
                    }`}
                  >
                    {setup.dir}
                  </span>
                </div>
                <div className="text-xl font-bold mb-2">{setup.price}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Score: {setup.score}</span>
                  <span
                    className={`text-xs font-bold ${
                      setup.grade.startsWith("A") ? "text-bull-light" : "text-warn"
                    }`}
                  >
                    {setup.grade}
                  </span>
                </div>
              </div>
            ))}

            {/* Bottom panels */}
            <div className="col-span-12 lg:col-span-8 bg-surface-2 rounded-xl p-4 border border-border/50 mt-2">
              <div className="text-sm font-medium mb-3">Currency Strength</div>
              <div className="space-y-2">
                {[
                  { cur: "USD", val: 84, w: "84%" },
                  { cur: "GBP", val: 71, w: "71%" },
                  { cur: "EUR", val: 62, w: "62%" },
                  { cur: "JPY", val: 38, w: "38%" },
                ].map((c) => (
                  <div key={c.cur} className="flex items-center gap-3">
                    <span className="text-xs text-muted w-8">{c.cur}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light"
                        style={{ width: c.w }}
                      />
                    </div>
                    <span className="text-xs text-muted-light w-8">{c.val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-12 lg:col-span-4 bg-surface-2 rounded-xl p-4 border border-border/50 mt-2">
              <div className="text-sm font-medium mb-3">Sharp Money</div>
              <div className="space-y-3">
                {[
                  { pair: "XAU/USD", score: 81, dir: "Bullish" },
                  { pair: "NAS100", score: 74, dir: "Bullish" },
                  { pair: "EUR/USD", score: 66, dir: "Bearish" },
                ].map((s) => (
                  <div key={s.pair} className="flex items-center justify-between">
                    <span className="text-xs text-muted-light">{s.pair}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-accent-light">{s.score}</span>
                      <span
                        className={`text-xs ${
                          s.dir === "Bullish" ? "text-bull-light" : "text-bear-light"
                        }`}
                      >
                        {s.dir}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
