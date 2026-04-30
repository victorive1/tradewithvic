// FlowVision Scan Orchestrator — runs every 2 minutes.
//
// 1. Build FlowContext per MVP symbol (multi-tf candles + structure +
//    sweeps + levels + VWAP + session).
// 2. Run all 5 modules: retail, institutional, liquidity map, trap,
//    prediction.
// 3. Persist a single FlowSnapshot per symbol per cycle (overwrites
//    via upsert-on-symbol pattern — only the latest matters; history
//    is for the trend chart later).
// 4. Persist new LiquidityZone rows (skip duplicates by zone fingerprint).
// 5. Mark filled / violated zones based on latest price action.

import { prisma } from "@/lib/prisma";
import { computeAnchoredVwap } from "@/lib/mini/vwap";
import { classifySession } from "@/lib/mini/session";
import { fetchRetailSentiment } from "@/lib/flow/retail";
import { computeInstitutionalFlow } from "@/lib/flow/institutional";
import { buildLiquidityMap } from "@/lib/flow/liquidity-map";
import { detectTrap } from "@/lib/flow/trap-detector";
import { predictFlow } from "@/lib/flow/prediction";
import type { FlowContext } from "@/lib/flow/types";

// MVP symbol set per blueprint § 11. Expand once data sources stabilise.
export const FLOW_VISION_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "NAS100", "US30"];

export interface FlowScanResult {
  symbolsScanned: number;
  snapshotsPersisted: number;
  zonesAdded: number;
  zonesFilled: number;
  zonesViolated: number;
  errors: string[];
}

