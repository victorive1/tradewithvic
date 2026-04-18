import { prisma } from "@/lib/prisma";

interface CandleRow {
  openTime: Date;
  high: number;
  low: number;
  close: number;
}

interface SetupRow {
  id: string;
  symbol: string;
  timeframe: string;
  direction: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  riskReward: number;
  status: string;
  validUntil: Date | null;
  createdAt: Date;
}

interface LifecycleState {
  triggered: boolean;
  triggeredAt: Date | null;
  tp1Hit: boolean;
  tp1HitAt: Date | null;
  tp2Hit: boolean;
  tp2HitAt: Date | null;
  tp3Hit: boolean;
  tp3HitAt: Date | null;
  slHit: boolean;
  slHitAt: Date | null;
  expired: boolean;
  neverTriggered: boolean;
  mfe: number;
  mae: number;
  barsToTrigger: number | null;
  barsToTp1: number | null;
  barsToSl: number | null;
}

function simulate(setup: SetupRow, candles: CandleRow[]): LifecycleState {
  const isBull = setup.direction === "bullish";
  const entryTolerance = Math.abs(setup.entry) * 0.0008; // 0.08% zone tolerance

  const state: LifecycleState = {
    triggered: false, triggeredAt: null,
    tp1Hit: false, tp1HitAt: null,
    tp2Hit: false, tp2HitAt: null,
    tp3Hit: false, tp3HitAt: null,
    slHit: false, slHitAt: null,
    expired: false, neverTriggered: false,
    mfe: 0, mae: 0,
    barsToTrigger: null, barsToTp1: null, barsToSl: null,
  };

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!state.triggered) {
      const touched = isBull
        ? c.low <= setup.entry + entryTolerance
        : c.high >= setup.entry - entryTolerance;
      if (touched) {
        state.triggered = true;
        state.triggeredAt = c.openTime;
        state.barsToTrigger = i;
      } else {
        continue;
      }
    }

    // After triggered, track excursions + SL/TP
    const entry = setup.entry;
    const favorable = isBull ? c.high - entry : entry - c.low;
    const adverse = isBull ? entry - c.low : c.high - entry;
    if (favorable > state.mfe) state.mfe = favorable;
    if (adverse > state.mae) state.mae = adverse;

    const hitSL = isBull ? c.low <= setup.stopLoss : c.high >= setup.stopLoss;
    if (hitSL && !state.slHit) {
      state.slHit = true;
      state.slHitAt = c.openTime;
      state.barsToSl = state.barsToTrigger !== null ? i - state.barsToTrigger : null;
    }

    const hitTp1 = isBull ? c.high >= setup.takeProfit1 : c.low <= setup.takeProfit1;
    if (hitTp1 && !state.tp1Hit) {
      state.tp1Hit = true;
      state.tp1HitAt = c.openTime;
      state.barsToTp1 = state.barsToTrigger !== null ? i - state.barsToTrigger : null;
    }

    if (setup.takeProfit2 !== null) {
      const hitTp2 = isBull ? c.high >= setup.takeProfit2 : c.low <= setup.takeProfit2;
      if (hitTp2 && !state.tp2Hit) {
        state.tp2Hit = true;
        state.tp2HitAt = c.openTime;
      }
    }
    if (setup.takeProfit3 !== null) {
      const hitTp3 = isBull ? c.high >= setup.takeProfit3 : c.low <= setup.takeProfit3;
      if (hitTp3 && !state.tp3Hit) {
        state.tp3Hit = true;
        state.tp3HitAt = c.openTime;
      }
    }

    if (state.slHit) break; // canonical exit
  }

  if (!state.triggered && setup.validUntil && setup.validUntil.getTime() < Date.now()) {
    state.expired = true;
    state.neverTriggered = true;
  } else if (state.triggered && !state.slHit && !state.tp1Hit && setup.validUntil && setup.validUntil.getTime() < Date.now()) {
    state.expired = true;
  }

  return state;
}

function classifyOutcome(state: LifecycleState): { outcomeClass: string; outcomeScore: number } {
  if (state.neverTriggered) return { outcomeClass: "invalid", outcomeScore: 0 };
  if (state.tp3Hit) return { outcomeClass: "excellent", outcomeScore: 95 };
  if (state.tp2Hit) return { outcomeClass: "excellent", outcomeScore: 80 };
  if (state.tp1Hit && !state.slHit) return { outcomeClass: "good", outcomeScore: 65 };
  if (state.slHit && !state.tp1Hit) return { outcomeClass: "poor", outcomeScore: 10 };
  if (state.slHit && state.tp1Hit) return { outcomeClass: "neutral", outcomeScore: 45 };
  if (state.expired) return { outcomeClass: "neutral", outcomeScore: 40 };
  return { outcomeClass: "neutral", outcomeScore: 50 };
}

