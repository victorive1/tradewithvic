// Daily-aggregate maintenance for the trade journal.
//
// TradeJournalDay caches per-day totals (P&L / trades / wins / losses) so
// the calendar view doesn't have to re-aggregate the entry table on every
// page load. We refresh those totals every time an entry is created /
// updated / deleted for that day.
//
// Treats date as UTC. Day key is the YYYY-MM-DD prefix of the trade's
// closedAt (or openedAt if still open). Open trades don't contribute to
// PnL totals — the cached PnL only counts closed wins/losses.

import { prisma } from "@/lib/prisma";

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function refreshDayAggregate(userId: string, date: string): Promise<void> {
  // Re-sum from journal entries for this user+day. We use openedAt's UTC
  // date for grouping — feels natural to the trader (a London-session
  // trade opened Tuesday 09:00 UTC counts on Tuesday).
  const startUTC = new Date(`${date}T00:00:00.000Z`);
  const endUTC = new Date(`${date}T23:59:59.999Z`);
  const entries = await prisma.tradeJournalEntry.findMany({
    where: {
      userId,
      openedAt: { gte: startUTC, lte: endUTC },
    },
    select: { realizedPnl: true, closedAt: true, outcome: true },
  });
  let pnl = 0;
  let wins = 0;
  let losses = 0;
  let closedTrades = 0;
  for (const e of entries) {
    // Count W/L if either an explicit outcome is set, OR a closed trade
    // has realizedPnl. Explicit outcome wins ties — the user's intent is
    // the source of truth (they may call a small green close a "loss"
    // because they broke a rule).
    if (e.outcome === "win" || e.outcome === "loss") {
      if (e.outcome === "win") wins++;
      else losses++;
      if (e.realizedPnl != null && e.closedAt) {
        closedTrades++;
        pnl += e.realizedPnl;
      }
      continue;
    }
    if (e.realizedPnl == null || !e.closedAt) continue;
    closedTrades++;
    pnl += e.realizedPnl;
    if (e.realizedPnl > 0) wins++;
    else if (e.realizedPnl < 0) losses++;
  }
  await prisma.tradeJournalDay.upsert({
    where: { userId_date: { userId, date } },
    update: { pnl, trades: entries.length, wins, losses },
    create: { userId, date, pnl, trades: entries.length, wins, losses },
  });
  void closedTrades; // tracked for future "closed-only" daily metrics
}
