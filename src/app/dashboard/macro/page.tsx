"use client";

import { cn } from "@/lib/utils";

const macroData = [
  { country: "United States", flag: "US", strength: "Strong", score: 82, gdp: "+2.8%", inflation: "2.9%", employment: "Strong", rateOutlook: "Hold", sentiment: "Risk-on" },
  { country: "Eurozone", flag: "EU", strength: "Weak", score: 42, gdp: "+0.4%", inflation: "2.4%", employment: "Mixed", rateOutlook: "Cut", sentiment: "Cautious" },
  { country: "United Kingdom", flag: "UK", strength: "Moderate", score: 55, gdp: "+0.6%", inflation: "3.2%", employment: "Weakening", rateOutlook: "Hold", sentiment: "Neutral" },
  { country: "Japan", flag: "JP", strength: "Weak", score: 38, gdp: "+0.2%", inflation: "2.8%", employment: "Stable", rateOutlook: "Hike (slow)", sentiment: "Dovish tilt" },
  { country: "Canada", flag: "CA", strength: "Moderate", score: 52, gdp: "+1.2%", inflation: "2.7%", employment: "Mixed", rateOutlook: "Cut", sentiment: "Neutral" },
  { country: "Australia", flag: "AU", strength: "Moderate", score: 58, gdp: "+1.5%", inflation: "3.4%", employment: "Strong", rateOutlook: "Hold", sentiment: "Neutral" },
  { country: "New Zealand", flag: "NZ", strength: "Weak", score: 40, gdp: "+0.3%", inflation: "2.2%", employment: "Weakening", rateOutlook: "Cut", sentiment: "Dovish" },
  { country: "Switzerland", flag: "CH", strength: "Strong", score: 70, gdp: "+1.8%", inflation: "1.1%", employment: "Strong", rateOutlook: "Hold", sentiment: "Safe haven" },
];

export default function MacroPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Macro Heatmap</h1>
        <p className="text-sm text-muted mt-1">Global economic pressure across major economies</p>
      </div>

      {/* Heatmap grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {macroData.map((country) => {
          const color = country.score >= 70 ? "border-bull/30" : country.score >= 50 ? "border-accent/30" : "border-bear/30";
          const textColor = country.score >= 70 ? "text-bull-light" : country.score >= 50 ? "text-accent-light" : "text-bear-light";
          return (
            <div key={country.flag} className={cn("glass-card p-5 border-l-4", color)}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs text-muted">{country.flag}</span>
                  <h3 className="text-sm font-bold text-foreground">{country.country}</h3>
                </div>
                <span className={cn("text-lg font-black", textColor)}>{country.score}</span>
              </div>
              <div className={cn("text-xs font-bold mb-3", textColor)}>{country.strength}</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted">GDP</span><span className="text-foreground">{country.gdp}</span></div>
                <div className="flex justify-between"><span className="text-muted">Inflation</span><span className="text-foreground">{country.inflation}</span></div>
                <div className="flex justify-between"><span className="text-muted">Employment</span><span className="text-foreground">{country.employment}</span></div>
                <div className="flex justify-between"><span className="text-muted">Rate Outlook</span><span className={textColor}>{country.rateOutlook}</span></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold mb-3">Global Summary</h3>
        <p className="text-xs text-muted leading-relaxed">
          The US economy remains the strongest major economy with robust employment and growth above trend. This supports USD strength. The Eurozone and Japan show persistent weakness, favoring short positions on EUR and JPY against USD. Risk sentiment is currently tilted positive, supporting equity indices and risk currencies.
        </p>
      </div>
    </div>
  );
}
