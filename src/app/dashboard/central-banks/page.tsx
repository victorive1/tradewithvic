"use client";

import { cn } from "@/lib/utils";

const centralBanks = [
  { name: "Federal Reserve", code: "FED", rate: "5.25%", bias: "Hawkish", outlook: "Hold", nextMeeting: "May 7, 2026", impact: "USD bullish bias. Higher for longer narrative. Watching labor market for pivot signals.", color: "bull" },
  { name: "European Central Bank", code: "ECB", rate: "3.50%", bias: "Dovish", outlook: "Cut expected", nextMeeting: "Apr 30, 2026", impact: "EUR bearish pressure. Rate differential widening against USD. Growth concerns mounting.", color: "bear" },
  { name: "Bank of England", code: "BOE", rate: "4.50%", bias: "Neutral", outlook: "Hold", nextMeeting: "May 8, 2026", impact: "GBP range-bound. Inflation still sticky but growth weakening. Split vote expected.", color: "neutral" },
  { name: "Bank of Japan", code: "BOJ", rate: "0.50%", bias: "Hawkish shift", outlook: "Gradual tightening", nextMeeting: "Apr 25, 2026", impact: "JPY strengthening bias. Policy normalization underway. Watch for surprise hike.", color: "bull" },
  { name: "Reserve Bank of Australia", code: "RBA", rate: "4.10%", bias: "Neutral", outlook: "Hold", nextMeeting: "May 6, 2026", impact: "AUD stable. Labor market strong but inflation declining. Data dependent.", color: "neutral" },
  { name: "Bank of Canada", code: "BOC", rate: "3.75%", bias: "Dovish", outlook: "Cut likely", nextMeeting: "Apr 30, 2026", impact: "CAD weak. Housing market pressure and slowing growth pushing cuts.", color: "bear" },
  { name: "Swiss National Bank", code: "SNB", rate: "1.25%", bias: "Neutral", outlook: "Hold", nextMeeting: "Jun 19, 2026", impact: "CHF safe-haven bid. Low inflation gives flexibility. Intervening to limit strength.", color: "neutral" },
  { name: "Reserve Bank of NZ", code: "RBNZ", rate: "3.50%", bias: "Dovish", outlook: "Cut expected", nextMeeting: "May 14, 2026", impact: "NZD bearish. Aggressive easing cycle underway. Growth recession risk.", color: "bear" },
];

export default function CentralBanksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Central Bank Tracker</h1>
        <p className="text-sm text-muted mt-1">Track central bank policy bias, rate outlook, and market impact</p>
        <p className="text-xs text-muted mb-4">Central bank analysis — updated after policy decisions</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {centralBanks.map((bank) => (
          <div key={bank.code} className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">{bank.name}</h3>
                <span className="text-xs text-muted">{bank.code}</span>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-foreground">{bank.rate}</div>
                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
                  bank.color === "bull" ? "badge-bull" : bank.color === "bear" ? "badge-bear" : "badge-neutral")}>
                  {bank.bias}
                </span>
              </div>
            </div>
            <div className="space-y-2 text-xs mb-3">
              <div className="flex justify-between"><span className="text-muted">Rate Outlook</span><span className={cn("font-medium", bank.color === "bull" ? "text-bull-light" : bank.color === "bear" ? "text-bear-light" : "text-muted-light")}>{bank.outlook}</span></div>
              <div className="flex justify-between"><span className="text-muted">Next Meeting</span><span className="text-foreground">{bank.nextMeeting}</span></div>
            </div>
            <div className="bg-surface-2 rounded-lg p-3">
              <p className="text-xs text-muted leading-relaxed">{bank.impact}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
