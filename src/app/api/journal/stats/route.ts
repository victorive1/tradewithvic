// Aggregate stats — P&L, win rate, R-multiple, breakdowns by strategy /
// session / mistake. Powers the dashboard tiles + strategy grid.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const daysParam = parseInt(url.searchParams.get("days") ?? "30", 10);
  const days = Math.max(1, Math.min(365, isNaN(daysParam) ? 30 : daysParam));
  const from = new Date(Date.now() - days * 24 * 3600 * 1000);

  const entries = await prisma.tradeJournalEntry.findMany({
    where: { userId: user.id, openedAt: { gte: from } },
    select: {
      symbol: true, strategy: true, session: true,
      realizedPnl: true, rMultiple: true, qualityGrade: true,
      outcome: true,
      mistakesJson: true, openedAt: true, closedAt: true,
    },
  });

  // Resolve W/L for an entry: explicit outcome wins; otherwise fall back
  // to the sign of realizedPnl (only when closed). Returns null when the
  // trade is open / unscored. Centralized so summary, byStrategy, and
  // bySession all classify identically.
  function resolveOutcome(e: { outcome: string | null; realizedPnl: number | null; closedAt: Date | null }): "win" | "loss" | null {
    if (e.outcome === "win" || e.outcome === "loss") return e.outcome;
    if (e.realizedPnl != null && e.closedAt) {
      if (e.realizedPnl > 0) return "win";
      if (e.realizedPnl < 0) return "loss";
    }
    return null;
  }

  let pnl = 0;
  let wins = 0;
  let losses = 0;
  let closed = 0;
  let totalR = 0;
  let avgR = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let lossStreak = 0;
  let curStreak = 0;
  for (const e of entries) {
    const wl = resolveOutcome(e);
    // Aggregate dollar P&L only when the trade actually has a closed
    // realizedPnl — the explicit-outcome path doesn't synthesize a
    // dollar value. A trade tagged "win" with no exit price still
    // increments the win count but contributes 0 to PnL.
    const hasClosedPnl = e.closedAt != null && e.realizedPnl != null;
    if (!wl && !hasClosedPnl) continue;
    if (hasClosedPnl) {
      closed++;
      pnl += e.realizedPnl!;
      if (e.rMultiple != null) totalR += e.rMultiple;
    }
    if (wl === "win") {
      wins++;
      if (hasClosedPnl && e.realizedPnl! > biggestWin) biggestWin = e.realizedPnl!;
      curStreak = 0;
    } else if (wl === "loss") {
      losses++;
      if (hasClosedPnl && e.realizedPnl! < biggestLoss) biggestLoss = e.realizedPnl!;
      curStreak++;
      if (curStreak > lossStreak) lossStreak = curStreak;
    }
  }
  if (closed > 0) avgR = totalR / closed;
  const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;

  // By strategy.
  const strategyMap = new Map<string, { trades: number; wins: number; losses: number; pnl: number; rSum: number; rN: number }>();
  for (const e of entries) {
    const key = e.strategy ?? "unspecified";
    const cur = strategyMap.get(key) ?? { trades: 0, wins: 0, losses: 0, pnl: 0, rSum: 0, rN: 0 };
    cur.trades++;
    const wl = resolveOutcome(e);
    if (e.realizedPnl != null && e.closedAt) cur.pnl += e.realizedPnl;
    if (wl === "win") cur.wins++;
    else if (wl === "loss") cur.losses++;
    if (e.rMultiple != null) { cur.rSum += e.rMultiple; cur.rN++; }
    strategyMap.set(key, cur);
  }
  const byStrategy = [...strategyMap.entries()]
    .map(([strategy, s]) => ({
      strategy,
      trades: s.trades,
      winRate: s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : null,
      avgR: s.rN > 0 ? s.rSum / s.rN : null,
      pnl: s.pnl,
      grade: gradeStrategy(s.wins, s.losses, s.rN > 0 ? s.rSum / s.rN : 0, s.pnl),
    }))
    .sort((a, b) => b.pnl - a.pnl);

  // By session.
  const sessionMap = new Map<string, { trades: number; pnl: number; wins: number; losses: number }>();
  for (const e of entries) {
    const key = e.session ?? "unspecified";
    const cur = sessionMap.get(key) ?? { trades: 0, pnl: 0, wins: 0, losses: 0 };
    cur.trades++;
    const wl = resolveOutcome(e);
    if (e.realizedPnl != null && e.closedAt) cur.pnl += e.realizedPnl;
    if (wl === "win") cur.wins++;
    else if (wl === "loss") cur.losses++;
    sessionMap.set(key, cur);
  }
  const bySession = [...sessionMap.entries()].map(([session, s]) => ({
    session, ...s,
    winRate: s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : null,
  }));

  // By mistake — count occurrences and sum negative-PnL "cost".
  const mistakeMap = new Map<string, { count: number; cost: number }>();
  for (const e of entries) {
    let mistakes: string[] = [];
    try { mistakes = JSON.parse(e.mistakesJson) as string[]; } catch { /* malformed */ }
    if (!Array.isArray(mistakes) || mistakes.length === 0) continue;
    const cost = e.realizedPnl != null && e.realizedPnl < 0 ? Math.abs(e.realizedPnl) : 0;
    for (const m of mistakes) {
      if (typeof m !== "string") continue;
      const cur = mistakeMap.get(m) ?? { count: 0, cost: 0 };
      cur.count++;
      cur.cost += cost;
      mistakeMap.set(m, cur);
    }
  }
  const byMistake = [...mistakeMap.entries()]
    .map(([mistake, s]) => ({ mistake, ...s }))
    .sort((a, b) => b.cost - a.cost);

  return NextResponse.json({
    success: true,
    range: { days, from: from.toISOString() },
    summary: {
      totalTrades: entries.length,
      closedTrades: closed,
      pnl, wins, losses,
      winRate,
      avgR,
      biggestWin,
      biggestLoss,
      lossStreak,
    },
    byStrategy,
    bySession,
    byMistake,
  });
}

function gradeStrategy(wins: number, losses: number, avgR: number, pnl: number): string {
  const total = wins + losses;
  if (total === 0) return "—";
  const wr = wins / total;
  const score = (wr * 50) + (Math.min(2.5, Math.max(-1, avgR)) * 15) + (pnl > 0 ? 10 : -10);
  if (score >= 70) return "A";
  if (score >= 55) return "A-";
  if (score >= 45) return "B";
  if (score >= 30) return "C";
  return "F";
}
