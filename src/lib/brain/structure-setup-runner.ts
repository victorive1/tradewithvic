// src/lib/brain/structure-setup-runner.ts
//
// Orchestrates StructureEvent → TradeSetup generation for one scan
// cycle. Reads recent events (last 10 min) for the cycle symbols,
// gathers context (state, higher-TF state, regime, liquidity zones,
// ATR, current price), runs the pure generator, persists the result.
//
// Runs AFTER liquidity analysis in scan.ts so liquidityZones are fresh.

import { prisma } from "@/lib/prisma";
import {
  generateStructureSetup,
  type StructureEventInput,
} from "@/lib/brain/structure-setup-generator";
import { persistStructureSetup } from "@/lib/brain/structure-setup-persister";

const ELIGIBLE_TIMEFRAMES = new Set(["15min", "1h", "4h"]);

function higherTfFor(tf: string): string | null {
  if (tf === "15min") return "1h";
  if (tf === "1h") return "4h";
  return null;
}

// Simple ATR(14) computed from the most recent closed candles on the
// event's timeframe. Avoids a hard dependency on the indicators module
// in case it's run on a different cadence.
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

export interface StructureSetupRunResult {
  eventsConsidered: number;
  setupsCreated: number;
  setupsSkippedExisting: number;
  setupsRejectedByGenerator: number;
  errors: string[];
}

export async function runStructureSetupGeneration(
  cycleSymbols: readonly string[],
): Promise<StructureSetupRunResult> {
  const result: StructureSetupRunResult = {
    eventsConsidered: 0,
    setupsCreated: 0,
    setupsSkippedExisting: 0,
    setupsRejectedByGenerator: 0,
    errors: [],
  };

  if (cycleSymbols.length === 0) return result;

  const sinceMs = Date.now() - 10 * 60 * 1000;
  // StructureEvent uses `detectedAt` (not `createdAt`) per the schema.
  const events = await prisma.structureEvent.findMany({
    where: {
      symbol: { in: [...cycleSymbols] },
      detectedAt: { gte: new Date(sinceMs) },
    },
    orderBy: { detectedAt: "desc" },
  });

  for (const event of events) {
    if (!ELIGIBLE_TIMEFRAMES.has(event.timeframe)) continue;
    result.eventsConsidered++;

    try {
      const state = await prisma.structureState.findUnique({
        where: { symbol_timeframe: { symbol: event.symbol, timeframe: event.timeframe } },
      });
      if (!state) continue;

      const higherTf = higherTfFor(event.timeframe);
      const higherTfState = higherTf
        ? await prisma.structureState.findUnique({
            where: { symbol_timeframe: { symbol: event.symbol, timeframe: higherTf } },
          })
        : null;

      // Schema exposes RegimeSnapshot (no plain Regime model). Map its
      // structureRegime field onto the generator's `state` slot.
      const regimeSnap = await prisma.regimeSnapshot.findUnique({
        where: { symbol_timeframe: { symbol: event.symbol, timeframe: event.timeframe } },
        select: { structureRegime: true },
      });
      const regime = regimeSnap ? { state: regimeSnap.structureRegime } : null;

      const liquidityZones = await prisma.liquidityZone.findMany({
        where: {
          symbol: event.symbol,
          timeframe: event.timeframe,
          isFilled: false,
          isViolated: false,
        },
        take: 20,
      });

      const atr14 = await computeAtr14(event.symbol, event.timeframe);

      const lastCandle = await prisma.candle.findFirst({
        where: { symbol: event.symbol, timeframe: event.timeframe, isClosed: true },
        orderBy: { openTime: "desc" },
        select: { close: true },
      });
      const currentPrice = lastCandle?.close;
      if (currentPrice == null) continue;

      const instrument = await prisma.instrument.findFirst({
        where: { symbol: event.symbol },
        select: { id: true },
      });
      if (!instrument) continue;

      // Prisma stores eventType as a free String; the generator narrows
      // to a union. The structure engine only ever writes the four
      // known values, so a cast is safe here.
      const eventInput: StructureEventInput = {
        id: event.id,
        symbol: event.symbol,
        timeframe: event.timeframe,
        eventType: event.eventType as StructureEventInput["eventType"],
        priceLevel: event.priceLevel,
        brokerCandleTime: event.brokerCandleTime,
        priorBias: event.priorBias,
        newBias: event.newBias,
      };

      const spec = generateStructureSetup({
        event: eventInput,
        state,
        higherTfState,
        regime,
        liquidityZones,
        atr14,
        currentPrice,
      });

      if (!spec) {
        result.setupsRejectedByGenerator++;
        continue;
      }

      const persisted = await persistStructureSetup(spec, instrument.id);
      if (persisted.created) result.setupsCreated++;
      else result.setupsSkippedExisting++;
    } catch (err) {
      result.errors.push(`${event.symbol} ${event.timeframe}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
