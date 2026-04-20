import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUserKey } from "@/lib/trading/user-key";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Read/write the server-side config for one algo bot. Keyed by botId
 * ("breakout" | "md" | "us30" | "metals" | "ob" | "fx-strength" | "vic" | "hub").
 *
 * Admin-only by convention — the sidebar only exposes these URLs to
 * admin users. Server-side we additionally require the caller to have
 * a userKey (same gate used everywhere else in the trading API) and
 * record it as the bot's owner.
 */

const VALID_BOT_IDS = new Set([
  "breakout", "md", "us30", "metals", "ob", "fx-strength", "vic", "hub",
]);

const DEFAULT_STRATEGY_FILTER: Record<string, string> = {
  breakout: "breakout",
  md: "trend_pullback,breakout",
  us30: "breakout,trend_pullback",
  metals: "breakout,trend_pullback,sweep_reversal",
  ob: "sweep_reversal,trend_pullback",
  "fx-strength": "trend_pullback",
  vic: "breakout,sweep_reversal",
  hub: "breakout,trend_pullback,sweep_reversal",
};

const DEFAULT_SYMBOL_FILTER: Record<string, string> = {
  us30: "US30,NAS100,SPX500,GER40",
  metals: "XAUUSD,XAGUSD",
};

async function ensureConfig(botId: string, ownerUserKey: string | null) {
  const existing = await prisma.algoBotConfig.findUnique({ where: { botId } });
  if (existing) return existing;
  return prisma.algoBotConfig.create({
    data: {
      botId,
      strategyFilter: DEFAULT_STRATEGY_FILTER[botId] ?? "",
      symbolFilter: DEFAULT_SYMBOL_FILTER[botId] ?? "",
      ownerUserKey,
    },
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ botId: string }> }) {
  const { botId } = await ctx.params;
  if (!VALID_BOT_IDS.has(botId)) {
    return NextResponse.json({ error: "unknown_bot" }, { status: 404 });
  }
  const userKey = readUserKey(_req);
  const cfg = await ensureConfig(botId, userKey);
  return NextResponse.json(cfg);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ botId: string }> }) {
  const { botId } = await ctx.params;
  if (!VALID_BOT_IDS.has(botId)) {
    return NextResponse.json({ error: "unknown_bot" }, { status: 404 });
  }
  const userKey = readUserKey(req);
  const body = await req.json().catch(() => ({}));
  const existing = await ensureConfig(botId, userKey);

  const data: Record<string, unknown> = {};
  // Shallow allow-list so arbitrary fields can't hit the DB.
  const str = (k: string, allow?: (v: string) => boolean) => {
    if (typeof body[k] === "string" && (!allow || allow(body[k]))) data[k] = body[k];
  };
  const bool = (k: string) => { if (typeof body[k] === "boolean") data[k] = body[k]; };
  const num = (k: string) => { if (typeof body[k] === "number" && Number.isFinite(body[k])) data[k] = body[k]; };
  const intn = (k: string) => { if (typeof body[k] === "number" && Number.isInteger(body[k])) data[k] = body[k]; };
  const csvFromArr = (k: string) => {
    if (Array.isArray(body[k])) data[k] = body[k].filter((x) => typeof x === "string").join(",");
    else if (typeof body[k] === "string") data[k] = body[k];
  };

  bool("enabled"); bool("running");
  csvFromArr("strategyFilter");
  csvFromArr("symbolFilter");
  str("sizingMode", (v) => v === "fixed_lot" || v === "risk_percent");
  num("fixedLotSize"); num("riskPercent");
  intn("minScore"); num("minRiskReward");
  intn("maxOpenPositions"); intn("maxPerPair"); intn("maxSamePairInRow");
  num("dailyDrawdownPercent"); intn("pauseAfterLosses");
  csvFromArr("selectedAccounts");
  bool("newsFilter"); bool("fridayCloseProtection"); intn("preCloseBufferMinutes");
  csvFromArr("allowedSessions");

  if (userKey && !existing.ownerUserKey) {
    data.ownerUserKey = userKey;
  }

  const updated = await prisma.algoBotConfig.update({
    where: { id: existing.id },
    data,
  });
  return NextResponse.json(updated);
}
