"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type EvalView = "upload" | "result" | "history";

interface TradeEntry {
  id: string;
  symbol: string;
  direction: "buy" | "sell";
  entry: string;
  exit: string;
  sl: string;
  tp: string;
  result: "win" | "loss" | "breakeven";
  pips: number;
  notes: string;
  followedPlan: boolean;
  emotionalEntry: boolean;
  revengeTraded: boolean;
  chasedPrice: boolean;
  properRisk: boolean;
  properSL: boolean;
}

interface CategoryScore {
  name: string;
  score: number;
  max: number;
  details: string;
}

interface Evaluation {
  id: string;
  date: string;
  totalScore: number;
  grade: string;
  passFail: "PASS" | "FAIL";
  ruleAdherence: number;
  classification: string;
  confidence: string;
  overview: string;
  categories: CategoryScore[];
  followedRules: string[];
  brokenRules: string[];
  strengths: string[];
  mistakes: string[];
  biggestStrength: string;
  biggestMistake: string;
  coaching: string;
  actionPlan: string[];
  trades: TradeEntry[];
  pnl: number;
}

function evaluateTrades(trades: TradeEntry[]): Evaluation {
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const totalPips = trades.reduce((s, t) => s + t.pips, 0);
  const followedPlan = trades.filter((t) => t.followedPlan).length;
  const emotional = trades.filter((t) => t.emotionalEntry).length;
  const revenge = trades.filter((t) => t.revengeTraded).length;
  const chased = trades.filter((t) => t.chasedPrice).length;
  const properRisk = trades.filter((t) => t.properRisk).length;
  const properSL = trades.filter((t) => t.properSL).length;

  // Category scores
  const ruleAdherenceScore = trades.length > 0 ? Math.round((followedPlan / trades.length) * 30) : 15;
  const disciplineScore = Math.max(0, 20 - emotional * 5 - revenge * 8 - chased * 4);
  const riskScore = trades.length > 0 ? Math.round((properRisk / trades.length) * 15) : 8;
  const setupScore = trades.length > 0 ? Math.round(((wins / Math.max(trades.length, 1)) * 10) + (followedPlan / Math.max(trades.length, 1) * 5)) : 5;
  const executionScore = trades.length > 0 ? Math.round((properSL / trades.length) * 10) : 5;
  const biasScore = trades.length > 0 && followedPlan / trades.length >= 0.7 ? 5 : 2;
  const journalScore = trades.every((t) => t.notes.length > 0) ? 5 : trades.some((t) => t.notes.length > 0) ? 3 : 0;

  const totalScore = Math.min(100, ruleAdherenceScore + disciplineScore + riskScore + setupScore + executionScore + biasScore + journalScore);

  const grade = totalScore >= 90 ? "A+" : totalScore >= 80 ? "A" : totalScore >= 75 ? "A-" : totalScore >= 70 ? "B+" : totalScore >= 65 ? "B" : totalScore >= 60 ? "B-" : totalScore >= 55 ? "C+" : totalScore >= 50 ? "C" : totalScore >= 40 ? "D" : "F";
  const passFail: "PASS" | "FAIL" = totalScore >= 60 && revenge === 0 && emotional <= 1 ? "PASS" : "FAIL";
  const ruleAdherence = trades.length > 0 ? Math.round((followedPlan / trades.length) * 100) : 0;

  let classification: string;
  if (totalScore >= 85 && revenge === 0) classification = "Elite Rule-Following Day";
  else if (totalScore >= 75) classification = "Strong Process Day";
  else if (totalScore >= 65) classification = "Acceptable Day";
  else if (totalScore >= 55) classification = "Borderline Day";
  else if (emotional > 1 || revenge > 0) classification = "Emotionally Driven Day";
  else if (totalScore >= 45) classification = "Sloppy Day";
  else classification = "Undisciplined Day";

  const categories: CategoryScore[] = [
    { name: "Rule Adherence", score: ruleAdherenceScore, max: 30, details: `${followedPlan}/${trades.length} trades followed the plan` },
    { name: "Discipline", score: disciplineScore, max: 20, details: `${emotional} emotional entries, ${revenge} revenge trades, ${chased} chased entries` },
    { name: "Risk Management", score: riskScore, max: 15, details: `${properRisk}/${trades.length} trades used proper risk sizing` },
    { name: "Setup Quality", score: setupScore, max: 15, details: `${wins} wins out of ${trades.length} trades` },
    { name: "Execution Timing", score: executionScore, max: 10, details: `${properSL}/${trades.length} trades had proper stop loss placement` },
    { name: "Bias Alignment", score: biasScore, max: 5, details: ruleAdherence >= 70 ? "Trades aligned with higher timeframe bias" : "Some trades conflicted with bias" },
    { name: "Journal Completeness", score: journalScore, max: 5, details: trades.every((t) => t.notes.length > 0) ? "All trades documented" : "Some trades missing notes" },
  ];

  const followedRules: string[] = [];
  const brokenRules: string[] = [];
  if (revenge === 0) followedRules.push("No revenge trading"); else brokenRules.push(`${revenge} revenge trade(s) detected`);
  if (emotional === 0) followedRules.push("No emotional entries"); else brokenRules.push(`${emotional} emotional entry(ies)`);
  if (chased === 0) followedRules.push("Did not chase price"); else brokenRules.push(`${chased} chased entry(ies)`);
  if (properRisk === trades.length) followedRules.push("Proper risk on all trades"); else brokenRules.push(`${trades.length - properRisk} trade(s) with improper risk`);
  if (properSL === trades.length) followedRules.push("Stop loss placed correctly on all trades"); else brokenRules.push(`${trades.length - properSL} trade(s) with poor SL placement`);
  if (followedPlan >= trades.length * 0.8) followedRules.push("Followed trading plan on most entries"); else brokenRules.push("Multiple entries outside the trading plan");
  if (trades.every((t) => t.notes)) followedRules.push("Documented all trades"); else brokenRules.push("Some trades not documented");

  const strengths: string[] = [];
  const mistakes: string[] = [];
  if (disciplineScore >= 15) strengths.push("Strong emotional discipline");
  if (riskScore >= 12) strengths.push("Consistent risk management");
  if (followedPlan >= trades.length * 0.8) strengths.push("Followed the trading plan");
  if (wins > losses) strengths.push("More winning trades than losing");
  if (emotional > 0) mistakes.push("Emotional entries detected — need more patience");
  if (revenge > 0) mistakes.push("Revenge trading is the most destructive behavior — must eliminate");
  if (chased > 0) mistakes.push("Chasing price reduces edge — wait for setups to come to you");
  if (properRisk < trades.length) mistakes.push("Not all trades had proper risk sizing");

  const biggestStrength = strengths[0] || "Completed the trading day and submitted for review";
  const biggestMistake = mistakes[0] || "No major issues detected — keep maintaining standards";

  let coaching: string;
  if (totalScore >= 80) coaching = "Excellent day. Your discipline and process were strong. Focus on maintaining this consistency. The best traders make this their baseline, not their peak.";
  else if (totalScore >= 65) coaching = "Decent day with room for improvement. Review the broken rules and ask yourself whether each mistake was avoidable. Small improvements in discipline compound into major edge over time.";
  else if (totalScore >= 50) coaching = "Below standard. The trading plan exists for a reason — deviating from it reduces your edge. Focus on the action plan below and commit to stricter rule-following in the next session.";
  else coaching = "This day did not meet professional standards. Emotional trading and plan deviations cost you significantly. Take a step back, review your rules, and consider reducing position size until discipline improves.";

  const actionPlan: string[] = [];
  if (revenge > 0) actionPlan.push("Implement a mandatory 30-minute break after any losing trade");
  if (emotional > 0) actionPlan.push("Before every entry, write down the setup reason — if you can't articulate it, don't take it");
  if (chased > 0) actionPlan.push("Set entry alerts instead of watching price — remove the temptation to chase");
  if (properRisk < trades.length) actionPlan.push("Use the Risk Calculator for every trade — no exceptions");
  if (!trades.every((t) => t.notes)) actionPlan.push("Document every trade with entry reason and exit analysis");
  if (actionPlan.length === 0) actionPlan.push("Maintain current discipline standards", "Look for ways to refine entry timing", "Continue detailed journaling");

  return {
    id: `eval_${Date.now()}`, date: new Date().toISOString().split("T")[0],
    totalScore, grade, passFail, ruleAdherence, classification,
    confidence: trades.length >= 3 ? "High" : trades.length >= 1 ? "Moderate" : "Low",
    overview: `${trades.length} trades evaluated. ${wins} wins, ${losses} losses. Total ${totalPips >= 0 ? "+" : ""}${totalPips} pips. ${classification}.`,
    categories, followedRules, brokenRules, strengths, mistakes,
    biggestStrength, biggestMistake, coaching, actionPlan, trades, pnl: totalPips,
  };
}

