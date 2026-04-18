"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type CBView = "dashboard" | "events" | "currency_bias" | "shifts";
type Stance = "hawkish" | "neutral" | "dovish" | "shifting";

interface CentralBank {
  code: string;
  name: string;
  currency: string;
  rate: string;
  rateChange: string;
  stance: Stance;
  stancePrior: Stance;
  stanceShift: boolean;
  confidence: number;
  nextMeeting: string;
  daysToMeeting: number;
  marketExpectation: string;
  policyNote: string;
  officialStatement: string;
  marketInterpretation: string;
  currencyImpact: string;
  upcomingSpeakers: { name: string; date: string; importance: "high" | "medium" | "low" }[];
  recentSurprise: string | null;
}

const STANCE_CONFIG: Record<Stance, { label: string; color: string; badge: string }> = {
  hawkish: { label: "Hawkish", color: "text-bull-light", badge: "bg-bull/10 text-bull-light border-bull/20" },
  neutral: { label: "Neutral", color: "text-muted-light", badge: "badge-neutral" },
  dovish: { label: "Dovish", color: "text-bear-light", badge: "bg-bear/10 text-bear-light border-bear/20" },
  shifting: { label: "Shifting", color: "text-warn", badge: "bg-warn/10 text-warn border-warn/20" },
};

