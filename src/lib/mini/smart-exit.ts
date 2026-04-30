// Smart Exit monitor — Mini blueprint § 8.
//
// Walks every entry_active and in_trade signal and raises an alert if
// any of these conditions are present on the latest data:
//   • opposite_choch     — a 5m CHoCH formed against the trade direction
//   • momentum_death     — last 3 5m bars trending opposite the trade dir
//   • time_stall         — price hasn't progressed beyond entry mid for
//                          3-5 candles (5m: 3 bars; 15m: 4 bars; 1h: 5 bars)
//   • spread_spike       — latest 5m range exceeds 2.5× ATR (proxy for spread)
//   • news_approaching   — manual news lockout window will fire within 5 min
//   • opposing_close     — last 5m closed strongly against trade direction
//                          (body ≥ 0.6× ATR opposite)
//   • rejected_before_tp1 — wick beyond entry zone in trade direction
//                           reversed back into zone without reaching TP1
//
// Alerts are persisted to MiniSmartExit. The UI renders open alerts on
// the signal card so the trader can decide to exit early.

import { prisma } from "@/lib/prisma";
import { classifySession } from "@/lib/mini/session";

export interface SmartExitResult {
  examined: number;
  alertsRaised: number;
  alertsResolved: number;
  errors: string[];
}

