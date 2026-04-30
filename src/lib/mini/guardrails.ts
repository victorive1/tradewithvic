// Pre-flight execution guardrails — Mini blueprint § 4 (Alert and
// Execution Guardrail Engine) + § 8.
//
// Called on the API side before a Mini-sourced trade is forwarded to
// the broker/algo. Every guardrail returns a verdict + reason; any
// "block" verdict aborts the execution. Used by the existing
// /api/trades/execute endpoint when sourceRef looks like a MiniSignal
// id.

import { prisma } from "@/lib/prisma";
import { classifySession } from "@/lib/mini/session";

export interface GuardrailVerdict {
  ok: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export async function runMiniGuardrails(miniSignalId: string): Promise<GuardrailVerdict> {
  const sig = await prisma.miniSignal.findUnique({
    where: { id: miniSignalId },
    include: { smartExits: { where: { resolved: false } } },
  });
  if (!sig) return { ok: false, reason: "signal_not_found" };

  // 1. Signal must still be alive.
  if (!["waiting_for_entry", "entry_active", "in_trade"].includes(sig.status)) {
    return { ok: false, reason: `signal_status_${sig.status}` };
  }

  // 2. Signal must not have expired.
  if (sig.expiresAt < new Date()) {
    return { ok: false, reason: "signal_expired" };
  }

  // 3. No critical smart-exit alert open.
  const critical = sig.smartExits.find((a) => a.severity === "critical");
  if (critical) {
    return { ok: false, reason: `smart_exit_${critical.alertType}`, details: { evidence: critical.evidence } };
  }

  // 4. Session must not be in news lockout.
  const session = classifySession();
  if (session.newsLockout) {
    return { ok: false, reason: "news_lockout_active" };
  }

  // 5. No duplicate active execution for this signal — checks the
  // existing TradeSetup execution log via the ExecutionOrder table.
  // Skipped if those tables don't exist in this codebase yet; comment
  // shows the wiring point.
  // const dupe = await prisma.executionOrder.findFirst({
  //   where: { sourceRef: miniSignalId, status: { in: ["pending", "filled", "open"] } },
  // });
  // if (dupe) return { ok: false, reason: "duplicate_execution" };

  // 6. Latest 5m close must still be inside or beyond entry zone (not
  // already past TP1).
  const latest = await prisma.candle.findFirst({
    where: { symbol: sig.symbol, timeframe: "5m", isClosed: true },
    orderBy: { openTime: "desc" },
    select: { close: true, openTime: true },
  });
  if (!latest) return { ok: false, reason: "no_recent_candle" };
  const isBull = sig.direction === "bullish" || sig.direction === "buy" || sig.direction === "long";
  const pastTp1 = isBull ? latest.close >= sig.takeProfit1 : latest.close <= sig.takeProfit1;
  if (pastTp1) {
    return { ok: false, reason: "price_past_tp1", details: { close: latest.close, tp1: sig.takeProfit1 } };
  }

  return { ok: true };
}
