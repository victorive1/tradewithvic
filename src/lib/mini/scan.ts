// Mini Scan Orchestrator — top-level entry point invoked by the
// /api/cron/mini-scan route every 2 minutes. For each active instrument:
//   1. Build the MiniContext (load candles, structure, sweeps, levels,
//      compute bias).
//   2. Run every registered template against the context.
//   3. Dedupe against the most-recent active MiniSignal for the same
//      (symbol, template, direction) — don't re-create if the previous
//      one is still alive.
//   4. Persist new signals + their score breakdown + the initial
//      lifecycle event ("scanning → forming" or directly to
//      "waiting_for_entry" / "entry_active" depending on entryType).
//   5. Mark expired any signal whose validUntil has passed without
//      an entry transition.

import { prisma } from "@/lib/prisma";
import { computeIntradayBias } from "@/lib/mini/bias";
import { tickLifecycle } from "@/lib/mini/lifecycle";
import { tickSmartExit } from "@/lib/mini/smart-exit";
import { detectLiquiditySweepReversal } from "@/lib/mini/templates/liquidity-sweep-reversal";
import { detectIntradayTrendContinuation } from "@/lib/mini/templates/intraday-trend-continuation";
import { detectBreakoutRetest } from "@/lib/mini/templates/breakout-retest";
import { detectVwapReclaim } from "@/lib/mini/templates/vwap-reclaim";
import { detectInverseFvgFlip } from "@/lib/mini/templates/inverse-fvg-flip";
import { detectCompressionBreakout } from "@/lib/mini/templates/compression-breakout";
import { detectNewsCooldownContinuation } from "@/lib/mini/templates/news-cooldown-continuation";
import type { DetectedMiniSetup, MiniContext } from "@/lib/mini/types";

const TEMPLATES = [
  { id: "liquidity_sweep_reversal",      run: detectLiquiditySweepReversal },
  { id: "intraday_trend_continuation",   run: detectIntradayTrendContinuation },
  { id: "breakout_retest",               run: detectBreakoutRetest },
  { id: "vwap_reclaim",                  run: detectVwapReclaim },
  { id: "inverse_fvg_flip",              run: detectInverseFvgFlip },
  { id: "compression_breakout",          run: detectCompressionBreakout },
  { id: "news_cooldown_continuation",    run: detectNewsCooldownContinuation },
];

export interface MiniScanResult {
  symbolsScanned: number;
  detected: number;
  persisted: number;
  expired: number;
  lifecycleTransitions: number;
  smartExitAlerts: number;
  errors: string[];
}

