// Daily review for a specific YYYY-MM-DD. GET creates an empty row if the
// day doesn't exist yet so the client always has a stable shape to render.
// POST upserts the daily review fields (notes, lesson, focus, etc.).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface RouteCtx { params: Promise<{ date: string }>; }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asString(x: unknown, max = 4096): string | null {
  if (typeof x !== "string") return null;
  const s = x.trim();
  return s.length === 0 ? null : s.slice(0, max);
}
function asNumber(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}
function asBool(x: unknown): boolean {
  return typeof x === "boolean" ? x : false;
}
function asJsonArray(x: unknown): string {
  return JSON.stringify(Array.isArray(x) ? x : []);
}

export async function GET(_req: Request, { params }: RouteCtx) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { date } = await params;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });

  const row = await prisma.tradeJournalDay.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });
  if (!row) {
    return NextResponse.json({
      success: true,
      day: {
        date,
        preMarketBias: null, watchlist: [], newsRisk: [], marketView: null,
        planAdherence: null, overtraded: false, hitDailyLimit: false,
        topMistake: null, lessonLearned: null, tomorrowsFocus: null, notes: null,
        pnl: 0, trades: 0, wins: 0, losses: 0,
      },
    });
  }

  let watchlist: unknown = [];
  let newsRisk: unknown = [];
  try { watchlist = JSON.parse(row.watchlistJson); } catch { /* malformed */ }
  try { newsRisk = JSON.parse(row.newsRiskJson); } catch { /* malformed */ }

  return NextResponse.json({
    success: true,
    day: {
      date: row.date,
      preMarketBias: row.preMarketBias,
      watchlist,
      newsRisk,
      marketView: row.marketView,
      planAdherence: row.planAdherence,
      overtraded: row.overtraded,
      hitDailyLimit: row.hitDailyLimit,
      topMistake: row.topMistake,
      lessonLearned: row.lessonLearned,
      tomorrowsFocus: row.tomorrowsFocus,
      notes: row.notes,
      pnl: row.pnl,
      trades: row.trades,
      wins: row.wins,
      losses: row.losses,
    },
  });
}

export async function POST(req: Request, { params }: RouteCtx) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { date } = await params;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data = {
    preMarketBias: asString(body.preMarketBias, 256),
    watchlistJson: asJsonArray(body.watchlist),
    newsRiskJson: asJsonArray(body.newsRisk),
    marketView: asString(body.marketView, 1024),
    planAdherence: asNumber(body.planAdherence),
    overtraded: asBool(body.overtraded),
    hitDailyLimit: asBool(body.hitDailyLimit),
    topMistake: asString(body.topMistake, 64),
    lessonLearned: asString(body.lessonLearned, 1024),
    tomorrowsFocus: asString(body.tomorrowsFocus, 1024),
    notes: asString(body.notes, 4096),
  };

  await prisma.tradeJournalDay.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: data,
    create: { userId: user.id, date, ...data },
  });

  return NextResponse.json({ success: true });
}