export interface TrackingResult {
  tracked: number;
  labeled: number;
  closed: number;
  expired: number;
}

export async function trackAllSetups(): Promise<TrackingResult> {
  const setups: SetupRow[] = await prisma.tradeSetup.findMany({
    where: { status: { in: ["active", "filled"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, symbol: true, timeframe: true, direction: true,
      entry: true, stopLoss: true,
      takeProfit1: true, takeProfit2: true, takeProfit3: true,
      riskReward: true, status: true, validUntil: true, createdAt: true,
    },
  });

  if (setups.length === 0) return { tracked: 0, labeled: 0, closed: 0, expired: 0 };

  let labeled = 0, closed = 0, expired = 0;

  for (const setup of setups) {
    const candles = await prisma.candle.findMany({
      where: {
        symbol: setup.symbol,
        timeframe: setup.timeframe,
        openTime: { gte: setup.createdAt },
        isClosed: true,
      },
      orderBy: { openTime: "asc" },
      select: { openTime: true, high: true, low: true, close: true },
    });

    if (candles.length === 0 && !(setup.validUntil && setup.validUntil.getTime() < Date.now())) {
      continue;
    }

    const state = simulate(setup, candles as CandleRow[]);
    const outcome = classifyOutcome(state);

    const decisionLog = await prisma.setupDecisionLog.findFirst({
      where: { setupId: setup.id },
      orderBy: { createdAt: "desc" },
    });

    if (!decisionLog) continue; // Setup wasn't qualified by Layer 2 yet

    const terminal = state.slHit || state.tp1Hit || state.expired || state.neverTriggered;
    if (terminal) {
      await prisma.setupOutcome.upsert({
        where: { setupDecisionLogId: decisionLog.id },
        create: {
          setupDecisionLogId: decisionLog.id,
          triggered: state.triggered,
          entryTriggeredAt: state.triggeredAt ?? undefined,
          tp1Hit: state.tp1Hit,
          tp1HitAt: state.tp1HitAt ?? undefined,
          tp2Hit: state.tp2Hit,
          tp2HitAt: state.tp2HitAt ?? undefined,
          tp3Hit: state.tp3Hit,
          tp3HitAt: state.tp3HitAt ?? undefined,
          slHit: state.slHit,
          slHitAt: state.slHitAt ?? undefined,
          expired: state.expired,
          neverTriggered: state.neverTriggered,
          maxFavorableExcursion: state.mfe,
          maxAdverseExcursion: state.mae,
          barsToTrigger: state.barsToTrigger ?? undefined,
          barsToTp1: state.barsToTp1 ?? undefined,
          barsToSl: state.barsToSl ?? undefined,
          outcomeClass: outcome.outcomeClass,
          outcomeScore: outcome.outcomeScore,
          labelQuality: candles.length >= 3 ? "high" : "low",
        },
        update: {
          triggered: state.triggered,
          entryTriggeredAt: state.triggeredAt ?? undefined,
          tp1Hit: state.tp1Hit,
          tp1HitAt: state.tp1HitAt ?? undefined,
          tp2Hit: state.tp2Hit,
          tp2HitAt: state.tp2HitAt ?? undefined,
          tp3Hit: state.tp3Hit,
          tp3HitAt: state.tp3HitAt ?? undefined,
          slHit: state.slHit,
          slHitAt: state.slHitAt ?? undefined,
          expired: state.expired,
          neverTriggered: state.neverTriggered,
          maxFavorableExcursion: state.mfe,
          maxAdverseExcursion: state.mae,
          outcomeClass: outcome.outcomeClass,
          outcomeScore: outcome.outcomeScore,
        },
      });
      labeled++;

      const newStatus = state.slHit || state.tp2Hit || state.tp3Hit
        ? "closed"
        : state.expired ? "expired" : "filled";
      if (newStatus !== setup.status) {
        await prisma.tradeSetup.update({
          where: { id: setup.id },
          data: { status: newStatus },
        });
        if (newStatus === "closed") closed++;
        if (newStatus === "expired") expired++;
      }
    } else if (state.triggered && setup.status !== "filled") {
      await prisma.tradeSetup.update({
        where: { id: setup.id },
        data: { status: "filled" },
      });
    }
  }

  return { tracked: setups.length, labeled, closed, expired };
}
