"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Lesson {
  id: string;
  title: string;
  duration: string;
  content: string[];
  keyTakeaway: string;
  quiz?: { question: string; options: string[]; correct: number };
}

interface CourseModule {
  id: string;
  title: string;
  description: string;
  icon: string;
  lessons: Lesson[];
}

const COURSE_MODULES: CourseModule[] = [
  {
    id: "m1", title: "What is Forex?", description: "Understand the forex market, how it works, and why it matters", icon: "🌍",
    lessons: [
      { id: "l1_1", title: "The Forex Market Explained", duration: "5 min", content: [
        "Forex (foreign exchange) is the global marketplace for buying and selling currencies. It's the largest financial market in the world, with over $7 trillion traded daily.",
        "Unlike stock markets, forex operates 24 hours a day, 5 days a week across global financial centers: Sydney, Tokyo, London, and New York.",
        "Currencies are traded in pairs — for example, EUR/USD means you're buying euros and selling US dollars. The first currency is the 'base' and the second is the 'quote'.",
        "When you trade forex, you're speculating on whether one currency will strengthen or weaken against another. If you think EUR will rise against USD, you buy EUR/USD. If you think it will fall, you sell.",
      ], keyTakeaway: "Forex is the world's largest market where currencies are traded in pairs 24/5.", quiz: { question: "What does EUR/USD represent?", options: ["Buying EUR and selling USD", "Buying USD and selling EUR", "A stock ticker", "A cryptocurrency"], correct: 0 } },
      { id: "l1_2", title: "Major Currency Pairs", duration: "4 min", content: [
        "The 8 major currencies are: USD, EUR, GBP, JPY, CHF, AUD, CAD, NZD. Pairs formed between these are called 'major pairs'.",
        "Major pairs always include USD: EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, NZD/USD, USD/CAD.",
        "Cross pairs don't include USD: EUR/GBP, EUR/JPY, GBP/JPY, AUD/JPY.",
        "Major pairs have the tightest spreads and highest liquidity, making them ideal for beginners.",
      ], keyTakeaway: "There are 8 major currencies. Pairs with USD are 'majors', without USD are 'crosses'." },
      { id: "l1_3", title: "How Money is Made (and Lost)", duration: "4 min", content: [
        "You profit when your trade moves in the right direction. Buy EUR/USD at 1.0800, it rises to 1.0850 = profit. It falls to 1.0750 = loss.",
        "Profit is measured in 'pips' — the smallest price movement. For most pairs, 1 pip = 0.0001.",
        "Leverage allows you to control a large position with a small deposit, amplifying both profits AND losses.",
        "Risk management is the most important skill in forex. Without it, even good analysis leads to blown accounts.",
      ], keyTakeaway: "Profit comes from price moving in your direction. Leverage amplifies everything — including losses.", quiz: { question: "What is a pip?", options: ["A type of order", "The smallest price movement (0.0001)", "A trading strategy", "A broker fee"], correct: 1 } },
    ],
  },
  {
    id: "m2", title: "Reading Charts", description: "Learn to read candlestick charts and understand price action", icon: "📊",
    lessons: [
      { id: "l2_1", title: "Candlestick Basics", duration: "6 min", content: [
        "A candlestick shows 4 price points: Open, High, Low, Close (OHLC). The body is the area between open and close.",
        "Green/bullish candle: close is above open — buyers won that period. Red/bearish candle: close is below open — sellers won.",
        "The wicks (shadows) show the high and low — how far price extended before being rejected.",
        "Long wicks show rejection. A long lower wick means buyers pushed price back up. A long upper wick means sellers pushed it down.",
        "The body size matters: a large body = strong conviction. A small body = indecision (called a doji when very small).",
      ], keyTakeaway: "Candlesticks show open, high, low, close. Green = buyers won, red = sellers won. Wicks show rejection.", quiz: { question: "What does a long lower wick indicate?", options: ["Strong selling", "Buyers pushed price back up (rejection)", "The market is closed", "Low volume"], correct: 1 } },
      { id: "l2_2", title: "Timeframes", duration: "4 min", content: [
        "Each candlestick represents one period of time: 5-minute, 15-minute, 1-hour, 4-hour, daily, weekly.",
        "Lower timeframes (5m, 15m) show more detail and noise. Higher timeframes (4H, daily) show the bigger picture.",
        "Most professional traders use multiple timeframes: higher TF for direction, lower TF for entry.",
        "A 4H candle contains 16 fifteen-minute candles. What looks chaotic on 15m may be a clean trend on 4H.",
      ], keyTakeaway: "Use higher timeframes for direction, lower timeframes for entries. Always know the bigger picture." },
      { id: "l2_3", title: "Support & Resistance", duration: "5 min", content: [
        "Support is a price level where buying tends to prevent further decline — a floor. Resistance is where selling prevents further rise — a ceiling.",
        "These levels form because traders remember prices where significant buying or selling occurred before.",
        "The more times a level is tested and holds, the stronger it becomes. When it finally breaks, it often becomes the opposite (support becomes resistance).",
        "Key levels to watch: previous day high/low, session highs/lows, round numbers (1.0800, 1.1000), and major swing points.",
      ], keyTakeaway: "Support is a floor, resistance is a ceiling. When broken, they tend to flip roles.", quiz: { question: "When a resistance level breaks, it often becomes:", options: ["Irrelevant", "Support", "A stop loss level", "A take profit level"], correct: 1 } },
    ],
  },
  {
    id: "m3", title: "Market Structure", description: "Understand trends, ranges, and how price moves", icon: "📈",
    lessons: [
      { id: "l3_1", title: "Trend Structure", duration: "5 min", content: [
        "An uptrend makes higher highs (HH) and higher lows (HL). A downtrend makes lower highs (LH) and lower lows (LL).",
        "Trend structure tells you who is in control. HH/HL = buyers. LH/LL = sellers.",
        "A 'break of structure' (BOS) occurs when price breaks a recent swing high or low in the trend direction — confirming continuation.",
        "A 'change of character' (CHoCH) occurs when trend structure first breaks against the prevailing direction — a potential reversal signal.",
      ], keyTakeaway: "Uptrend = HH/HL, downtrend = LH/LL. BOS confirms trend, CHoCH warns of potential reversal." },
      { id: "l3_2", title: "Ranges and Consolidation", duration: "4 min", content: [
        "A range occurs when price bounces between support and resistance without making new highs or lows.",
        "Ranges represent indecision — the market is deciding its next direction. Breakouts from ranges can be powerful moves.",
        "False breakouts (fakeouts) are common — price breaks the range briefly, traps traders, then reverses back inside.",
        "Tip: avoid trading the middle of ranges. Trade at the edges (buy near support, sell near resistance) or wait for a clean breakout.",
      ], keyTakeaway: "Ranges = indecision. Trade at the edges or wait for a breakout. Watch for fakeouts." },
    ],
  },
  {
    id: "m4", title: "Risk Management", description: "The most important skill — protecting your capital", icon: "🛡️",
    lessons: [
      { id: "l4_1", title: "Why Risk Management Matters", duration: "5 min", content: [
        "The #1 reason traders fail is poor risk management — not bad analysis. You can be right 60% of the time and still lose money if your losses are bigger than your wins.",
        "Rule of thumb: never risk more than 1-2% of your account on a single trade. This means a $10,000 account should risk $100-200 per trade maximum.",
        "Your stop loss defines your risk. Before entering any trade, know exactly where your stop loss is and how much you'll lose if it gets hit.",
        "Position sizing is calculated from risk: Risk amount ÷ Stop loss distance = Position size. This keeps every trade's risk equal.",
      ], keyTakeaway: "Risk 1-2% per trade maximum. Always know your stop loss before entering. Position size is calculated from risk.", quiz: { question: "On a $10,000 account risking 1%, your max risk per trade is:", options: ["$1,000", "$100", "$10", "$500"], correct: 1 } },
      { id: "l4_2", title: "Risk-to-Reward Ratio", duration: "4 min", content: [
        "Risk-to-reward (R:R) measures how much you stand to gain versus how much you risk. A 1:2 R:R means you risk 1 to potentially gain 2.",
        "With a 1:2 R:R, you only need to win 34% of your trades to break even. With 1:3 R:R, only 25%.",
        "Never take trades below 1:1 R:R. Aim for 1:2 or better. This mathematical edge is what makes consistent profitability possible.",
        "Your take profit should be at a logical level — a key support/resistance zone, not just a random number.",
      ], keyTakeaway: "Aim for 1:2+ risk-to-reward. This means you can be wrong more than half the time and still profit." },
    ],
  },
  {
    id: "m5", title: "Trading Psychology", description: "Master your emotions and build discipline", icon: "🧠",
    lessons: [
      { id: "l5_1", title: "The Psychology of Trading", duration: "5 min", content: [
        "Fear and greed are the two emotions that destroy traders. Fear makes you exit winners too early. Greed makes you hold losers too long.",
        "Revenge trading — entering impulsive trades after a loss to 'make it back' — is one of the most destructive behaviors. Never do it.",
        "FOMO (fear of missing out) causes you to chase trades that have already moved. The best trades come when you wait patiently for your setup.",
        "The best traders are boring. They follow their plan, manage their risk, and don't let emotions drive decisions.",
      ], keyTakeaway: "Control fear and greed. Never revenge trade. The best traders follow their plan without emotion." },
    ],
  },
  {
    id: "m6", title: "Getting Started on TradeWithVic", description: "Navigate the platform and find your first setup", icon: "🚀",
    lessons: [
      { id: "l6_1", title: "Platform Tour", duration: "5 min", content: [
        "Market Radar: your main dashboard showing live prices across all markets — forex, metals, indices, and crypto.",
        "Trade Setups: curated trade ideas with entry, stop loss, take profit, confidence score, and quality grade.",
        "Currency Strength: shows which currencies are strongest and weakest — find the best pair opportunities.",
        "Intelligence Chart: full TradingView chart with real-time data for any instrument.",
        "Signal Channel: 13 strategy frameworks producing ranked trade signals.",
        "Custom Signal Builder: describe your strategy in plain English and the AI builds a scored signal engine for you.",
      ], keyTakeaway: "Start with Market Radar for overview, then explore Trade Setups and Currency Strength for opportunities." },
      { id: "l6_2", title: "Your First Analysis", duration: "4 min", content: [
        "Step 1: Check the Market Radar — see which markets are moving and which currencies are strong/weak.",
        "Step 2: Go to Currency Strength — identify the strongest vs weakest currency pair.",
        "Step 3: Check Trade Setups — look for setups on your identified pair with A+ or A grade.",
        "Step 4: Open the Intelligence Chart — study the price action, support/resistance, and structure.",
        "Step 5: Use the Risk Calculator — calculate your position size based on stop loss distance and risk %.",
        "Step 6: If everything aligns — consider the trade. If not — wait. The market will always give you another opportunity.",
      ], keyTakeaway: "Follow the 6-step process: Radar → Strength → Setups → Chart → Risk → Decision." },
    ],
  },
];

