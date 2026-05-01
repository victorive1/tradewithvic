// Lifecycle State Machine — Mini blueprint § 7.
//
// Runs every scan cycle (2 min) AFTER the templates have created any
// new signals. Walks every alive MiniSignal and updates its status
// based on current price. Each state transition gets persisted to
// MiniSignalLifecycle for the audit timeline.
//
// State graph:
//
//   scanning / forming
//        │
//        ▼
//   waiting_for_entry  ──── price ran past TP1 before entry → missed_move
//        │
//        ▼ (price entered the zone)
//   entry_active       ──── SL touched before TP → invalidated
//        │
//        ▼ (price exited zone in trade direction)
//   in_trade
//        │
//        ├── price reaches TP1 → tp1_hit
//        ├── price reaches TP2 → tp2_hit
//        ├── price reaches TP3 → tp3_hit
//        ├── price hits SL     → invalidated
//        └── expires_at passes → expired
//
// "scanning" and "forming" never auto-promote here — they only exist
// for the brief window between detection and the first lifecycle pass,
// or for templates that surface borderline signals waiting for a
// confirmation event. The scan orchestrator currently jumps straight
// to waiting_for_entry / entry_active so this manager mostly drives
// the entry → in-trade → close transitions.

import { prisma } from "@/lib/prisma";

export interface LifecycleResult {
  examined: number;
  transitions: number;
  expired: number;
  errors: string[];
}

