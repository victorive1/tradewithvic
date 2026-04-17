"use client";

import { cn } from "@/lib/utils";

const events = [
  { time: "08:30", country: "US", event: "CPI (YoY)", impact: "high", forecast: "2.8%", previous: "2.9%", actual: null, affectedMarkets: ["USD pairs", "Gold", "NAS100", "US30"], riskNote: "Expected volatility: HIGH. Dollar may strengthen if above forecast." },
  { time: "10:00", country: "US", event: "Consumer Confidence", impact: "medium", forecast: "102.5", previous: "104.1", actual: null, affectedMarkets: ["USD pairs", "Indices"], riskNote: "Moderate impact. Watch for deviation from forecast." },
  { time: "13:00", country: "UK", event: "BOE Interest Rate", impact: "high", forecast: "4.50%", previous: "4.50%", actual: null, affectedMarkets: ["GBP pairs", "FTSE"], riskNote: "Expected volatility: HIGH. Hold unchanged expected — statement is key." },
  { time: "14:30", country: "EU", event: "ECB Speech - Lagarde", impact: "medium", forecast: "—", previous: "—", actual: null, affectedMarkets: ["EUR pairs"], riskNote: "Watch for hawkish/dovish tone shift." },
  { time: "15:00", country: "US", event: "Existing Home Sales", impact: "low", forecast: "4.15M", previous: "4.08M", actual: null, affectedMarkets: ["USD"], riskNote: "Low impact unless significant deviation." },
  { time: "Tomorrow", country: "US", event: "Non-Farm Payrolls", impact: "high", forecast: "180K", previous: "228K", actual: null, affectedMarkets: ["All markets"], riskNote: "EXTREME volatility expected. Consider reducing exposure beforehand." },
];

const impactColors: Record<string, string> = {
  high: "bg-bear text-white",
  medium: "bg-warn text-black",
  low: "bg-surface-3 text-muted-light",
};

function EventRiskMeter() {
  const highImpactSoon = events.filter((e) => e.impact === "high" && e.time !== "Tomorrow").length;
  const riskLevel = highImpactSoon >= 2 ? "Extreme" : highImpactSoon === 1 ? "High" : "Moderate";
  const riskColor = riskLevel === "Extreme" ? "text-bear-light" : riskLevel === "High" ? "text-warn" : "text-bull-light";

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold mb-3">Event Risk Meter</h3>
      <div className={cn("text-3xl font-black mb-2", riskColor)}>{riskLevel}</div>
      <p className="text-xs text-muted">{highImpactSoon} high-impact events approaching today</p>
      <div className="mt-3 h-2 rounded-full bg-surface-3 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", riskLevel === "Extreme" ? "bg-bear w-full" : riskLevel === "High" ? "bg-warn w-2/3" : "bg-bull w-1/3")} />
      </div>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Economic Calendar Intelligence</h1>
        <p className="text-sm text-muted mt-1">Not just events — impact analysis, volatility expectations, and directional bias</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Upcoming Events</h2>
          {events.map((event, i) => (
            <div key={i} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-light bg-surface-2 px-2 py-1 rounded">{event.time}</span>
                  <span className="text-xs text-muted bg-surface-2 px-2 py-1 rounded">{event.country}</span>
                  <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded", impactColors[event.impact])}>
                    {event.impact}
                  </span>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{event.event}</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center bg-surface-2 rounded-lg py-2">
                  <div className="text-[10px] text-muted">Forecast</div>
                  <div className="text-sm font-bold">{event.forecast}</div>
                </div>
                <div className="text-center bg-surface-2 rounded-lg py-2">
                  <div className="text-[10px] text-muted">Previous</div>
                  <div className="text-sm font-bold">{event.previous}</div>
                </div>
                <div className="text-center bg-surface-2 rounded-lg py-2">
                  <div className="text-[10px] text-muted">Actual</div>
                  <div className="text-sm font-bold text-muted">{event.actual || "—"}</div>
                </div>
              </div>
              <p className="text-xs text-muted leading-relaxed mb-2">{event.riskNote}</p>
              <div className="flex flex-wrap gap-1.5">
                {event.affectedMarkets.map((m) => (
                  <span key={m} className="text-[10px] bg-accent/10 text-accent-light px-2 py-0.5 rounded-full border border-accent/20">{m}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <EventRiskMeter />
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Today&apos;s Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted">High Impact</span><span className="text-bear-light font-bold">2 events</span></div>
              <div className="flex justify-between"><span className="text-muted">Medium Impact</span><span className="text-warn font-bold">2 events</span></div>
              <div className="flex justify-between"><span className="text-muted">Low Impact</span><span className="text-muted-light">1 event</span></div>
              <div className="pt-2 border-t border-border/30 flex justify-between"><span className="text-muted">Most Affected</span><span className="text-foreground font-medium">USD, GBP</span></div>
            </div>
          </div>
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Trading Tip</h3>
            <p className="text-xs text-muted leading-relaxed">Avoid opening new positions 30 minutes before high-impact events. Spreads widen and volatility becomes unpredictable. Wait for the initial reaction to settle before looking for setups.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