// Central bank data — updated analysis (not hardcoded prices)
const centralBanks: CentralBank[] = [
  {
    code: "FED", name: "Federal Reserve", currency: "USD", rate: "5.25-5.50%", rateChange: "Hold",
    stance: "hawkish", stancePrior: "hawkish", stanceShift: false, confidence: 85,
    nextMeeting: "2026-05-07", daysToMeeting: 20, marketExpectation: "Hold expected. Dot plot key.",
    policyNote: "Higher for longer narrative intact. Labor market resilience keeping cuts off the table.",
    officialStatement: "The Committee remains attentive to inflation risks and is prepared to adjust policy as appropriate.",
    marketInterpretation: "Markets see limited room for cuts in 2026. USD remains supported by rate differential advantage.",
    currencyImpact: "USD bullish bias. Rate differential favors dollar strength against most major currencies.",
    upcomingSpeakers: [{ name: "Powell", date: "2026-04-28", importance: "high" }, { name: "Waller", date: "2026-04-25", importance: "medium" }],
    recentSurprise: null,
  },
  {
    code: "ECB", name: "European Central Bank", currency: "EUR", rate: "3.50%", rateChange: "Cut expected",
    stance: "dovish", stancePrior: "neutral", stanceShift: true, confidence: 75,
    nextMeeting: "2026-04-30", daysToMeeting: 13, marketExpectation: "25bp cut priced. Forward guidance crucial.",
    policyNote: "Growth concerns mounting across the eurozone. Manufacturing contraction deepening.",
    officialStatement: "The Governing Council will continue to follow a data-dependent approach to determining the appropriate level of monetary policy.",
    marketInterpretation: "Dovish shift accelerating. Markets pricing 3-4 cuts by year end. EUR likely to weaken further.",
    currencyImpact: "EUR bearish pressure. Rate cut cycle widening differential against USD. Watch for EUR weakness on crosses.",
    upcomingSpeakers: [{ name: "Lagarde", date: "2026-04-24", importance: "high" }, { name: "Lane", date: "2026-04-23", importance: "medium" }],
    recentSurprise: "Lagarde's recent tone was more dovish than expected — triggered EUR sell-off.",
  },
  {
    code: "BOE", name: "Bank of England", currency: "GBP", rate: "4.50%", rateChange: "Hold",
    stance: "neutral", stancePrior: "neutral", stanceShift: false, confidence: 60,
    nextMeeting: "2026-05-08", daysToMeeting: 21, marketExpectation: "Hold expected. Vote split will be key.",
    policyNote: "Inflation still sticky above target but growth weakening. BOE caught between conflicting pressures.",
    officialStatement: "The Committee will continue to monitor developments closely and adjust policy to ensure inflation returns to target sustainably.",
    marketInterpretation: "Markets split on next move. Some expect cuts by summer, others see persistent hold. GBP range-bound.",
    currencyImpact: "GBP neutral to slightly bearish. Uncertainty keeping GBP in a trading range. Clearer direction after May meeting.",
    upcomingSpeakers: [{ name: "Bailey", date: "2026-04-29", importance: "high" }],
    recentSurprise: null,
  },
  {
    code: "BOJ", name: "Bank of Japan", currency: "JPY", rate: "0.50%", rateChange: "Gradual hikes",
    stance: "shifting", stancePrior: "dovish", stanceShift: true, confidence: 70,
    nextMeeting: "2026-04-25", daysToMeeting: 8, marketExpectation: "Hold likely but hawkish guidance expected.",
    policyNote: "Historic policy normalization underway. Wage growth supporting gradual tightening cycle.",
    officialStatement: "The Bank will continue to carefully assess the impact of monetary policy changes on the economy and financial markets.",
    marketInterpretation: "Biggest policy shift in decades. Markets expect slow but persistent rate hikes. JPY should strengthen over time but pace uncertain.",
    currencyImpact: "JPY strengthening bias long-term. Short-term still affected by rate differential with USD. Watch for intervention risk.",
    upcomingSpeakers: [{ name: "Ueda", date: "2026-04-25", importance: "high" }],
    recentSurprise: "BOJ signaled faster normalization than expected at last meeting — JPY jumped.",
  },
  {
    code: "RBA", name: "Reserve Bank of Australia", currency: "AUD", rate: "4.10%", rateChange: "Hold",
    stance: "neutral", stancePrior: "neutral", stanceShift: false, confidence: 65,
    nextMeeting: "2026-05-06", daysToMeeting: 19, marketExpectation: "Hold. Data dependent.",
    policyNote: "Labor market remains strong but inflation declining. RBA maintaining cautious hold stance.",
    officialStatement: "The Board will continue to rely on the data and the evolving assessment of risks.",
    marketInterpretation: "AUD relatively stable. Rate path unclear — depends on global risk sentiment and China data.",
    currencyImpact: "AUD neutral. Moves more on risk sentiment and China than domestic policy right now.",
    upcomingSpeakers: [{ name: "Bullock", date: "2026-04-28", importance: "medium" }],
    recentSurprise: null,
  },
  {
    code: "BOC", name: "Bank of Canada", currency: "CAD", rate: "3.75%", rateChange: "Cut likely",
    stance: "dovish", stancePrior: "dovish", stanceShift: false, confidence: 72,
    nextMeeting: "2026-04-30", daysToMeeting: 13, marketExpectation: "25bp cut priced. Housing data key.",
    policyNote: "Housing market stress and slowing growth pushing BOC toward more cuts.",
    officialStatement: "Governing Council continues to assess incoming data on inflation, growth, and financial conditions.",
    marketInterpretation: "Further easing cycle expected. CAD likely to remain weak against USD. Oil prices may provide some support.",
    currencyImpact: "CAD bearish bias. Cutting cycle weakening CAD. Watch oil prices for offsetting support.",
    upcomingSpeakers: [{ name: "Macklem", date: "2026-04-27", importance: "high" }],
    recentSurprise: null,
  },
  {
    code: "SNB", name: "Swiss National Bank", currency: "CHF", rate: "1.25%", rateChange: "Hold",
    stance: "neutral", stancePrior: "neutral", stanceShift: false, confidence: 68,
    nextMeeting: "2026-06-19", daysToMeeting: 63, marketExpectation: "Hold. Low inflation gives flexibility.",
    policyNote: "Switzerland's low inflation environment gives SNB flexibility. Intervening to limit CHF strength.",
    officialStatement: "The SNB remains willing to be active in the foreign exchange market as necessary.",
    marketInterpretation: "CHF remains a safe-haven currency. SNB comfortable with current rate level. FX intervention is the main policy tool.",
    currencyImpact: "CHF safe-haven bid. Tends to strengthen during risk-off episodes. SNB may intervene if appreciation is too rapid.",
    upcomingSpeakers: [],
    recentSurprise: null,
  },
  {
    code: "RBNZ", name: "Reserve Bank of New Zealand", currency: "NZD", rate: "3.50%", rateChange: "Cut expected",
    stance: "dovish", stancePrior: "dovish", stanceShift: false, confidence: 78,
    nextMeeting: "2026-05-14", daysToMeeting: 27, marketExpectation: "25-50bp cut priced.",
    policyNote: "Aggressive easing cycle underway. Growth recession risk increasing. RBNZ front-loading cuts.",
    officialStatement: "The Committee agreed that monetary conditions need to continue easing to support economic activity.",
    marketInterpretation: "NZD under persistent pressure from aggressive cutting. Most dovish major central bank. Yield disadvantage growing.",
    currencyImpact: "NZD bearish. Aggressive easing weakening NZD across the board. Weakest major currency outlook.",
    upcomingSpeakers: [{ name: "Orr", date: "2026-05-02", importance: "high" }],
    recentSurprise: "RBNZ cut 50bp when only 25bp was expected — NZD crashed.",
  },
];