export async function tickLifecycle(): Promise<LifecycleResult> {
  const result: LifecycleResult = { examined: 0, transitions: 0, expired: 0, errors: [] };

  const alive = await prisma.miniSignal.findMany({
    where: {
      status: { in: ["scanning", "forming", "waiting_for_entry", "entry_active", "in_trade"] },
      expiresAt: { gt: new Date() },
    },
    take: 500,
  });

  for (const sig of alive) {
    result.examined++;
    try {
      // Pull latest 5m close. If we don't have a fresh candle yet, skip.
      const latest5m = await prisma.candle.findFirst({
        where: { symbol: sig.symbol, timeframe: "5min", isClosed: true },
        orderBy: { openTime: "desc" },
        select: { close: true, high: true, low: true, openTime: true },
      });
      if (!latest5m) continue;

      const transition = computeTransition(sig, latest5m);
      if (!transition) continue;

      await prisma.$transaction([
        prisma.miniSignal.update({
          where: { id: sig.id },
          data: { status: transition.toStatus },
        }),
        prisma.miniSignalLifecycle.create({
          data: {
            miniSignalId: sig.id,
            fromStatus: sig.status,
            toStatus: transition.toStatus,
            evidence: transition.evidence,
            priceAtEvent: latest5m.close,
            scoreAtEvent: sig.score,
          },
        }),
      ]);
      result.transitions++;
    } catch (err) {
      result.errors.push(`${sig.symbol}/${sig.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Expire any signals whose validity passed without resolving — separate
  // pass so the lifecycle log gets the explicit "expired" row.
  //
  // pre-trigger statuses (scanning/forming/waiting_for_entry): expire
  //   immediately once expiresAt passes.
  // active-trade statuses (entry_active/in_trade): expire 60 min
  //   beyond expiresAt — gives a real held trade a buffer before the
  //   system force-closes it off the live feed. Without this, signals
  //   that reached entry_active and never hit TP/SL stayed alive
  //   forever, polluting the feed (125+ stuck rows shipped this way).
  const overdue = await prisma.miniSignal.findMany({
    where: {
      OR: [
        { status: { in: ["scanning", "forming", "waiting_for_entry"] }, expiresAt: { lt: new Date() } },
        { status: { in: ["entry_active", "in_trade"] }, expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
      ],
    },
    take: 500,
  });
  for (const sig of overdue) {
    try {
      await prisma.$transaction([
        prisma.miniSignal.update({ where: { id: sig.id }, data: { status: "expired" } }),
        prisma.miniSignalLifecycle.create({
          data: {
            miniSignalId: sig.id,
            fromStatus: sig.status,
            toStatus: "expired",
            evidence: `validity window (${sig.expectedHoldMinutes}m) elapsed without entry trigger`,
          },
        }),
      ]);
      result.expired++;
    } catch (err) {
      result.errors.push(`expire ${sig.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

interface Transition { toStatus: string; evidence: string; }

function computeTransition(
  sig: { status: string; direction: string; entryZoneLow: number; entryZoneHigh: number; stopLoss: number; takeProfit1: number; takeProfit2: number | null; takeProfit3: number | null; entryType: string },
  candle: { close: number; high: number; low: number; openTime: Date },
): Transition | null {
  const isBull = sig.direction === "bullish" || sig.direction === "buy" || sig.direction === "long";
  const inZone = candle.high >= sig.entryZoneLow && candle.low <= sig.entryZoneHigh;
  const slHit = isBull ? candle.low <= sig.stopLoss : candle.high >= sig.stopLoss;
  const tp1Hit = isBull ? candle.high >= sig.takeProfit1 : candle.low <= sig.takeProfit1;
  const tp2Hit = sig.takeProfit2 != null && (isBull ? candle.high >= sig.takeProfit2 : candle.low <= sig.takeProfit2);
  const tp3Hit = sig.takeProfit3 != null && (isBull ? candle.high >= sig.takeProfit3 : candle.low <= sig.takeProfit3);

  switch (sig.status) {
    case "scanning":
    case "forming":
      // Promote to waiting_for_entry on first lifecycle pass — gives the
      // scanner one cycle to refine the signal before it goes live.
      return { toStatus: "waiting_for_entry", evidence: "lifecycle promoted from initial state" };

    case "waiting_for_entry":
      // If price ran past TP1 before reaching the zone, mark missed.
      if (tp1Hit && !inZone) {
        return { toStatus: "missed_move", evidence: `TP1 ${sig.takeProfit1.toFixed(5)} reached before entry zone tap` };
      }
      // If price entered the zone, promote to entry_active.
      if (inZone) {
        return { toStatus: "entry_active", evidence: `price entered zone [${sig.entryZoneLow.toFixed(5)}-${sig.entryZoneHigh.toFixed(5)}]` };
      }
      // SL touched before zone (rare — usually zone is between current
      // price and SL): mark invalidated.
      if (slHit) {
        return { toStatus: "invalidated", evidence: `SL ${sig.stopLoss.toFixed(5)} touched before entry` };
      }
      return null;

    case "entry_active":
      if (slHit) return { toStatus: "invalidated", evidence: `SL ${sig.stopLoss.toFixed(5)} touched while entry active` };
      // Once price exits the zone in trade direction, promote to in_trade.
      const exitedInDirection = isBull
        ? candle.close > sig.entryZoneHigh
        : candle.close < sig.entryZoneLow;
      if (exitedInDirection) {
        return { toStatus: "in_trade", evidence: `price exited zone in trade direction, last close ${candle.close.toFixed(5)}` };
      }
      // TP1 reached while still in zone (rare, but possible for thin zones).
      if (tp1Hit) return { toStatus: "tp1_hit", evidence: `TP1 ${sig.takeProfit1.toFixed(5)} reached from zone` };
      return null;

    case "in_trade":
      if (tp3Hit) return { toStatus: "tp3_hit", evidence: `TP3 reached: ${sig.takeProfit3?.toFixed(5)}` };
      if (tp2Hit) return { toStatus: "tp2_hit", evidence: `TP2 reached: ${sig.takeProfit2?.toFixed(5)}` };
      if (tp1Hit) return { toStatus: "tp1_hit", evidence: `TP1 reached: ${sig.takeProfit1.toFixed(5)}` };
      if (slHit)  return { toStatus: "invalidated", evidence: `SL ${sig.stopLoss.toFixed(5)} touched while in trade` };
      return null;

    default:
      return null;
  }
}
