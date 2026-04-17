"use client";

const steps = [
  {
    num: "01",
    title: "Scan the Market",
    description: "See which markets are trending, which currencies are strongest, and where the best opportunities are forming.",
  },
  {
    num: "02",
    title: "Find the Cleanest Setup",
    description: "Browse high-quality trade setups ranked by confidence, with clear entry, stop, and target levels.",
  },
  {
    num: "03",
    title: "Understand the Risk",
    description: "Review liquidity zones, event risk, sentiment, and macro context before making any decision.",
  },
  {
    num: "04",
    title: "Execute with Confidence",
    description: "Take action knowing you have the full market picture behind every trade idea.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            How <span className="gradient-text-accent">It Works</span>
          </h2>
          <p className="text-muted-light text-lg">
            From market scan to confident execution in four steps.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div key={step.num} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-border to-transparent z-0" />
              )}
              <div className="relative">
                <div className="text-4xl font-black text-accent/20 mb-4">
                  {step.num}
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">
                  {step.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
