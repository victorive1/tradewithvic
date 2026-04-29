// Trade journal entries — GET (list with date range), POST (create).
// Auth via session cookie. Anonymous users get 401.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { dayKey, refreshDayAggregate } from "@/lib/journal/aggregate";

export const dynamic = "force-dynamic";

interface CreateEntryBody {
  symbol?: unknown;
  direction?: unknown;
  entry?: unknown;
  exit?: unknown;
  stopLoss?: unknown;
  takeProfit?: unknown;
  positionSize?: unknown;
  riskAmount?: unknown;
  riskPercent?: unknown;
  realizedPnl?: unknown;
  rMultiple?: unknown;
  outcome?: unknown;
  openedAt?: unknown;
  closedAt?: unknown;
  session?: unknown;
  timeframe?: unknown;
  broker?: unknown;
  account?: unknown;
  strategy?: unknown;
  marketCondition?: unknown;
  htfBias?: unknown;
  preTradeChecklist?: unknown;
  tradeQualityScore?: unknown;
  qualityGrade?: unknown;
  emotionBefore?: unknown;
  emotionDuring?: unknown;
  emotionAfter?: unknown;
  mistakes?: unknown;
  rulesFollowed?: unknown;
  rulesViolated?: unknown;
  disciplineScore?: unknown;
  notes?: unknown;
  lessonLearned?: unknown;
  screenshots?: unknown;
}

