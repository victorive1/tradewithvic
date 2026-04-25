// Data Validation Engine — Quant Engine Blueprint § 4.
//
// World-class systems do not blindly accept candles. Every feed gets
// checked before it can trigger a trade. This module produces a
// per-symbol health snapshot the algo runtime + dashboard read.

import { prisma } from "@/lib/prisma";

const TIMEFRAME_MS: Record<string, number> = {
  "5min": 5 * 60_000,
  "15min": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};

const STALE_MULTIPLIER = 3; // candle is "stale" if older than 3× its TF

export type FeedStatus = "healthy" | "warning" | "stale" | "missing";

export interface FeedHealth {
  symbol: string;
  timeframe: string;
  feedStatus: FeedStatus;
  ageSeconds: number | null;
  lastCandleAt: Date | null;
  expectedTF: string;
  notes: string[];
}

export interface SymbolHealth {
  symbol: string;
  overall: FeedStatus;
  perTimeframe: FeedHealth[];
  spread: { value: number | null; status: "normal" | "wide" | "abnormal" } | null;
  pairFreezeMinutes: number | null;
  tradePermission: "allowed" | "reduced_risk_only" | "blocked";
  reasons: string[];
}

export interface FeedCheckParams {
  symbols: readonly string[];
  timeframes: readonly string[];
}

export async function checkAllFeeds(params: FeedCheckParams): Promise<SymbolHealth[]> {
  const results: SymbolHealth[] = [];
  const now = Date.now();

  // Pull the latest closed candle per (symbol, timeframe) in one batch
  // so we don't hammer the DB N×M times.
  const latest = await prisma.candle.groupBy({
    by: ["symbol", "timeframe"],
    where: { isClosed: true, symbol: { in: [...params.symbols] }, timeframe: { in: [...params.timeframes] } },
    _max: { openTime: true },
  });
  const lastSeen = new Map<string, Date>();
  for (const row of latest) {
    const key = `${row.symbol}::${row.timeframe}`;
    if (row._max.openTime) lastSeen.set(key, row._max.openTime);
  }

  for (const symbol of params.symbols) {
    const perTF: FeedHealth[] = [];
    for (const tf of params.timeframes) {
      const expectedMs = TIMEFRAME_MS[tf];
      const last = lastSeen.get(`${symbol}::${tf}`) ?? null;
      const ageMs = last ? now - last.getTime() : null;
      const ageSec = ageMs == null ? null : Math.round(ageMs / 1000);
      const notes: string[] = [];
      let status: FeedStatus = "healthy";

      if (last == null) {
        status = "missing";
        notes.push(`no closed ${tf} candle ever recorded`);
      } else if (expectedMs && ageMs != null) {
        if (ageMs > expectedMs * STALE_MULTIPLIER) {
          status = "stale";
          notes.push(`last close ${formatAge(ageMs)} ago — > 3× ${tf}`);
        } else if (ageMs > expectedMs * 1.5) {
          status = "warning";
          notes.push(`last close ${formatAge(ageMs)} ago — > 1.5× ${tf}`);
        }
      }

      perTF.push({
        symbol,
        timeframe: tf,
        feedStatus: status,
        ageSeconds: ageSec,
        lastCandleAt: last,
        expectedTF: tf,
        notes,
      });
    }

    // Overall health = worst per-timeframe status (rank-ordered).
    const rank: FeedStatus[] = ["healthy", "warning", "stale", "missing"];
    const overall = perTF.reduce<FeedStatus>(
      (acc, f) => (rank.indexOf(f.feedStatus) > rank.indexOf(acc) ? f.feedStatus : acc),
      "healthy",
    );

    // Pair freeze detection: if every timeframe is stale or missing,
    // the symbol has effectively frozen (broker disconnect, weekend, etc).
    const allStaleOrMissing = perTF.every((f) => f.feedStatus === "stale" || f.feedStatus === "missing");
    const pairFreezeMinutes = allStaleOrMissing && perTF.some((f) => f.ageSeconds != null)
      ? Math.round(Math.max(...perTF.map((f) => f.ageSeconds ?? 0)) / 60)
      : null;

    // Trade permission decision.
    const reasons: string[] = [];
    let tradePermission: SymbolHealth["tradePermission"] = "allowed";
    if (overall === "missing" || overall === "stale") {
      tradePermission = "blocked";
      reasons.push(`${overall} data feed`);
    } else if (overall === "warning") {
      tradePermission = "reduced_risk_only";
      reasons.push("data feed warning — recent candles older than expected");
    }
    if (pairFreezeMinutes && pairFreezeMinutes > 0) {
      tradePermission = "blocked";
      reasons.push(`pair frozen ${pairFreezeMinutes}m`);
    }

    results.push({
      symbol,
      overall,
      perTimeframe: perTF,
      spread: null,
      pairFreezeMinutes,
      tradePermission,
      reasons,
    });
  }

  return results;
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}
