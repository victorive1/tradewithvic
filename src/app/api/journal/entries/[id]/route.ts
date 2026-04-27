// Update / delete a single journal entry. PATCH supports partial updates;
// fields not in the body are left untouched.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { dayKey, refreshDayAggregate } from "@/lib/journal/aggregate";
import { serialize } from "../route";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

interface PatchBody {
  exit?: unknown;
  closedAt?: unknown;
  realizedPnl?: unknown;
  rMultiple?: unknown;
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
  strategy?: unknown;
  session?: unknown;
  marketCondition?: unknown;
  htfBias?: unknown;
  tradeQualityScore?: unknown;
  takeProfit?: unknown;
  preTradeChecklist?: unknown;
}

function num(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}
function str(x: unknown, max = 1024): string | undefined {
  if (typeof x !== "string") return undefined;
  return x.trim().slice(0, max);
}
function bool(x: unknown): boolean | undefined {
  return typeof x === "boolean" ? x : undefined;
}
function jsonArr(x: unknown): string | undefined {
  return Array.isArray(x) ? JSON.stringify(x) : undefined;
}
function jsonObj(x: unknown): string | undefined {
  return x && typeof x === "object" && !Array.isArray(x) ? JSON.stringify(x) : undefined;
}
function date(x: unknown): Date | undefined {
  if (x instanceof Date && !Number.isNaN(x.getTime())) return x;
  if (typeof x === "string") {
    const d = new Date(x);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

export async function PATCH(req: Request, { params }: RouteCtx) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.tradeJournalEntry.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Recompute duration if closedAt changes.
  const newClosedAt = date(body.closedAt);
  const durationMinutes = newClosedAt && existing.openedAt
    ? Math.max(0, Math.round((newClosedAt.getTime() - existing.openedAt.getTime()) / 60_000))
    : undefined;

  // Build the update payload only with fields that were actually provided.
  const data: Record<string, unknown> = {};
  const set = <K extends string>(key: K, value: unknown): void => {
    if (value !== undefined) data[key] = value;
  };
  set("exit", num(body.exit));
  set("closedAt", newClosedAt);
  set("durationMinutes", durationMinutes);
  set("realizedPnl", num(body.realizedPnl));
  set("rMultiple", num(body.rMultiple));
  set("qualityGrade", str(body.qualityGrade, 4));
  set("emotionBefore", str(body.emotionBefore, 32));
  set("emotionDuring", str(body.emotionDuring, 32));
  set("emotionAfter", str(body.emotionAfter, 32));
  set("mistakesJson", jsonArr(body.mistakes));
  set("rulesFollowed", bool(body.rulesFollowed));
  set("rulesViolatedJson", jsonArr(body.rulesViolated));
  set("disciplineScore", num(body.disciplineScore));
  set("notes", str(body.notes, 4096));
  set("lessonLearned", str(body.lessonLearned, 1024));
  set("screenshotsJson", jsonArr(body.screenshots));
  set("strategy", str(body.strategy, 64));
  set("session", str(body.session, 32));
  set("marketCondition", str(body.marketCondition, 32));
  set("htfBias", str(body.htfBias, 16));
  set("tradeQualityScore", num(body.tradeQualityScore));
  set("takeProfit", num(body.takeProfit));
  set("preTradeChecklist", jsonObj(body.preTradeChecklist));

  const updated = await prisma.tradeJournalEntry.update({
    where: { id },
    data,
  });

  await refreshDayAggregate(user.id, dayKey(existing.openedAt));
  return NextResponse.json({ success: true, entry: serialize(updated) });
}

export async function DELETE(_req: Request, { params }: RouteCtx) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.tradeJournalEntry.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.tradeJournalEntry.delete({ where: { id } });
  await refreshDayAggregate(user.id, dayKey(existing.openedAt));
  return NextResponse.json({ success: true });
}