function asNumber(x: unknown, fallback: number | null = null): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return fallback;
  return x;
}
function asString(x: unknown, max = 1024): string | null {
  if (typeof x !== "string") return null;
  const s = x.trim();
  return s.length === 0 ? null : s.slice(0, max);
}
function asBool(x: unknown, fallback: boolean): boolean {
  return typeof x === "boolean" ? x : fallback;
}
function asJsonArray(x: unknown): string {
  return JSON.stringify(Array.isArray(x) ? x : []);
}
function asJsonObject(x: unknown): string {
  return JSON.stringify(x && typeof x === "object" && !Array.isArray(x) ? x : {});
}
function asOutcome(x: unknown): string | null {
  return x === "win" || x === "loss" ? x : null;
}
function asDate(x: unknown, fallback: Date | null = null): Date | null {
  if (x instanceof Date && !Number.isNaN(x.getTime())) return x;
  if (typeof x === "string") {
    const d = new Date(x);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  // Default: last 7 days
  const now = new Date();
  const from = fromStr ? new Date(fromStr) : new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const to = toStr ? new Date(toStr) : now;

  const entries = await prisma.tradeJournalEntry.findMany({
    where: {
      userId: user.id,
      openedAt: { gte: from, lte: to },
    },
    orderBy: { openedAt: "desc" },
  });

  return NextResponse.json({
    success: true,
    entries: entries.map(serialize),
    count: entries.length,
  });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: CreateEntryBody;
  try { body = (await req.json()) as CreateEntryBody; } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const symbol = asString(body.symbol, 32);
  const direction = asString(body.direction, 16);
  const entry = asNumber(body.entry);
  const stopLoss = asNumber(body.stopLoss);
  const positionSize = asNumber(body.positionSize);
  const openedAt = asDate(body.openedAt, new Date());

  if (!symbol || !direction || entry == null || stopLoss == null || positionSize == null || !openedAt) {
    return NextResponse.json({ error: "missing_required_fields", hint: "symbol, direction, entry, stopLoss, positionSize, openedAt are required" }, { status: 400 });
  }
  if (direction !== "buy" && direction !== "sell") {
    return NextResponse.json({ error: "invalid_direction" }, { status: 400 });
  }

  const exit = asNumber(body.exit);
  const closedAt = asDate(body.closedAt);
  let realizedPnl = asNumber(body.realizedPnl);
  let rMultiple = asNumber(body.rMultiple);
  let durationMinutes: number | null = null;

  // Auto-derive PnL/R from exit if user provided exit but not realizedPnl.
  // Sized in pips × pip-value would need broker specs — this is a coarse
  // approximation that's at least directionally correct, useful for stat
  // dashboards. The user can override realizedPnl if they want exact.
  if (exit != null && realizedPnl == null && entry !== exit && positionSize > 0) {
    const slDist = Math.abs(entry - stopLoss);
    if (slDist > 0) {
      const moveInR = direction === "buy" ? (exit - entry) / slDist : (entry - exit) / slDist;
      rMultiple = rMultiple ?? Math.round(moveInR * 100) / 100;
      // Without broker specs we can't compute dollar PnL precisely; leave
      // realizedPnl null and let the user fill it. rMultiple is enough for
      // most journal stats.
    }
  }
  if (closedAt && openedAt) {
    durationMinutes = Math.max(0, Math.round((closedAt.getTime() - openedAt.getTime()) / 60_000));
  }

  const created = await prisma.tradeJournalEntry.create({
    data: {
      userId: user.id,
      symbol,
      direction,
      entry,
      exit,
      stopLoss,
      takeProfit: asNumber(body.takeProfit),
      positionSize,
      riskAmount: asNumber(body.riskAmount),
      riskPercent: asNumber(body.riskPercent),
      realizedPnl,
      rMultiple,
      outcome: asOutcome(body.outcome),
      openedAt,
      closedAt,
      durationMinutes,
      session: asString(body.session, 32),
      timeframe: asString(body.timeframe, 16),
      broker: asString(body.broker, 64),
      account: asString(body.account, 64),
      strategy: asString(body.strategy, 64),
      marketCondition: asString(body.marketCondition, 32),
      htfBias: asString(body.htfBias, 16),
      preTradeChecklist: asJsonObject(body.preTradeChecklist),
      tradeQualityScore: asNumber(body.tradeQualityScore),
      qualityGrade: asString(body.qualityGrade, 4),
      emotionBefore: asString(body.emotionBefore, 32),
      emotionDuring: asString(body.emotionDuring, 32),
      emotionAfter: asString(body.emotionAfter, 32),
      mistakesJson: asJsonArray(body.mistakes),
      rulesFollowed: asBool(body.rulesFollowed, true),
      rulesViolatedJson: asJsonArray(body.rulesViolated),
      disciplineScore: asNumber(body.disciplineScore),
      notes: asString(body.notes, 4096),
      lessonLearned: asString(body.lessonLearned, 1024),
      screenshotsJson: asJsonArray(body.screenshots),
    },
  });

  // Refresh the day's cached aggregate for the calendar.
  await refreshDayAggregate(user.id, dayKey(openedAt));

  return NextResponse.json({ success: true, entry: serialize(created) });
}

// Shared serializer. Parses JSON columns for the client so it can render
// without re-parsing.
type EntryRow = Awaited<ReturnType<typeof prisma.tradeJournalEntry.findUnique>>;
export function serialize(e: NonNullable<EntryRow>) {
  let preTradeChecklist: unknown = {};
  let mistakes: unknown = [];
  let rulesViolated: unknown = [];
  let screenshots: unknown = [];
  try { preTradeChecklist = JSON.parse(e.preTradeChecklist); } catch { /* malformed */ }
  try { mistakes = JSON.parse(e.mistakesJson); } catch { /* malformed */ }
  try { rulesViolated = JSON.parse(e.rulesViolatedJson); } catch { /* malformed */ }
  try { screenshots = JSON.parse(e.screenshotsJson); } catch { /* malformed */ }
  return {
    id: e.id,
    executionTradeId: e.executionTradeId,
    symbol: e.symbol,
    direction: e.direction,
    entry: e.entry,
    exit: e.exit,
    stopLoss: e.stopLoss,
    takeProfit: e.takeProfit,
    positionSize: e.positionSize,
    riskAmount: e.riskAmount,
    riskPercent: e.riskPercent,
    realizedPnl: e.realizedPnl,
    rMultiple: e.rMultiple,
    outcome: e.outcome,
    openedAt: e.openedAt.toISOString(),
    closedAt: e.closedAt?.toISOString() ?? null,
    durationMinutes: e.durationMinutes,
    session: e.session,
    timeframe: e.timeframe,
    broker: e.broker,
    account: e.account,
    strategy: e.strategy,
    marketCondition: e.marketCondition,
    htfBias: e.htfBias,
    preTradeChecklist,
    tradeQualityScore: e.tradeQualityScore,
    qualityGrade: e.qualityGrade,
    emotionBefore: e.emotionBefore,
    emotionDuring: e.emotionDuring,
    emotionAfter: e.emotionAfter,
    mistakes,
    rulesFollowed: e.rulesFollowed,
    rulesViolated,
    disciplineScore: e.disciplineScore,
    notes: e.notes,
    lessonLearned: e.lessonLearned,
    screenshots,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