export async function runMiniScan(): Promise<MiniScanResult> {
  const result: MiniScanResult = {
    symbolsScanned: 0, detected: 0, persisted: 0, expired: 0, lifecycleTransitions: 0, smartExitAlerts: 0, errors: [],
  };

  // 1. Lifecycle first — promote/demote based on price moves since last cycle.
  try {
    const lc = await tickLifecycle();
    result.lifecycleTransitions = lc.transitions;
    result.expired += lc.expired;
    result.errors.push(...lc.errors);
  } catch (err) {
    result.errors.push(`lifecycle: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Smart Exit pass on entry_active / in_trade signals.
  try {
    const se = await tickSmartExit();
    result.smartExitAlerts = se.alertsRaised;
    result.errors.push(...se.errors);
  } catch (err) {
    result.errors.push(`smart_exit: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Pull the same instrument set the brain scans. Mini reuses the
  // existing scanTier system so disabling an instrument in the brain
  // also disables it here.
  const instruments = await prisma.instrument.findMany({
    where: { isActive: true },
    orderBy: { scanTier: "asc" },
  });

  // Lifecycle already handled expirations + transitions above. No
  // additional expiry sweep needed here.

  for (const inst of instruments) {
    try {
      const ctx = await buildMiniContext(inst.symbol, inst.id);
      if (!ctx) continue;
      result.symbolsScanned++;

      for (const tmpl of TEMPLATES) {
        let detected: DetectedMiniSetup | null = null;
        try {
          detected = await tmpl.run(ctx);
        } catch (err) {
          result.errors.push(`${inst.symbol}/${tmpl.id}: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
        if (!detected) continue;
        result.detected++;

        // Dedup: skip if there's an alive signal for this same (symbol,
        // template, direction) within entry-zone tolerance.
        const tol = (Math.abs(detected.entryZoneHigh - detected.entryZoneLow) || ctx.atr5m || 0) * 1.5;
        const entryMid = (detected.entryZoneLow + detected.entryZoneHigh) / 2;
        const existing = await prisma.miniSignal.findFirst({
          where: {
            symbol: inst.symbol,
            template: detected.template,
            direction: detected.direction,
            status: { in: ["scanning", "forming", "waiting_for_entry", "entry_active", "in_trade"] },
          },
          select: { id: true, entryZoneLow: true, entryZoneHigh: true },
        });
        if (existing) {
          const existingMid = (existing.entryZoneLow + existing.entryZoneHigh) / 2;
          if (Math.abs(existingMid - entryMid) <= tol) continue;
        }

        // Persist the signal + score + initial lifecycle event in a
        // single transaction so partial writes can't strand orphaned
        // rows (e.g., a MiniSignal without its score breakdown).
        const expiresAt = new Date(Date.now() + detected.validityMinutes * 60 * 1000);
        const initialStatus = detected.entryType === "market" ? "entry_active"
                            : detected.entryType === "no_entry" ? "avoid"
                            : "waiting_for_entry";

        await prisma.$transaction(async (tx) => {
          const signal = await tx.miniSignal.create({
            data: {
              instrumentId: inst.id,
              symbol: inst.symbol,
              template: detected.template,
              direction: detected.direction,
              entryTimeframe: detected.entryTimeframe,
              speedClass: detected.speedClass,
              entryZoneLow: detected.entryZoneLow,
              entryZoneHigh: detected.entryZoneHigh,
              stopLoss: detected.stopLoss,
              takeProfit1: detected.takeProfit1,
              takeProfit2: detected.takeProfit2,
              takeProfit3: detected.takeProfit3,
              entryType: detected.entryType,
              score: sumComponents(detected.components),
              grade: detected.gates.some((g) => g.hard && !g.passed) ? "no_trade"
                   : sumComponents(detected.components) >= 88 ? "A+"
                   : sumComponents(detected.components) >= 78 ? "A"
                   : "watchlist",
              biasState: ctx.bias.state,
              session: ctx.bias.session.phase,
              expectedHoldMinutes: detected.expectedHoldMinutes,
              riskReward: detected.riskReward,
              explanation: detected.explanation,
              invalidation: detected.invalidation,
              status: initialStatus,
              expiresAt,
              metadataJson: JSON.stringify({
                gates: detected.gates,
                bias: { state: ctx.bias.state, conviction: ctx.bias.conviction, reasons: ctx.bias.reasons },
                vwap: { current: ctx.bias.vwap.current, slope: ctx.bias.vwap.slope, position: ctx.bias.vwap.position },
                session: ctx.bias.session,
              }),
            },
          });
          await tx.miniSignalScore.create({
            data: {
              miniSignalId: signal.id,
              biasAlignment:        detected.components.biasAlignment,
              liquidityEvent:       detected.components.liquidityEvent,
              microStructure:       detected.components.microStructure,
              entryZoneQuality:     detected.components.entryZoneQuality,
              momentumDisplacement: detected.components.momentumDisplacement,
              volatilitySpread:     detected.components.volatilitySpread,
              riskReward:           detected.components.riskReward,
              sessionTiming:        detected.components.sessionTiming,
              total:                sumComponents(detected.components),
            },
          });
          await tx.miniSignalLifecycle.create({
            data: {
              miniSignalId: signal.id,
              fromStatus: null,
              toStatus: initialStatus,
              evidence: detected.explanation,
              priceAtEvent: ctx.candles5m[ctx.candles5m.length - 1]?.close ?? null,
              scoreAtEvent: sumComponents(detected.components),
            },
          });
        });
        result.persisted++;
      }
    } catch (err) {
      result.errors.push(`${inst.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

async function buildMiniContext(symbol: string, instrumentId: string): Promise<MiniContext | null> {
  const [candles5m, candles15m, candles1h, sweeps, levels, indicators5m, indicators15m, indicators1h, structure5m, structure15m] = await Promise.all([
    prisma.candle.findMany({ where: { symbol, timeframe: "5m",  isClosed: true }, orderBy: { openTime: "desc" }, take: 80,  select: { openTime: true, open: true, high: true, low: true, close: true, volume: true } }),
    prisma.candle.findMany({ where: { symbol, timeframe: "15m", isClosed: true }, orderBy: { openTime: "desc" }, take: 60,  select: { openTime: true, open: true, high: true, low: true, close: true, volume: true } }),
    prisma.candle.findMany({ where: { symbol, timeframe: "1h",  isClosed: true }, orderBy: { openTime: "desc" }, take: 30,  select: { openTime: true, open: true, high: true, low: true, close: true } }),
    prisma.liquidityEvent.findMany({ where: { symbol, timeframe: { in: ["5m", "15m", "1h"] } }, orderBy: { detectedAt: "desc" }, take: 5 }),
    prisma.liquidityLevel.findMany({ where: { symbol, status: "active" } }),
    prisma.indicatorSnapshot.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "5m"  } }, select: { atr14: true } }),
    prisma.indicatorSnapshot.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "15m" } }, select: { atr14: true } }),
    prisma.indicatorSnapshot.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "1h"  } }, select: { atr14: true } }),
    prisma.structureState.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "5m"  } }, select: { lastEventType: true, lastEventAt: true } }),
    prisma.structureState.findUnique({ where: { symbol_timeframe: { symbol, timeframe: "15m" } }, select: { lastEventType: true, lastEventAt: true } }),
  ]);
  if (candles5m.length < 20 || candles1h.length < 5) return null;

  const c5 = candles5m.reverse();
  const c15 = candles15m.reverse();
  const c1h = candles1h.reverse();

  const bias = await computeIntradayBias({
    symbol,
    candles5m: c5,
    candles1h: c1h,
    atr1h: indicators1h?.atr14 ?? null,
  });

  return {
    symbol,
    instrumentId,
    bias,
    candles5m: c5,
    candles15m: c15,
    candles1h: c1h,
    atr5m: indicators5m?.atr14 ?? null,
    atr15m: indicators15m?.atr14 ?? null,
    atr1h: indicators1h?.atr14 ?? null,
    recentSweeps: sweeps.map((s) => ({
      detectedAt: s.detectedAt,
      sweepCandleTime: s.sweepCandleTime,
      sweepDirection: s.sweepDirection,
      sweepHigh: s.sweepHigh,
      sweepLow: s.sweepLow,
      sweepClose: s.sweepClose,
      levelType: s.levelType,
      levelPrice: s.levelPrice,
      reversalStrength: s.reversalStrength,
    })),
    activeLevels: levels.map((l) => ({ levelType: l.levelType, price: l.price })),
    structureEvents15m: structure15m,
    structureEvents5m: structure5m,
  };
}

function sumComponents(c: DetectedMiniSetup["components"]): number {
  return c.biasAlignment + c.liquidityEvent + c.microStructure + c.entryZoneQuality
       + c.momentumDisplacement + c.volatilitySpread + c.riskReward + c.sessionTiming;
}