export async function tickSmartExit(): Promise<SmartExitResult> {
  const result: SmartExitResult = { examined: 0, alertsRaised: 0, alertsResolved: 0, errors: [] };

  const live = await prisma.miniSignal.findMany({
    where: { status: { in: ["entry_active", "in_trade"] } },
    take: 200,
  });

  for (const sig of live) {
    result.examined++;
    try {
      const [candles5m, structure5m, indicators5m] = await Promise.all([
        prisma.candle.findMany({
          where: { symbol: sig.symbol, timeframe: "5m", isClosed: true },
          orderBy: { openTime: "desc" },
          take: 6,
          select: { open: true, high: true, low: true, close: true, openTime: true },
        }),
        prisma.structureState.findUnique({
          where: { symbol_timeframe: { symbol: sig.symbol, timeframe: "5m" } },
          select: { lastEventType: true, lastEventAt: true },
        }),
        prisma.indicatorSnapshot.findUnique({
          where: { symbol_timeframe: { symbol: sig.symbol, timeframe: "5m" } },
          select: { atr14: true },
        }),
      ]);
      if (candles5m.length < 4) continue;
      const recent = candles5m.reverse();
      const last = recent[recent.length - 1];
      const isBull = sig.direction === "bullish" || sig.direction === "buy" || sig.direction === "long";
      const atr = indicators5m?.atr14 ?? null;

      // Existing unresolved alerts on this signal — used to avoid
      // duplicate alerts on consecutive ticks.
      const existing = await prisma.miniSmartExit.findMany({
        where: { miniSignalId: sig.id, resolved: false },
        select: { alertType: true, id: true },
      });
      const haveAlert = (t: string) => existing.some((e) => e.alertType === t);

      const newAlerts: Array<{ alertType: string; severity: "warning" | "critical"; evidence: string }> = [];

      // 1. opposite_choch
      const expectedOppositeChoch = isBull ? "choch_bearish" : "choch_bullish";
      const chochAge = structure5m?.lastEventAt ? (Date.now() - new Date(structure5m.lastEventAt).getTime()) / 60_000 : Infinity;
      if (structure5m?.lastEventType === expectedOppositeChoch && chochAge <= 10 && !haveAlert("opposite_choch")) {
        newAlerts.push({
          alertType: "opposite_choch",
          severity: "critical",
          evidence: `5m ${expectedOppositeChoch} ~${Math.round(chochAge)}m ago`,
        });
      }

      // 2. momentum_death — last 3 bars trending opposite trade dir
      const last3 = recent.slice(-3);
      const opposingMomentum = isBull
        ? last3.every((c) => c.close < c.open)
        : last3.every((c) => c.close > c.open);
      if (opposingMomentum && !haveAlert("momentum_death")) {
        newAlerts.push({
          alertType: "momentum_death",
          severity: "warning",
          evidence: `3 consecutive ${isBull ? "bearish" : "bullish"} 5m bars`,
        });
      }

      // 3. time_stall — price not making progress past entry mid
      const entryMid = (sig.entryZoneLow + sig.entryZoneHigh) / 2;
      const stallBars = sig.entryTimeframe === "5m" ? 3 : sig.entryTimeframe === "15m" ? 4 : 5;
      const stallSlice = recent.slice(-stallBars);
      const noProgress = isBull
        ? stallSlice.every((c) => c.close <= entryMid + (atr ?? 0) * 0.1)
        : stallSlice.every((c) => c.close >= entryMid - (atr ?? 0) * 0.1);
      if (stallSlice.length >= stallBars && noProgress && !haveAlert("time_stall")) {
        newAlerts.push({
          alertType: "time_stall",
          severity: "warning",
          evidence: `${stallBars} ${sig.entryTimeframe} bars without progress past entry mid ${entryMid.toFixed(5)}`,
        });
      }

      // 4. spread_spike — latest range > 2.5× ATR (proxy)
      if (atr != null && atr > 0) {
        const range = last.high - last.low;
        if (range > atr * 2.5 && !haveAlert("spread_spike")) {
          newAlerts.push({
            alertType: "spread_spike",
            severity: "warning",
            evidence: `latest 5m range ${range.toFixed(5)} = ${(range / atr).toFixed(2)}× ATR`,
          });
        }
      }

      // 5. news_approaching — check if any news lockout window starts in next 5 min
      const env = process.env.MINI_NEWS_LOCKOUT_WINDOWS;
      if (env && !haveAlert("news_approaching")) {
        const now = new Date();
        const horizon = new Date(now.getTime() + 5 * 60 * 1000);
        const horizonH = horizon.getUTCHours();
        const horizonM = horizon.getUTCMinutes();
        for (const range of env.split(",")) {
          const [a] = range.split("-");
          if (!a) continue;
          const [ah, am] = a.split(":").map((x) => parseInt(x, 10));
          if (Number.isFinite(ah) && Number.isFinite(am)) {
            const startMin = ah * 60 + am;
            const horizonMin = horizonH * 60 + horizonM;
            const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
            if (startMin > nowMin && startMin <= horizonMin) {
              newAlerts.push({
                alertType: "news_approaching",
                severity: "critical",
                evidence: `news lockout window starts at ${a} UTC (in ${startMin - nowMin}m)`,
              });
              break;
            }
          }
        }
      }

      // 6. opposing_close — last 5m closed strongly against trade dir
      if (atr != null && atr > 0) {
        const body = Math.abs(last.close - last.open);
        const opposingDir = isBull ? last.close < last.open : last.close > last.open;
        if (opposingDir && body >= atr * 0.6 && !haveAlert("opposing_close")) {
          newAlerts.push({
            alertType: "opposing_close",
            severity: "critical",
            evidence: `last 5m body ${body.toFixed(5)} = ${(body / atr).toFixed(2)}× ATR opposing direction`,
          });
        }
      }

      // 7. rejected_before_tp1 — for in_trade only: wick beyond entry-mid
      // in trade direction reversed back without reaching TP1
      if (sig.status === "in_trade") {
        const wickReachedTowardTp1 = isBull
          ? last.high >= entryMid + Math.abs(sig.takeProfit1 - entryMid) * 0.5
          : last.low <= entryMid - Math.abs(sig.takeProfit1 - entryMid) * 0.5;
        const closedBackInZone = last.close >= sig.entryZoneLow && last.close <= sig.entryZoneHigh;
        if (wickReachedTowardTp1 && closedBackInZone && !haveAlert("rejected_before_tp1")) {
          newAlerts.push({
            alertType: "rejected_before_tp1",
            severity: "warning",
            evidence: `price reached 50% to TP1 then closed back inside entry zone`,
          });
        }
      }

      for (const a of newAlerts) {
        await prisma.miniSmartExit.create({
          data: {
            miniSignalId: sig.id,
            alertType: a.alertType,
            severity: a.severity,
            evidence: a.evidence,
          },
        });
        result.alertsRaised++;
      }

      // Auto-resolve alerts whose conditions no longer hold (mostly the
      // momentum_death type — if the next 3 bars flip, the warning is stale).
      // Conservative: only resolve momentum_death when 2 consecutive bars
      // print in trade direction.
      if (haveAlert("momentum_death")) {
        const last2 = recent.slice(-2);
        const recovered = isBull
          ? last2.every((c) => c.close > c.open)
          : last2.every((c) => c.close < c.open);
        if (recovered) {
          const stale = existing.find((e) => e.alertType === "momentum_death");
          if (stale) {
            await prisma.miniSmartExit.update({
              where: { id: stale.id },
              data: { resolved: true, resolvedAt: new Date() },
            });
            result.alertsResolved++;
          }
        }
      }
    } catch (err) {
      result.errors.push(`${sig.symbol}/${sig.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

export async function getOpenSmartExitAlerts(miniSignalId: string) {
  return prisma.miniSmartExit.findMany({
    where: { miniSignalId, resolved: false },
    orderBy: { raisedAt: "desc" },
  });
}

void classifySession; // referenced for future news_approaching enhancement