export async function runFlowScan(): Promise<FlowScanResult> {
  const result: FlowScanResult = {
    symbolsScanned: 0, snapshotsPersisted: 0, zonesAdded: 0,
    zonesFilled: 0, zonesViolated: 0, errors: [],
  };

  // Resolve instrument rows once.
  const instruments = await prisma.instrument.findMany({
    where: { isActive: true, symbol: { in: FLOW_VISION_SYMBOLS } },
  });

  for (const inst of instruments) {
    try {
      const ctx = await buildFlowContext(inst.symbol, inst.id);
      if (!ctx) continue;
      result.symbolsScanned++;

      // Run all 5 modules. Institutional and retail are async (external
      // data fetches); the rest are pure functions over the context.
      const [retail, inst_] = await Promise.all([
        fetchRetailSentiment(ctx),
        computeInstitutionalFlow(ctx),
      ]);
      const liquidity = buildLiquidityMap(ctx);
      const trap = detectTrap({ ctx, inst: inst_, retail });
      const prediction = predictFlow({ ctx, retail, inst: inst_, liquidity, trap });

      // Persist snapshot (always create new row — small table, history
      // matters for trend charts later).
      await prisma.flowSnapshot.create({
        data: {
          instrumentId: inst.id,
          symbol: inst.symbol,
          timeframe: "15m",
          retailLongPct: retail.longPct,
          retailShortPct: retail.shortPct,
          retailCrowding: retail.crowding,
          retailDataSource: retail.source,
          retailBuyScore: retail.buyScore,
          retailSellScore: retail.sellScore,
          institutionalBuyScore: inst_.buyScore,
          institutionalSellScore: inst_.sellScore,
          syntheticCvd: inst_.syntheticCvd,
          vwapPosition: inst_.vwapPosition,
          vwapSlope: inst_.vwapSlope,
          volumeZScore: inst_.volumeZScore,
          oiChange: inst_.oiChange,
          cotNet: inst_.cotNet,
          trapScore: trap.trapScore,
          trapType: trap.trapType,
          finalBias: prediction.finalBias,
          confidence: prediction.confidence,
          invalidation: prediction.invalidation,
          targetLiquidity: prediction.targetLiquidity,
          expectedHoldMinutes: prediction.expectedHoldMinutes,
          narrative: prediction.narrative,
          reasonsJson: JSON.stringify(prediction.reasons),
          session: ctx.session.phase,
          biasState: ctx.structure1h?.bias ?? null,
          metadataJson: JSON.stringify({
            instReasons: inst_.reasons,
            trapReasons: trap.reasons,
            cvdSource: inst_.cvdSource,
            cvdTradeCount: inst_.cvdTradeCount,
            cvdWindowMs: inst_.cvdWindowMs,
            liquidity: {
              nearestAbove: liquidity.nearestAbove,
              nearestBelow: liquidity.nearestBelow,
              zoneCount: liquidity.zones.length,
            },
          }),
        },
      });
      result.snapshotsPersisted++;

      // Persist new LiquidityZones (skip duplicates by fingerprint).
      for (const zone of liquidity.zones) {
        // Skip the brain's existing LiquidityLevel mirrors — they're
        // already maintained elsewhere.
        if ((zone.metadata as Record<string, unknown> | undefined)?.source === "liquidity_level") continue;
        const fingerprint = `${inst.symbol}|${zone.zoneType}|${zone.direction ?? ""}|${zone.priceLow.toFixed(5)}|${zone.priceHigh.toFixed(5)}`;
        const existing = await prisma.liquidityZone.findFirst({
          where: { symbol: inst.symbol, zoneType: zone.zoneType, priceLow: zone.priceLow, priceHigh: zone.priceHigh },
          select: { id: true },
        });
        if (existing) continue;
        await prisma.liquidityZone.create({
          data: {
            instrumentId: inst.id,
            symbol: inst.symbol,
            timeframe: String((zone.metadata as Record<string, unknown> | undefined)?.timeframeMinutes ?? "15"),
            zoneType: zone.zoneType,
            direction: zone.direction,
            priceLow: zone.priceLow,
            priceHigh: zone.priceHigh,
            strengthScore: zone.strengthScore,
            formedAt: zone.formedAt,
            metadataJson: zone.metadata ? JSON.stringify(zone.metadata) : null,
          },
        });
        result.zonesAdded++;
        void fingerprint;
      }

      // Update filled / violated state for existing zones based on latest close.
      const latest = ctx.candles5m[ctx.candles5m.length - 1];
      if (latest) {
        const updates = await prisma.liquidityZone.findMany({
          where: { symbol: inst.symbol, isFilled: false, isViolated: false },
        });
        for (const z of updates) {
          const inZone = latest.high >= z.priceLow && latest.low <= z.priceHigh;
          const violated = z.direction === "bullish" ? latest.close < z.priceLow
                         : z.direction === "bearish" ? latest.close > z.priceHigh
                         : false;
          if (inZone && !z.isFilled) {
            await prisma.liquidityZone.update({ where: { id: z.id }, data: { isFilled: true } });
            result.zonesFilled++;
          }
          if (violated) {
            await prisma.liquidityZone.update({ where: { id: z.id }, data: { isViolated: true } });
            result.zonesViolated++;
          }
        }
      }
    } catch (err) {
      result.errors.push(`${inst.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

async function buildFlowContext(symbol: string, instrumentId: string): Promise<FlowContext | null> {
  // Brain candles use canonical timeframe names: "5min", "15min", "1h",
  // "4h", "1day". 5min is only persisted for crypto + indices + oil;
  // FX and metals top out at 15min. We prefer 5min where it exists and
  // fall back to 15min so every MVP instrument gets a context.
  const [c5min, c15min, c1h, c4h, sweeps, levels, ind5min, ind15min, ind1h, structure1h, structure15m, structure5m] = await Promise.all([
    prisma.candle.findMany({ where: { symbol, timeframe: "5min",  isClosed: true }, orderBy: { openTime: "desc" }, take: 100, select: { openTime: true, open: true, high: true, low: true, close: true, volume: true } }),
    prisma.candle.findMany({ where: { symbol, timeframe: "15min", isClosed: true }, orderBy: { openTime: "desc" }, take: 80, select:  { openTime: true, open: true, high: true, low: true, close: true, volume: true } }),
    prisma.candle.findMany({ where: { symbol, timeframe: "1h",    isClosed: true }, orderBy: { openTime: "desc" }, take: 80, select:  { openTime: true, open: true, high: true, low: true, close: true, volume: true } }),
    prisma.candle.findMany({ where: { symbol, timeframe: "4h",    isClosed: true }, orderBy: { openTime: "desc" }, take: 30, select:  { openTime: true, open: true, high: true, low: true, close: true, volume: true } }),
    prisma.liquidityEvent.findMany({ where: { symbol, timeframe: { in: ["5min", "15min", "1h"] } }, orderBy: { detectedAt: "desc" }, take: 5 }),
    prisma.liquidityLevel.findMany({ where: { symbol, status: "active" } }),
    prisma.indicatorSnapshot.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "5min"  } }, select: { atr14: true } }),
    prisma.indicatorSnapshot.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "15min" } }, select: { atr14: true } }),
    prisma.indicatorSnapshot.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "1h"    } }, select: { atr14: true } }),
    prisma.structureState.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "1h"    } }, select: { bias: true, lastEventType: true } }),
    prisma.structureState.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "15min" } }, select: { bias: true, lastEventType: true } }),
    prisma.structureState.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "5min"  } }, select: { bias: true, lastEventType: true } }),
  ]);

  // Primary intraday TF: 5min when available (12+ bars), 15min otherwise.
  // 12 bars covers ~1h on 5min or ~3h on 15min — enough for VWAP,
  // synthetic CVD, recent structure read.
  const intradayCandles = c5min.length >= 12 ? c5min : c15min;
  const intradayAtr = c5min.length >= 12 ? (ind5min?.atr14 ?? null) : (ind15min?.atr14 ?? null);
  if (intradayCandles.length < 12 || c1h.length < 5) return null;

  const candles5m  = intradayCandles.reverse();
  const candles15m = c15min.reverse();
  const candles1h  = c1h.reverse();
  const candles4h  = c4h.reverse();

  const vwap = computeAnchoredVwap(candles5m, ind1h?.atr14 ?? null);
  const session = classifySession();

  return {
    symbol,
    instrumentId,
    candles5m, candles15m, candles1h, candles4h,
    atr5m: intradayAtr,
    atr15m: ind15min?.atr14 ?? null,
    atr1h: ind1h?.atr14 ?? null,
    vwap,
    session,
    recentSweeps: sweeps.map((s) => ({
      detectedAt: s.detectedAt,
      sweepDirection: s.sweepDirection,
      sweepHigh: s.sweepHigh,
      sweepLow: s.sweepLow,
      sweepClose: s.sweepClose,
      levelType: s.levelType,
      levelPrice: s.levelPrice,
      reversalStrength: s.reversalStrength,
    })),
    activeLevels: levels.map((l) => ({ levelType: l.levelType, price: l.price })),
    structure1h, structure15m, structure5m,
  };
}