export default function CentralBanksPage() {
  const [view, setView] = useState<CBView>("dashboard");
  const [expandedCB, setExpandedCB] = useState<string | null>(null);

  const shiftingBanks = centralBanks.filter((cb) => cb.stanceShift);
  const upcomingEvents = centralBanks.flatMap((cb) => [
    ...cb.upcomingSpeakers.map((s) => ({ ...s, bank: cb.code, currency: cb.currency, type: "speech" as const })),
    { name: `${cb.code} Meeting`, date: cb.nextMeeting, importance: "high" as const, bank: cb.code, currency: cb.currency, type: "meeting" as const },
  ]).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const surprises = centralBanks.filter((cb) => cb.recentSurprise);

  // Currency macro bias
  const currencyBias = centralBanks.map((cb) => ({
    currency: cb.currency,
    stance: cb.stance,
    impact: cb.currencyImpact,
    macro: cb.stance === "hawkish" ? "supportive" : cb.stance === "dovish" ? "weakening" : cb.stanceShift ? "uncertain" : "neutral",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">CB Tracker</h1>
        <p className="text-sm text-muted mt-1">Central bank policy monitoring — stance tracking, event timing, and macro currency context</p>
        <p className="text-[10px] text-muted mt-1">Central bank analysis — updated after policy decisions and major speeches</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{centralBanks.length}</div><div className="text-[10px] text-muted">Banks Tracked</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bull-light">{centralBanks.filter((cb) => cb.stance === "hawkish").length}</div><div className="text-[10px] text-muted">Hawkish</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bear-light">{centralBanks.filter((cb) => cb.stance === "dovish").length}</div><div className="text-[10px] text-muted">Dovish</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-warn">{shiftingBanks.length}</div><div className="text-[10px] text-muted">Shifting</div></div>
        <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-accent-light">{upcomingEvents.filter((e) => e.type === "meeting").filter((e) => new Date(e.date).getTime() - Date.now() < 30 * 24 * 3600000).length}</div><div className="text-[10px] text-muted">Meetings (&lt;30d)</div></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id: "dashboard" as CBView, l: "Policy Stance" },
          { id: "events" as CBView, l: `Events (${upcomingEvents.length})` },
          { id: "currency_bias" as CBView, l: "Currency Bias" },
          { id: "shifts" as CBView, l: `Shifts & Surprises (${shiftingBanks.length + surprises.length})` },
        ].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth", view === v.id ? "bg-accent text-white" : "bg-surface-2 text-muted-light border border-border/50")}>{v.l}</button>
        ))}
      </div>

      {/* POLICY STANCE VIEW */}
      {view === "dashboard" && (
        <div className="space-y-3">
          {centralBanks.map((cb) => {
            const sc = STANCE_CONFIG[cb.stance];
            const isExpanded = expandedCB === cb.code;
            return (
              <div key={cb.code} className={cn("glass-card overflow-hidden", cb.stanceShift ? "border-l-4 border-l-warn" : "")}>
                <div className="p-5 cursor-pointer" onClick={() => setExpandedCB(isExpanded ? null : cb.code)}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-surface-3 flex items-center justify-center"><span className="text-xs font-black text-foreground">{cb.code}</span></div>
                      <div>
                        <div className="text-sm font-bold">{cb.name}</div>
                        <div className="text-xs text-muted">{cb.currency}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-lg font-black text-foreground">{cb.rate}</div>
                        <div className={cn("text-[10px]", cb.rateChange.includes("Cut") ? "text-bear-light" : cb.rateChange.includes("Hike") || cb.rateChange.includes("hike") ? "text-bull-light" : "text-muted")}>{cb.rateChange}</div>
                      </div>
                      <span className={cn("text-[10px] font-medium px-2.5 py-1 rounded-full border", sc.badge)}>{sc.label}</span>
                      {cb.stanceShift && <span className="text-warn text-xs">⟲ Shift</span>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-light">{cb.policyNote}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-muted">
                    <span>Next: <span className="text-foreground">{new Date(cb.nextMeeting).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> ({cb.daysToMeeting}d)</span>
                    <span>Confidence: <span className="text-foreground">{cb.confidence}%</span></span>
                    <span>Expectation: <span className="text-foreground">{cb.marketExpectation}</span></span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-border/30 space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="bg-surface-2 rounded-xl p-4">
                        <div className="text-[10px] text-muted mb-1.5 font-medium">Official Statement</div>
                        <p className="text-xs text-muted-light leading-relaxed italic">&ldquo;{cb.officialStatement}&rdquo;</p>
                      </div>
                      <div className="bg-surface-2 rounded-xl p-4">
                        <div className="text-[10px] text-muted mb-1.5 font-medium">Market Interpretation</div>
                        <p className="text-xs text-muted-light leading-relaxed">{cb.marketInterpretation}</p>
                      </div>
                    </div>
                    <div className={cn("rounded-xl p-4 border", cb.stance === "hawkish" ? "bg-bull/5 border-bull/10" : cb.stance === "dovish" ? "bg-bear/5 border-bear/10" : "bg-surface-2 border-border/30")}>
                      <div className="text-[10px] text-muted mb-1 font-medium">Currency Impact — {cb.currency}</div>
                      <p className="text-xs text-muted-light leading-relaxed">{cb.currencyImpact}</p>
                    </div>
                    {cb.recentSurprise && (
                      <div className="bg-warn/5 border border-warn/10 rounded-xl p-4">
                        <div className="text-[10px] text-warn font-medium mb-1">⚡ Recent Surprise</div>
                        <p className="text-xs text-muted-light">{cb.recentSurprise}</p>
                      </div>
                    )}
                    {cb.upcomingSpeakers.length > 0 && (
                      <div>
                        <div className="text-[10px] text-muted font-medium mb-2">Upcoming Speakers</div>
                        <div className="flex flex-wrap gap-2">
                          {cb.upcomingSpeakers.map((s) => (
                            <div key={s.name} className="bg-surface-2 rounded-lg px-3 py-2 text-xs">
                              <span className="font-medium text-foreground">{s.name}</span>
                              <span className="text-muted ml-2">{new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                              <span className={cn("ml-2 text-[9px] font-bold uppercase", s.importance === "high" ? "text-bear-light" : s.importance === "medium" ? "text-warn" : "text-muted")}>{s.importance}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {cb.stanceShift && (
                      <div className="text-xs text-warn flex items-center gap-2">
                        <span>⟲</span>
                        <span>Stance shifted from <strong>{cb.stancePrior}</strong> to <strong>{cb.stance}</strong> — macro inflection point</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* EVENTS VIEW */}
      {view === "events" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">All upcoming central bank meetings and speeches — sorted by date</p>
          {upcomingEvents.map((evt, i) => (
            <div key={i} className={cn("glass-card p-4 flex items-center justify-between", evt.type === "meeting" ? "border-l-4 border-l-bear" : "")}>
              <div className="flex items-center gap-4">
                <div className="text-center min-w-[50px]">
                  <div className="text-xs font-bold text-foreground">{new Date(evt.date).toLocaleDateString("en-US", { month: "short" })}</div>
                  <div className="text-lg font-black text-foreground">{new Date(evt.date).getDate()}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{evt.name}</div>
                  <div className="text-xs text-muted">{evt.bank} • {evt.currency} • <span className="capitalize">{evt.type}</span></div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded", evt.importance === "high" ? "bg-bear text-white" : evt.importance === "medium" ? "bg-warn text-black" : "bg-surface-3 text-muted")}>{evt.importance}</span>
                <span className="text-xs text-muted">{Math.max(0, Math.ceil((new Date(evt.date).getTime() - Date.now()) / (24 * 3600000)))}d</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CURRENCY BIAS VIEW */}
      {view === "currency_bias" && (
        <div className="space-y-3">
          <p className="text-xs text-muted">How central bank policy affects each currency — macro pressure summary</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {currencyBias.map((cb) => {
              const bank = centralBanks.find((b) => b.currency === cb.currency)!;
              const sc = STANCE_CONFIG[cb.stance];
              return (
                <div key={cb.currency} className={cn("glass-card p-5 border-l-4", cb.macro === "supportive" ? "border-l-bull" : cb.macro === "weakening" ? "border-l-bear" : cb.macro === "uncertain" ? "border-l-warn" : "border-l-border")}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-black text-foreground">{cb.currency}</span>
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", sc.badge)}>{sc.label}</span>
                    </div>
                    <span className={cn("text-xs font-bold capitalize", cb.macro === "supportive" ? "text-bull-light" : cb.macro === "weakening" ? "text-bear-light" : cb.macro === "uncertain" ? "text-warn" : "text-muted")}>{cb.macro}</span>
                  </div>
                  <p className="text-xs text-muted-light leading-relaxed mb-2">{cb.impact}</p>
                  <div className="text-[10px] text-muted">Rate: <span className="text-foreground">{bank.rate}</span> • Next: <span className="text-foreground">{bank.daysToMeeting}d</span></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SHIFTS & SURPRISES VIEW */}
      {view === "shifts" && (
        <div className="space-y-4">
          <p className="text-xs text-muted">Central banks where policy stance has shifted or recent surprises occurred — macro inflection points</p>
          {shiftingBanks.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 text-warn">Stance Shifts</h3>
              {shiftingBanks.map((cb) => (
                <div key={cb.code} className="glass-card p-5 border-l-4 border-l-warn mb-3">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-bold">{cb.name}</span>
                    <span className="text-xs text-muted">{cb.currency}</span>
                    <span className="text-xs text-warn">⟲ {cb.stancePrior} → {cb.stance}</span>
                  </div>
                  <p className="text-xs text-muted-light mb-2">{cb.marketInterpretation}</p>
                  <p className="text-xs text-muted">{cb.currencyImpact}</p>
                </div>
              ))}
            </div>
          )}
          {surprises.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 text-accent-light">Recent Surprises</h3>
              {surprises.map((cb) => (
                <div key={cb.code} className="glass-card p-5 border-l-4 border-l-accent mb-3">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-bold">{cb.name}</span>
                    <span className="text-xs text-muted">{cb.currency}</span>
                  </div>
                  <p className="text-xs text-accent-light">⚡ {cb.recentSurprise}</p>
                </div>
              ))}
            </div>
          )}
          {shiftingBanks.length === 0 && surprises.length === 0 && (
            <div className="glass-card p-12 text-center"><p className="text-muted text-sm">No stance shifts or surprises detected. Central bank policies are relatively stable.</p></div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">How CB Tracker Works</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-xs text-muted leading-relaxed">
          <div>
            <p className="text-foreground font-medium mb-1">Policy Stance Tracking</p>
            <p>Each central bank is classified as hawkish, dovish, neutral, or shifting. The stance is derived from official statements, recent decisions, and market interpretation — both views shown separately for transparency.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Stance Shift Detection</p>
            <p>When a central bank changes direction (e.g., neutral → dovish), it&apos;s flagged as a macro inflection point. These shifts often drive multi-week currency trends.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Currency Macro Bias</p>
            <p>Each currency gets a macro pressure label: supportive (hawkish CB), weakening (dovish CB), uncertain (shifting), or neutral. This feeds into signal ranking and bot context.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Integration</p>
            <p>Signals reduce confidence when fighting strong CB bias. Bots pause around major meetings. Editor&apos;s Pick favors setups aligned with macro pressure.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
