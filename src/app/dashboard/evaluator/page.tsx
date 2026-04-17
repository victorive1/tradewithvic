"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface EvaluationResult {
  totalScore: number;
  grade: string;
  passFail: "PASS" | "FAIL";
  ruleAdherence: number;
  classification: string;
  confidence: string;
  overview: string;
  categories: { name: string; score: number; max: number }[];
  followedRules: string[];
  brokenRules: string[];
  strengths: string[];
  mistakes: string[];
  biggestStrength: string;
  biggestMistake: string;
  coaching: string;
  actionPlan: string[];
}

const sampleResult: EvaluationResult = {
  totalScore: 81,
  grade: "B+",
  passFail: "PASS",
  ruleAdherence: 84,
  classification: "Strong Process Day",
  confidence: "High",
  overview: "This was a mostly disciplined day with acceptable execution and strong rule respect in several areas. However, one unnecessary trade lowered the overall quality because it did not fully meet the approved setup standard.",
  categories: [
    { name: "Rule Adherence", score: 26, max: 30 },
    { name: "Discipline", score: 16, max: 20 },
    { name: "Risk Management", score: 14, max: 15 },
    { name: "Setup Quality", score: 12, max: 15 },
    { name: "Execution Timing", score: 7, max: 10 },
    { name: "Bias Alignment", score: 4, max: 5 },
    { name: "Journal Completeness", score: 5, max: 5 },
  ],
  followedRules: ["Respected risk limit", "Traded during approved session", "Documented trade reasoning", "Did not revenge trade", "Maintained stop loss discipline"],
  brokenRules: ["One trade did not meet full A-trade confirmation", "One entry appears slightly chased", "Second setup quality was below ideal standard"],
  strengths: ["Maintained overall emotional control", "Respected capital protection", "Followed session structure", "Journaled the day properly"],
  mistakes: ["Accepted one setup below standard", "Timing on one entry reduced edge", "Did not fully maintain A-trade selectivity"],
  biggestStrength: "Capital protection and discipline remained solid throughout the day.",
  biggestMistake: "You lowered your standard by taking a trade that did not fully qualify under the approved setup model.",
  coaching: "Your day was not poor, but it was not fully elite. The next level is stricter setup selection. Do not let acceptable market ideas tempt you into taking trades that fall below your approved standard.",
  actionPlan: [
    "Only execute trades that meet full A-trade criteria",
    "Avoid any entry after obvious expansion",
    "Reject any setup lacking full confirmation",
    "Keep journaling exact reasons for every entry",
    "Protect your daily standard more than your desire to trade",
  ],
};

export default function EvaluatorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);

  function handleUpload() {
    if (!file) return;
    setLoading(true);
    // Simulate AI evaluation
    setTimeout(() => {
      setResult(sampleResult);
      setLoading(false);
    }, 2500);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Trading Day Evaluator</h1>
        <p className="text-sm text-muted mt-1">Upload your trading day and receive a professional evaluation based on your custom rulebook</p>
      </div>

      {/* Upload section */}
      {!result && (
        <div className="glass-card p-8 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Upload Trading Day File</h3>
            <p className="text-xs text-muted mb-6">Supports PDF, CSV, Excel, JSON, TXT, DOCX, images, and broker exports</p>

            <label className="block cursor-pointer">
              <div className={cn("border-2 border-dashed rounded-xl p-8 transition-smooth",
                file ? "border-accent/50 bg-accent/5" : "border-border hover:border-border-light")}>
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Click or drag to upload your trading day file</p>
                )}
              </div>
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept=".pdf,.csv,.xlsx,.json,.txt,.docx,.png,.jpg,.jpeg" />
            </label>

            <button onClick={handleUpload} disabled={!file || loading}
              className="mt-4 px-8 py-3 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold text-sm transition-smooth disabled:opacity-50 glow-accent">
              {loading ? "Evaluating..." : "Evaluate Trading Day"}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Top summary */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
            <div className="glass-card p-4 text-center col-span-2 sm:col-span-1">
              <div className="text-xs text-muted mb-1">Score</div>
              <div className={cn("text-3xl font-black", result.totalScore >= 80 ? "text-bull-light" : result.totalScore >= 60 ? "text-warn" : "text-bear-light")}>{result.totalScore}</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="text-xs text-muted mb-1">Grade</div>
              <div className="text-2xl font-black gradient-text-accent">{result.grade}</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="text-xs text-muted mb-1">Status</div>
              <div className={cn("text-lg font-bold", result.passFail === "PASS" ? "text-bull-light" : "text-bear-light")}>{result.passFail}</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="text-xs text-muted mb-1">Rules</div>
              <div className="text-lg font-bold text-accent-light">{result.ruleAdherence}%</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="text-xs text-muted mb-1">Class</div>
              <div className="text-xs font-medium text-foreground">{result.classification}</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="text-xs text-muted mb-1">Confidence</div>
              <div className="text-sm font-medium text-foreground">{result.confidence}</div>
            </div>
          </div>

          {/* Overview */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Daily Overview</h3>
            <p className="text-sm text-muted-light leading-relaxed">{result.overview}</p>
          </div>

          {/* Category scores */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-4">Category Scores</h3>
            <div className="space-y-3">
              {result.categories.map((cat) => {
                const pct = (cat.score / cat.max) * 100;
                return (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="text-xs text-muted w-36">{cat.name}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-surface-3 overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all",
                        pct >= 85 ? "bg-bull" : pct >= 70 ? "bg-accent" : "bg-warn")}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-muted-light w-16 text-right">{cat.score}/{cat.max}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Followed rules */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-bull-light mb-3">Followed Rules</h3>
              <div className="space-y-2">
                {result.followedRules.map((rule, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-bull mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="text-xs text-muted-light">{rule}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Broken rules */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-bear-light mb-3">Broken Rules</h3>
              <div className="space-y-2">
                {result.brokenRules.map((rule, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-bear mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    <span className="text-xs text-muted-light">{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Biggest strength/mistake */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card p-6 border-l-4 border-l-bull">
              <h3 className="text-sm font-semibold text-bull-light mb-2">Biggest Strength</h3>
              <p className="text-xs text-muted-light">{result.biggestStrength}</p>
            </div>
            <div className="glass-card p-6 border-l-4 border-l-bear">
              <h3 className="text-sm font-semibold text-bear-light mb-2">Biggest Mistake</h3>
              <p className="text-xs text-muted-light">{result.biggestMistake}</p>
            </div>
          </div>

          {/* Coaching */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Coaching Feedback</h3>
            <p className="text-sm text-muted-light leading-relaxed">{result.coaching}</p>
          </div>

          {/* Action plan */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold mb-3">Next Session Action Plan</h3>
            <div className="space-y-2">
              {result.actionPlan.map((action, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xs font-bold text-accent-light w-5">{i + 1}.</span>
                  <span className="text-xs text-muted-light">{action}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setResult(null)} className="px-6 py-2.5 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm font-medium transition-smooth hover:border-border-light">
              Evaluate Another Day
            </button>
            <button className="px-6 py-2.5 rounded-xl bg-accent text-white text-sm font-medium transition-smooth hover:bg-accent-light">
              Save to History
            </button>
          </div>
        </>
      )}
    </div>
  );
}
