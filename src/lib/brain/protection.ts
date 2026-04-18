import { prisma } from "@/lib/prisma";

type SmartExitMode = "off" | "conservative" | "balanced" | "aggressive";

interface ProtectionRule {
  closePctOnWeakening: number;
  closePctOnDamaged: number;
  closePctOnInvalidated: number;
  moveToBreakevenOnWeakening: boolean;
  moveToBreakevenOnDamaged: boolean;
  tightenFractionOnWeakening: number; // how much of entry-to-SL distance to remove (0.25 = tighten 25% toward entry)
  tightenFractionOnDamaged: number;
  minSustainedMinutes: number; // noise filter: state must persist this long before acting
}

const RULES: Record<SmartExitMode, ProtectionRule> = {
  off: {
    closePctOnWeakening: 0,
    closePctOnDamaged: 0,
    closePctOnInvalidated: 0,
    moveToBreakevenOnWeakening: false,
    moveToBreakevenOnDamaged: false,
    tightenFractionOnWeakening: 0,
    tightenFractionOnDamaged: 0,
    minSustainedMinutes: 0,
  },
  conservative: {
    closePctOnWeakening: 0,
    closePctOnDamaged: 0,
    closePctOnInvalidated: 100,
    moveToBreakevenOnWeakening: false,
    moveToBreakevenOnDamaged: true,
    tightenFractionOnWeakening: 0.25,
    tightenFractionOnDamaged: 0.5,
    minSustainedMinutes: 4,
  },
  balanced: {
    closePctOnWeakening: 0,
    closePctOnDamaged: 50,
    closePctOnInvalidated: 100,
    moveToBreakevenOnWeakening: false,
    moveToBreakevenOnDamaged: true,
    tightenFractionOnWeakening: 0.33,
    tightenFractionOnDamaged: 0.5,
    minSustainedMinutes: 4,
  },
  aggressive: {
    closePctOnWeakening: 25,
    closePctOnDamaged: 75,
    closePctOnInvalidated: 100,
    moveToBreakevenOnWeakening: true,
    moveToBreakevenOnDamaged: true,
    tightenFractionOnWeakening: 0.5,
    tightenFractionOnDamaged: 0.66,
    minSustainedMinutes: 2,
  },
};

function markPrice(candles: any[]): number | null {
  const latest = candles[candles.length - 1];
  return latest?.close ?? null;
}

interface PositionAction {
  positionId: string;
  actions: string[];
  closedPctAdded: number;
  realizedPnlDelta: number;
  slMoved: boolean;
  closed: boolean;
}