function loadHistory(): Evaluation[] {
  if (typeof window === "undefined") return [];
  try { const s = localStorage.getItem("eval_history"); return s ? JSON.parse(s) : []; } catch { return []; }
}

export default function EvaluatorPage() {
  const [view, setView] = useState<EvalView>("upload");
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [result, setResult] = useState<Evaluation | null>(null);
  const [history, setHistory] = useState<Evaluation[]>([]);

  useEffect(() => { setHistory(loadHistory()); }, []);

  function addTrade() {
    setTrades([...trades, {
      id: `t_${Date.now()}`, symbol: "", direction: "buy", entry: "", exit: "", sl: "", tp: "",
      result: "win", pips: 0, notes: "", followedPlan: true, emotionalEntry: false,
      revengeTraded: false, chasedPrice: false, properRisk: true, properSL: true,
    }]);
  }

  function updateTrade(id: string, field: string, value: any) {
    setTrades(trades.map((t) => t.id === id ? { ...t, [field]: value } : t));
  }

  function removeTrade(id: string) { setTrades(trades.filter((t) => t.id !== id)); }

  function runEvaluation() {
    if (trades.length === 0) { alert("Add at least one trade to evaluate"); return; }
    const evaluation = evaluateTrades(trades);
    setResult(evaluation);
    const updated = [evaluation, ...history].slice(0, 30);
    setHistory(updated);
    localStorage.setItem("eval_history", JSON.stringify(updated));
    setView("result");
  }

  function newEvaluation() {
    setResult(null);
    setTrades([]);
    setView("upload");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trading Day Evaluator</h1>
          <p className="text-sm text-muted mt-1">Score your trading day on process quality — not just P&L. Get coaching feedback and build better habits.</p>
        </div>
        {history.length > 0 && (
          <button onClick={() => setView(view === "history" ? "upload" : "history")} className="px-4 py-2 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-xs font-medium">
            {view === "history" ? "New Evaluation" : `History (${history.length})`}
          </button>
        )}
      </div>

      {/* UPLOAD / TRADE ENTRY */}
      {view === "upload" && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Enter Today&apos;s Trades</h3>
              <button onClick={addTrade} className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium">+ Add Trade</button>
            </div>

            {trades.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">📝</div>
                <p className="text-sm text-muted mb-3">No trades entered yet. Add your trades from today to get an evaluation.</p>
                <button onClick={addTrade} className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium">Add Your First Trade</button>
              </div>
            ) : (
              <div className="space-y-4">
                {trades.map((trade, idx) => (
                  <div key={trade.id} className="bg-surface-2 rounded-xl p-4 border border-border/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-foreground">Trade #{idx + 1}</span>
                      <button onClick={() => removeTrade(trade.id)} className="text-xs text-bear-light hover:text-bear">Remove</button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <div><label className="text-[10px] text-muted mb-0.5 block">Symbol</label>
                        <input type="text" value={trade.symbol} onChange={(e) => updateTrade(trade.id, "symbol", e.target.value)} placeholder="e.g. XAUUSD" className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border text-xs text-foreground" /></div>
                      <div><label className="text-[10px] text-muted mb-0.5 block">Direction</label>
                        <select value={trade.direction} onChange={(e) => updateTrade(trade.id, "direction", e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border text-xs text-foreground">
                          <option value="buy">Buy</option><option value="sell">Sell</option></select></div>
                      <div><label className="text-[10px] text-muted mb-0.5 block">Result</label>
                        <select value={trade.result} onChange={(e) => updateTrade(trade.id, "result", e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border text-xs text-foreground">
                          <option value="win">Win</option><option value="loss">Loss</option><option value="breakeven">Breakeven</option></select></div>
                      <div><label className="text-[10px] text-muted mb-0.5 block">Pips</label>
                        <input type="number" value={trade.pips} onChange={(e) => updateTrade(trade.id, "pips", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border text-xs text-foreground font-mono" /></div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      <div><label className="text-[10px] text-muted mb-0.5 block">Entry</label><input type="text" value={trade.entry} onChange={(e) => updateTrade(trade.id, "entry", e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border text-xs text-foreground font-mono" /></div>
                      <div><label className="text-[10px] text-muted mb-0.5 block">Exit</label><input type="text" value={trade.exit} onChange={(e) => updateTrade(trade.id, "exit", e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border text-xs text-foreground font-mono" /></div>
                      <div><label className="text-[10px] text-bear-light mb-0.5 block">Stop Loss</label><input type="text" value={trade.sl} onChange={(e) => updateTrade(trade.id, "sl", e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-bear/20 text-xs text-foreground font-mono" /></div>
                      <div><label className="text-[10px] text-bull-light mb-0.5 block">Take Profit</label><input type="text" value={trade.tp} onChange={(e) => updateTrade(trade.id, "tp", e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-bull/20 text-xs text-foreground font-mono" /></div>
                    </div>
                    <div><label className="text-[10px] text-muted mb-0.5 block">Trade Notes</label>
                      <textarea value={trade.notes} onChange={(e) => updateTrade(trade.id, "notes", e.target.value)} placeholder="Why did you take this trade? What was your reasoning?" rows={2} className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border text-xs text-foreground resize-none" /></div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
                      {[
                        { key: "followedPlan", label: "Followed Plan", good: true },
                        { key: "properRisk", label: "Proper Risk", good: true },
                        { key: "properSL", label: "Proper SL", good: true },
                        { key: "emotionalEntry", label: "Emotional", good: false },
                        { key: "revengeTraded", label: "Revenge", good: false },
                        { key: "chasedPrice", label: "Chased", good: false },
                      ].map((flag) => (
                        <button key={flag.key} onClick={() => updateTrade(trade.id, flag.key, !(trade as any)[flag.key])}
                          className={cn("py-1.5 rounded-lg text-[10px] font-medium transition-smooth border",
                            (trade as any)[flag.key] ? (flag.good ? "bg-bull/10 text-bull-light border-bull/20" : "bg-bear/10 text-bear-light border-bear/20") : "bg-surface-3 text-muted border-border/30")}>
                          {(trade as any)[flag.key] ? "✓ " : ""}{flag.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {trades.length > 0 && (
            <button onClick={runEvaluation} className="w-full py-4 rounded-xl bg-accent text-white text-sm font-bold transition-smooth glow-accent hover:bg-accent-light">
              Evaluate Trading Day ({trades.length} trade{trades.length > 1 ? "s" : ""})
            </button>
          )}
        </div>
      )}

      {/* RESULT */}
      {view === "result" && result && (
        <div className="space-y-4">
          {/* Score header */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Score</div><div className={cn("text-3xl font-black", result.totalScore >= 75 ? "text-bull-light" : result.totalScore >= 55 ? "text-warn" : "text-bear-light")}>{result.totalScore}</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Grade</div><div className="text-2xl font-black gradient-text-accent">{result.grade}</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Status</div><div className={cn("text-lg font-bold", result.passFail === "PASS" ? "text-bull-light" : "text-bear-light")}>{result.passFail}</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Rules</div><div className="text-lg font-bold text-accent-light">{result.ruleAdherence}%</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">P&L</div><div className={cn("text-lg font-bold font-mono", result.pnl >= 0 ? "text-bull-light" : "text-bear-light")}>{result.pnl >= 0 ? "+" : ""}{result.pnl}p</div></div>
            <div className="glass-card p-4 text-center"><div className="text-xs text-muted mb-1">Class</div><div className="text-[10px] font-medium text-foreground">{result.classification}</div></div>
          </div>

          {/* Overview */}
          <div className="glass-card p-5"><h3 className="text-sm font-semibold mb-2">Daily Overview</h3><p className="text-sm text-muted-light leading-relaxed">{result.overview}</p></div>

          {/* Category scores */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Category Scores</h3>
            <div className="space-y-3">
              {result.categories.map((cat) => {
                const pct = (cat.score / cat.max) * 100;
                return (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted">{cat.name}</span>
                      <span className="text-xs font-mono text-foreground">{cat.score}/{cat.max}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-surface-3 overflow-hidden mb-1">
                      <div className={cn("h-full rounded-full transition-all", pct >= 80 ? "bg-bull" : pct >= 60 ? "bg-accent" : pct >= 40 ? "bg-warn" : "bg-bear")} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-muted">{cat.details}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Followed vs broken rules */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-bull-light mb-3">Followed Rules</h3>
              {result.followedRules.map((rule, i) => (
                <div key={i} className="flex items-start gap-2 mb-2"><svg className="w-4 h-4 text-bull mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="text-xs text-muted-light">{rule}</span></div>
              ))}
            </div>
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-bear-light mb-3">Broken Rules</h3>
              {result.brokenRules.length > 0 ? result.brokenRules.map((rule, i) => (
                <div key={i} className="flex items-start gap-2 mb-2"><svg className="w-4 h-4 text-bear mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg><span className="text-xs text-muted-light">{rule}</span></div>
              )) : <p className="text-xs text-bull-light">No rules broken — excellent discipline!</p>}
            </div>
          </div>

          {/* Biggest strength/mistake */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="glass-card p-5 border-l-4 border-l-bull"><h3 className="text-sm font-semibold text-bull-light mb-2">Biggest Strength</h3><p className="text-xs text-muted-light">{result.biggestStrength}</p></div>
            <div className="glass-card p-5 border-l-4 border-l-bear"><h3 className="text-sm font-semibold text-bear-light mb-2">Biggest Mistake</h3><p className="text-xs text-muted-light">{result.biggestMistake}</p></div>
          </div>

          {/* Coaching */}
          <div className="glass-card p-5"><h3 className="text-sm font-semibold mb-2">Coaching Feedback</h3><p className="text-sm text-muted-light leading-relaxed">{result.coaching}</p></div>

          {/* Action plan */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Next Session Action Plan</h3>
            {result.actionPlan.map((action, i) => (
              <div key={i} className="flex items-start gap-3 mb-2"><span className="text-xs font-bold text-accent-light w-5">{i + 1}.</span><span className="text-xs text-muted-light">{action}</span></div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={newEvaluation} className="px-6 py-3 rounded-xl bg-accent text-white text-sm font-medium">Evaluate Another Day</button>
            <button onClick={() => setView("history")} className="px-6 py-3 rounded-xl bg-surface-2 text-muted-light border border-border/50 text-sm">View History</button>
          </div>
        </div>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Evaluation History ({history.length})</h3>
            <button onClick={newEvaluation} className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium">New Evaluation</button>
          </div>

          {history.length > 0 ? (
            <>
              {/* Trend stats */}
              <div className="grid sm:grid-cols-4 gap-3">
                <div className="glass-card p-3 text-center"><div className="text-lg font-bold">{history.length}</div><div className="text-[10px] text-muted">Total Reviews</div></div>
                <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-foreground">{Math.round(history.reduce((s, e) => s + e.totalScore, 0) / history.length)}</div><div className="text-[10px] text-muted">Avg Score</div></div>
                <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bull-light">{history.filter((e) => e.passFail === "PASS").length}</div><div className="text-[10px] text-muted">Pass Days</div></div>
                <div className="glass-card p-3 text-center"><div className="text-lg font-bold text-bear-light">{history.filter((e) => e.passFail === "FAIL").length}</div><div className="text-[10px] text-muted">Fail Days</div></div>
              </div>

              {history.map((eval_) => (
                <div key={eval_.id} className={cn("glass-card p-5 cursor-pointer hover:border-accent/30 transition-smooth", eval_.passFail === "PASS" ? "border-l-4 border-l-bull" : "border-l-4 border-l-bear")}
                  onClick={() => { setResult(eval_); setView("result"); }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={cn("text-xl font-black", eval_.totalScore >= 75 ? "text-bull-light" : eval_.totalScore >= 55 ? "text-warn" : "text-bear-light")}>{eval_.totalScore}</span>
                      <div>
                        <div className="text-sm font-medium">{eval_.date}</div>
                        <div className="text-xs text-muted">{eval_.classification} • {eval_.trades.length} trades • {eval_.pnl >= 0 ? "+" : ""}{eval_.pnl}p</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold gradient-text-accent">{eval_.grade}</span>
                      <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", eval_.passFail === "PASS" ? "bg-bull/10 text-bull-light" : "bg-bear/10 text-bear-light")}>{eval_.passFail}</span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="glass-card p-12 text-center">
              <p className="text-muted text-sm">No evaluations yet. Complete your first trading day review to start tracking progress.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