export default function FXCoursePage() {
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [activeLesson, setActiveLesson] = useState<string | null>(null);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number | null>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try { const s = localStorage.getItem("course_progress"); if (s) setCompletedLessons(JSON.parse(s)); } catch {}
  }, []);

  function completeLesson(lessonId: string) {
    if (!completedLessons.includes(lessonId)) {
      const updated = [...completedLessons, lessonId];
      setCompletedLessons(updated);
      localStorage.setItem("course_progress", JSON.stringify(updated));
    }
  }

  function submitQuiz(lessonId: string) {
    setQuizSubmitted((p) => ({ ...p, [lessonId]: true }));
    completeLesson(lessonId);
  }

  const totalLessons = COURSE_MODULES.reduce((s, m) => s + m.lessons.length, 0);
  const completedCount = completedLessons.length;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const currentLesson = activeLesson
    ? COURSE_MODULES.flatMap((m) => m.lessons).find((l) => l.id === activeLesson)
    : null;
  const currentModule = activeModule
    ? COURSE_MODULES.find((m) => m.id === activeModule)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Free FX Course</h1>
        <p className="text-sm text-muted mt-1">Learn forex trading step-by-step — from complete beginner to confident trader</p>
      </div>

      {/* Progress bar */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-foreground">Your Progress</span>
          <span className="text-sm font-bold text-accent-light">{progressPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-surface-3 overflow-hidden mb-2">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{completedCount}/{totalLessons} lessons completed</span>
          <span>{COURSE_MODULES.length} modules</span>
          {progressPct === 100 && <span className="text-bull-light font-bold">🎉 Course Complete!</span>}
        </div>
      </div>

      {/* Lesson viewer */}
      {currentLesson ? (
        <div className="space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-muted">
            <button onClick={() => { setActiveLesson(null); setActiveModule(null); }} className="hover:text-accent-light transition-smooth">All Modules</button>
            <span>›</span>
            <button onClick={() => setActiveLesson(null)} className="hover:text-accent-light transition-smooth">{currentModule?.title}</button>
            <span>›</span>
            <span className="text-foreground">{currentLesson.title}</span>
          </div>

          {/* Lesson content */}
          <div className="glass-card p-8 max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-foreground">{currentLesson.title}</h2>
              <span className="text-xs text-muted bg-surface-2 px-2 py-0.5 rounded">{currentLesson.duration}</span>
              {completedLessons.includes(currentLesson.id) && <span className="text-xs text-bull-light">✓ Completed</span>}
            </div>

            <div className="space-y-4">
              {currentLesson.content.map((paragraph, i) => (
                <p key={i} className="text-sm text-muted-light leading-relaxed">{paragraph}</p>
              ))}
            </div>

            {/* Key takeaway */}
            <div className="mt-6 bg-accent/5 border border-accent/20 rounded-xl p-4">
              <div className="text-xs text-accent-light font-bold mb-1">💡 Key Takeaway</div>
              <p className="text-sm text-foreground">{currentLesson.keyTakeaway}</p>
            </div>

            {/* Quiz */}
            {currentLesson.quiz && (
              <div className="mt-6 bg-surface-2 rounded-xl p-5">
                <div className="text-xs text-foreground font-bold mb-3">📝 Quick Quiz</div>
                <p className="text-sm text-foreground mb-3">{currentLesson.quiz.question}</p>
                <div className="space-y-2">
                  {currentLesson.quiz.options.map((opt, i) => {
                    const selected = quizAnswers[currentLesson!.id] === i;
                    const submitted = quizSubmitted[currentLesson!.id];
                    const isCorrect = i === currentLesson!.quiz!.correct;
                    return (
                      <button key={i} onClick={() => !submitted && setQuizAnswers((p) => ({ ...p, [currentLesson!.id]: i }))}
                        className={cn("w-full text-left px-4 py-2.5 rounded-xl text-sm transition-smooth border",
                          submitted && isCorrect ? "bg-bull/10 border-bull/30 text-bull-light" :
                          submitted && selected && !isCorrect ? "bg-bear/10 border-bear/30 text-bear-light" :
                          selected ? "bg-accent/10 border-accent/30 text-accent-light" :
                          "bg-surface-3 border-border/30 text-muted-light hover:border-border-light")}>
                        {opt}
                        {submitted && isCorrect && " ✓"}
                        {submitted && selected && !isCorrect && " ✗"}
                      </button>
                    );
                  })}
                </div>
                {!quizSubmitted[currentLesson.id] && quizAnswers[currentLesson.id] !== undefined && (
                  <button onClick={() => submitQuiz(currentLesson!.id)} className="mt-3 px-5 py-2 rounded-xl bg-accent text-white text-sm font-medium transition-smooth">Check Answer</button>
                )}
                {quizSubmitted[currentLesson.id] && (
                  <p className={cn("mt-3 text-sm font-medium", quizAnswers[currentLesson.id] === currentLesson.quiz.correct ? "text-bull-light" : "text-bear-light")}>
                    {quizAnswers[currentLesson.id] === currentLesson.quiz.correct ? "✓ Correct!" : `✗ Incorrect. The correct answer is: ${currentLesson.quiz.options[currentLesson.quiz.correct]}`}
                  </p>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/30">
              <button onClick={() => setActiveLesson(null)} className="px-5 py-2.5 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm transition-smooth">← Back to Module</button>
              <div className="flex gap-2">
                {!completedLessons.includes(currentLesson.id) && (
                  <button onClick={() => completeLesson(currentLesson!.id)} className="px-5 py-2.5 rounded-xl bg-bull text-white text-sm font-medium transition-smooth">Mark Complete ✓</button>
                )}
                {/* Next lesson button */}
                {(() => {
                  const allLessons = COURSE_MODULES.flatMap((m) => m.lessons);
                  const idx = allLessons.findIndex((l) => l.id === currentLesson!.id);
                  const next = allLessons[idx + 1];
                  if (next) return <button onClick={() => { completeLesson(currentLesson!.id); setActiveLesson(next.id); }} className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium transition-smooth">Next Lesson →</button>;
                  return null;
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : activeModule && currentModule ? (
        /* Module lesson list */
        <div className="space-y-4">
          <button onClick={() => setActiveModule(null)} className="text-xs text-accent-light hover:text-accent transition-smooth">← All Modules</button>
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{currentModule.icon}</span>
              <div>
                <h2 className="text-lg font-bold text-foreground">{currentModule.title}</h2>
                <p className="text-xs text-muted">{currentModule.description}</p>
              </div>
            </div>
            <div className="space-y-2">
              {currentModule.lessons.map((lesson, i) => {
                const completed = completedLessons.includes(lesson.id);
                return (
                  <button key={lesson.id} onClick={() => setActiveLesson(lesson.id)}
                    className={cn("w-full text-left p-4 rounded-xl transition-smooth border flex items-center justify-between", completed ? "bg-bull/5 border-bull/10" : "bg-surface-2 border-border/50 hover:border-border-light")}>
                    <div className="flex items-center gap-3">
                      <span className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold", completed ? "bg-bull text-white" : "bg-surface-3 text-muted")}>{completed ? "✓" : i + 1}</span>
                      <div>
                        <div className="text-sm font-medium text-foreground">{lesson.title}</div>
                        <div className="text-[10px] text-muted">{lesson.duration}{lesson.quiz ? " • Has quiz" : ""}</div>
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Module grid */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {COURSE_MODULES.map((mod) => {
            const modCompleted = mod.lessons.filter((l) => completedLessons.includes(l.id)).length;
            const modTotal = mod.lessons.length;
            const modPct = modTotal > 0 ? Math.round((modCompleted / modTotal) * 100) : 0;
            return (
              <button key={mod.id} onClick={() => setActiveModule(mod.id)}
                className="glass-card glass-card-hover p-6 text-left">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">{mod.icon}</span>
                  {modPct === 100 && <span className="text-xs text-bull-light font-bold">✓ Complete</span>}
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">{mod.title}</h3>
                <p className="text-xs text-muted mb-3">{mod.description}</p>
                <div className="flex items-center justify-between text-[10px] text-muted mb-2">
                  <span>{modTotal} lessons</span>
                  <span>{modCompleted}/{modTotal}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", modPct === 100 ? "bg-bull" : modPct > 0 ? "bg-accent" : "bg-surface-3")} style={{ width: `${modPct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Badges */}
      {progressPct > 0 && !activeLesson && !activeModule && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Your Badges</h3>
          <div className="flex flex-wrap gap-3">
            {completedCount >= 1 && <div className="bg-surface-2 rounded-xl px-4 py-3 text-center"><div className="text-2xl mb-1">📖</div><div className="text-[10px] text-foreground font-medium">First Lesson</div></div>}
            {completedCount >= 5 && <div className="bg-surface-2 rounded-xl px-4 py-3 text-center"><div className="text-2xl mb-1">⭐</div><div className="text-[10px] text-foreground font-medium">5 Lessons</div></div>}
            {completedCount >= 10 && <div className="bg-surface-2 rounded-xl px-4 py-3 text-center"><div className="text-2xl mb-1">🏆</div><div className="text-[10px] text-foreground font-medium">10 Lessons</div></div>}
            {progressPct === 100 && <div className="bg-bull/10 border border-bull/20 rounded-xl px-4 py-3 text-center"><div className="text-2xl mb-1">🎓</div><div className="text-[10px] text-bull-light font-bold">Course Graduate</div></div>}
            {Object.values(quizSubmitted).filter(Boolean).length >= 1 && <div className="bg-surface-2 rounded-xl px-4 py-3 text-center"><div className="text-2xl mb-1">🧠</div><div className="text-[10px] text-foreground font-medium">Quiz Taker</div></div>}
          </div>
        </div>
      )}
    </div>
  );
}