export async function applyAdaptiveProtection(): Promise<{
  processed: number;
  actionsTaken: PositionAction[];
  totalRealizedFromPartials: number;
}> {
  const account = await prisma.executionAccount.findUnique({ where: { name: "paper-default" } });
  if (!account) return { processed: 0, actionsTaken: [], totalRealizedFromPartials: 0 };

  const mode = (account.smartExitMode as SmartExitMode) ?? "balanced";
  const rule = RULES[mode];
  if (mode === "off") return { processed: 0, actionsTaken: [], totalRealizedFromPartials: 0 };

  const positions = await prisma.executionPosition.findMany({ where: { accountId: account.id, status: "open" } });
  const actionsTaken: PositionAction[] = [];
  let totalRealized = 0;

  for (const pos of positions) {
    const action: PositionAction = {
      positionId: pos.id,
      actions: [],
      closedPctAdded: 0,
      realizedPnlDelta: 0,
      slMoved: false,
      closed: false,
    };

    // Noise filter: skip if state recently changed
    const lastCheck = pos.lastThesisCheckAt;
    if (lastCheck && Date.now() - lastCheck.getTime() < rule.minSustainedMinutes * 60_000) {
      continue;
    }

    const candles = await prisma.candle.findMany({
      where: { symbol: pos.symbol, timeframe: pos.timeframe, openTime: { gte: pos.openedAt }, isClosed: true },
      orderBy: { openTime: "asc" },
      select: { openTime: true, close: true, high: true, low: true },
    });
    const mark = markPrice(candles) ?? pos.entry;
    const isBull = pos.direction === "bullish";

    const remainingPct = 100 - pos.closedPct;
    if (remainingPct <= 0) continue;

    // Decide target close percentage based on thesis state
    let targetClosePct = 0;
    if (pos.thesisState === "invalidated") targetClosePct = rule.closePctOnInvalidated;
    else if (pos.thesisState === "damaged") targetClosePct = rule.closePctOnDamaged;
    else if (pos.thesisState === "weakening") targetClosePct = rule.closePctOnWeakening;

    // Partial close
    if (targetClosePct > 0 && targetClosePct > pos.closedPct) {
      const additionalPct = targetClosePct - pos.closedPct;
      const unitsToClose = pos.sizeUnits * (additionalPct / 100);
      const pnlPerUnit = isBull ? mark - pos.entry : pos.entry - mark;
      const realized = unitsToClose * pnlPerUnit;
      totalRealized += realized;

      const fullClose = targetClosePct >= 100;
      await prisma.executionPosition.update({
        where: { id: pos.id },
        data: {
          closedPct: targetClosePct,
          realizedPnl: pos.realizedPnl + realized,
          ...(fullClose && {
            status: "closed",
            closedAt: new Date(),
            exitPrice: mark,
            exitReason: pos.thesisState === "invalidated" ? "thesis_invalidated" : "adaptive_protection",
          }),
        },
      });
      await prisma.executionEvent.create({
        data: {
          positionId: pos.id,
          eventType: fullClose ? "closed_thesis" : "partial_closed",
          price: mark,
          fromValue: `closedPct=${pos.closedPct}`,
          toValue: `closedPct=${targetClosePct}`,
          reason: `${additionalPct.toFixed(0)}% closed at ${mark.toFixed(5)} due to ${pos.thesisState} thesis (mode=${mode}). Realized ${realized.toFixed(2)}.`,
          metadataJson: JSON.stringify({ realized, unitsToClose, pnlPerUnit, thesisScore: pos.thesisScore }),
        },
      });
      action.closedPctAdded = additionalPct;
      action.realizedPnlDelta = realized;
      if (fullClose) {
        action.closed = true;
        action.actions.push(`FULL_CLOSE via ${pos.thesisState}`);
      } else {
        action.actions.push(`partial_close ${additionalPct.toFixed(0)}%`);
      }
    }

    if (action.closed) {
      // Also write an ExecutionTrade summary row
      const durationMinutes = Math.max(1, Math.round((Date.now() - pos.openedAt.getTime()) / 60000));
      const pnlPct = account.startingBalance > 0 ? ((pos.realizedPnl + action.realizedPnlDelta) / account.startingBalance) * 100 : 0;
      const rMultiple = pos.riskAmount > 0 ? (pos.realizedPnl + action.realizedPnlDelta) / pos.riskAmount : 0;
      await prisma.executionTrade.create({
        data: {
          accountId: account.id,
          positionId: pos.id,
          setupId: pos.setupId,
          symbol: pos.symbol,
          timeframe: pos.timeframe,
          direction: pos.direction,
          grade: pos.grade,
          entry: pos.entry,
          exit: mark,
          stopLoss: pos.originalStopLoss,
          sizeUnits: pos.sizeUnits,
          riskAmount: pos.riskAmount,
          realizedPnl: pos.realizedPnl + action.realizedPnlDelta,
          pnlPct,
          rMultiple,
          exitReason: pos.thesisState === "invalidated" ? "thesis_invalidated" : "adaptive_protection",
          openedAt: pos.openedAt,
          closedAt: new Date(),
          durationMinutes,
          mfe: pos.mfe,
          mae: pos.mae,
          maxThesisScore: Math.max(100, pos.thesisScore),
          minThesisScore: pos.thesisScore,
        },
      });
      actionsTaken.push(action);
      continue;
    }

    // Move to break-even if thesis is weakening/damaged (and not already moved)
    const shouldBE =
      (pos.thesisState === "damaged" && rule.moveToBreakevenOnDamaged) ||
      (pos.thesisState === "weakening" && rule.moveToBreakevenOnWeakening);
    if (shouldBE && !pos.movedToBreakeven) {
      const newSL = pos.entry;
      const better = isBull ? newSL > pos.stopLoss : newSL < pos.stopLoss;
      if (better) {
        await prisma.executionPosition.update({
          where: { id: pos.id },
          data: { stopLoss: newSL, movedToBreakeven: true },
        });
        await prisma.executionEvent.create({
          data: {
            positionId: pos.id,
            eventType: "sl_moved_breakeven",
            fromValue: pos.stopLoss.toFixed(5),
            toValue: newSL.toFixed(5),
            reason: `SL moved to break-even due to ${pos.thesisState} thesis.`,
          },
        });
        action.slMoved = true;
        action.actions.push("sl_to_breakeven");
      }
    }

    // Dynamic tightening for weakening / damaged states
    const tightenFrac =
      pos.thesisState === "damaged" ? rule.tightenFractionOnDamaged :
      pos.thesisState === "weakening" ? rule.tightenFractionOnWeakening : 0;

    if (tightenFrac > 0 && !action.slMoved) {
      const distance = Math.abs(pos.entry - pos.stopLoss);
      const tighten = distance * tightenFrac;
      const newSL = isBull ? pos.stopLoss + tighten : pos.stopLoss - tighten;
      const better = isBull ? newSL > pos.stopLoss : newSL < pos.stopLoss;
      if (better) {
        await prisma.executionPosition.update({
          where: { id: pos.id },
          data: { stopLoss: newSL },
        });
        await prisma.executionEvent.create({
          data: {
            positionId: pos.id,
            eventType: "sl_moved_trail",
            fromValue: pos.stopLoss.toFixed(5),
            toValue: newSL.toFixed(5),
            reason: `SL tightened by ${(tightenFrac * 100).toFixed(0)}% due to ${pos.thesisState} thesis (mode=${mode}).`,
          },
        });
        action.slMoved = true;
        action.actions.push(`sl_tightened_${(tightenFrac * 100).toFixed(0)}pct`);
      }
    }

    if (action.actions.length > 0) {
      actionsTaken.push(action);
    }
  }

  // Update account with partial-close realized PnL
  if (totalRealized !== 0) {
    await prisma.executionAccount.update({
      where: { id: account.id },
      data: {
        currentBalance: account.currentBalance + totalRealized,
        totalRealizedPnl: account.totalRealizedPnl + totalRealized,
        dailyPnl: account.dailyPnl + totalRealized,
      },
    });
  }

  return { processed: positions.length, actionsTaken, totalRealizedFromPartials: totalRealized };
}
