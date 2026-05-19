// src/lib/brain/sr-setup-runner.ts
//
// Orchestrates LiquidityZone violations → TradeSetup generation for
// one scan cycle. Reads zones whose updatedAt is within the last
// 10 min AND isViolated=true; for each, gathers context (current
// price, ATR, opposing same-TF zones, higher-TF zones), runs the
// pure generator, persists the result.
//
// Runs AFTER persistZonesForCycle in scan.ts so zone state is fresh.

import { prisma } from "@/lib/prisma";
import { generateSrSetup, type SrZoneInput, type SrZoneType } from "@/lib/brain/sr-setup-generator";
import { persistSrSetup } from "@/lib/brain/sr-setup-persister";

const ELIGIBLE_TIMEFRAMES = new Set(["15min", "1h", "4h"]);
const VALID_ZONE_TYPES: Set<SrZoneType> = new Set([
  "fvg", "order_block",
  "equal_highs", "equal_lows",
  "session_high", "session_low",
  "prev_day_high", "prev_day_low",
  "swing_high", "swing_low",
]);

function higherTfFor(tf: string): string | null {
  if (tf === "15min") return "1h";
  if (tf === "1h") return "4h";
  if (tf === "4h") return "1d";
  return null;
}

async function computeAtr14(symbol: string, timeframe: string): Promise<number | null> {
  const rows = await prisma.candle.findMany({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "desc" },
    take: 15,
    select: { high: true, low: true, close: true },
  });
  if (rows.length < 15) return null;
  const ordered = rows.reverse();
  const trs: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const c = ordered[i];
    const prev = ordered[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

export interface SrSetupRunResult {
  zonesConsidered: number;
  setupsCreated: number;
  setupsSkippedExisting: number;
  setupsRejectedByGenerator: number;
  errors: string[];
}

function toSrZoneInput(raw: {
  id: string;
  symbol: string;
  timeframe: string;
  zoneType: string;
  direction: string | null;
  priceLow: number;
  priceHigh: number;
  strengthScore: number;
  updatedAt: Date;
}): SrZoneInput | null {
  if (!VALID_ZONE_TYPES.has(raw.zoneType as SrZoneType)) return null;
  const dir = raw.direction === "bullish" || raw.direction === "bearish" ? raw.direction : null;
  return {
    id: raw.id,
    symbol: raw.symbol,
    timeframe: raw.timeframe,
    zoneType: raw.zoneType as SrZoneType,
    direction: dir,
    priceLow: raw.priceLow,
    priceHigh: raw.priceHigh,
    strengthScore: raw.strengthScore,
    updatedAt: raw.updatedAt,
  };
}

export async function runSrSetupGeneration(
  cycleSymbols: readonly string[],
): Promise<SrSetupRunResult> {
  const result: SrSetupRunResult = {
    zonesConsidered: 0,
    setupsCreated: 0,
    setupsSkippedExisting: 0,
    setupsRejectedByGenerator: 0,
    errors: [],
  };
  if (cycleSymbols.length === 0) return result;

  const sinceMs = Date.now() - 10 * 60 * 1000;
  const violated = await prisma.liquidityZone.findMany({
    where: {
      symbol: { in: [...cycleSymbols] },
      isViolated: true,
      updatedAt: { gte: new Date(sinceMs) },
    },
    orderBy: { updatedAt: "desc" },
  });

  for (const raw of violated) {
    if (!ELIGIBLE_TIMEFRAMES.has(raw.timeframe)) continue;
    const zone = toSrZoneInput(raw);
    if (!zone) continue;
    result.zonesConsidered++;

    try {
      const lastCandle = await prisma.candle.findFirst({
        where: { symbol: zone.symbol, timeframe: zone.timeframe, isClosed: true },
        orderBy: { openTime: "desc" },
        select: { close: true },
      });
      const currentPrice = lastCandle?.close;
      if (currentPrice == null) continue;

      const atr14 = await computeAtr14(zone.symbol, zone.timeframe);

      const sameTfRaw = await prisma.liquidityZone.findMany({
        where: {
          symbol: zone.symbol,
          timeframe: zone.timeframe,
          isFilled: false,
          isViolated: false,
        },
        take: 30,
      });
      const sameTfZones = sameTfRaw
        .map(toSrZoneInput)
        .filter((z): z is SrZoneInput => z !== null);

      const higherTf = higherTfFor(zone.timeframe);
      const higherTfRaw = higherTf
        ? await prisma.liquidityZone.findMany({
            where: {
              symbol: zone.symbol,
              timeframe: higherTf,
              isFilled: false,
              isViolated: false,
            },
            take: 30,
          })
        : [];
      const higherTfZones = higherTfRaw
        .map(toSrZoneInput)
        .filter((z): z is SrZoneInput => z !== null);

      const instrument = await prisma.instrument.findFirst({
        where: { symbol: zone.symbol },
        select: { id: true },
      });
      if (!instrument) continue;

      const spec = generateSrSetup({ zone, currentPrice, atr14, sameTfZones, higherTfZones });
      if (!spec) {
        result.setupsRejectedByGenerator++;
        continue;
      }

      const persisted = await persistSrSetup(spec, instrument.id);
      if (persisted.created) result.setupsCreated++;
      else result.setupsSkippedExisting++;
    } catch (err) {
      result.errors.push(`${zone.symbol} ${zone.timeframe}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
