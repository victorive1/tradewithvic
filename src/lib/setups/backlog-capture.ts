import { prisma } from "@/lib/prisma";
import type { TradeSetup as EngineSetup } from "@/lib/setup-engine";

// Persist ephemeral / computed setups into the backlog the first time each
// one appears, so admins/agents get a durable 30-day history with a TRUE
// "first dropped" time, and return that immutable timestamp so the live
// cards can render it.
//
// Why this exists: several setup surfaces (the classic engine, breakouts,
// order blocks, engulfing) are computed on the fly and never persisted —
// their own timestamps are either synthetic (engine: day-bucket midnight)
// or candle-derived, neither of which is a real "first detected" instant.
// We write each setup ONCE into TradeSetup and let the DB column
// `createdAt @default(now())` stamp the real wall-clock moment; re-captures
// are no-ops so that origin time is immutable.
//
// Captured rows carry status "backlog" so they never enter the active /
// quant / algo-runtime flows (all of which filter status:"active"). They
// surface only in the Backlog view, which reads all statuses in-window.

const BACKLOG_STATUS = "backlog";

// signature(=row id) -> first-dropped ISO. Warm cache so the hot path
// (the setups feed is polled every 60s by every open browser) costs zero
// DB round-trips once a setup has been seen by this process instance.
const stampCache = new Map<string, string>();
const instrumentIdBySymbol = new Map<string, string>();

/**
 * A source-agnostic setup ready to be backlogged. `signature` must be a
 * stable, globally-unique key that is identical every time the SAME logical
 * setup is re-detected within its lifetime (it becomes the TradeSetup row
 * id). Include a day bucket so a setup that recurs on a later day gets a
 * fresh first-dropped time.
 */
export interface CapturableSetup {
  signature: string;
  symbol: string;
  direction: string;
  setupType: string;
  timeframe: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number | null;
  riskReward: number;
  confidenceScore: number; // 0-100
  qualityGrade: string;
  explanation?: string | null;
  invalidation?: string | null;
}

async function resolveInstrumentIds(symbols: string[]): Promise<void> {
  const missing = symbols.filter((s) => !instrumentIdBySymbol.has(s));
  if (missing.length === 0) return;
  try {
    const rows = await prisma.instrument.findMany({
      where: { symbol: { in: missing } },
      select: { id: true, symbol: true },
    });
    for (const r of rows) instrumentIdBySymbol.set(r.symbol, r.id);
  } catch {
    /* best-effort */
  }
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Idempotently persist setups into the backlog and return a
 * Map<signature, firstDroppedISO>. Never throws — on any failure it returns
 * whatever it resolved (possibly empty), so callers can attach the stamp
 * when present and simply omit the badge when not.
 */
export async function captureSetups(
  items: CapturableSetup[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (items.length === 0) return result;

  // 1. Serve everything already known to this instance from cache.
  const uncached: CapturableSetup[] = [];
  for (const it of items) {
    const hit = stampCache.get(it.signature);
    if (hit) result.set(it.signature, hit);
    else uncached.push(it);
  }
  if (uncached.length === 0) return result;

  try {
    // 2. Load any rows that already exist (captured by a prior instance).
    const ids = uncached.map((it) => it.signature);
    const existing = await prisma.tradeSetup.findMany({
      where: { id: { in: ids } },
      select: { id: true, createdAt: true },
    });
    const existingIds = new Set<string>();
    for (const e of existing) {
      const iso = e.createdAt.toISOString();
      stampCache.set(e.id, iso);
      result.set(e.id, iso);
      existingIds.add(e.id);
    }

    // 3. Create the genuinely-new ones (those with a known instrument).
    const toCreate = uncached.filter((it) => !existingIds.has(it.signature));
    if (toCreate.length > 0) {
      await resolveInstrumentIds([...new Set(toCreate.map((t) => t.symbol))]);
      const creatable = toCreate.filter((t) => instrumentIdBySymbol.has(t.symbol));
      if (creatable.length > 0) {
        await prisma.tradeSetup.createMany({
          data: creatable.map((t) => ({
            id: t.signature,
            instrumentId: instrumentIdBySymbol.get(t.symbol)!,
            symbol: t.symbol,
            direction: t.direction,
            setupType: t.setupType,
            timeframe: t.timeframe,
            entry: t.entry,
            stopLoss: t.stopLoss,
            takeProfit1: t.takeProfit1,
            takeProfit2: t.takeProfit2 ?? null,
            riskReward: t.riskReward,
            confidenceScore: clampScore(t.confidenceScore),
            qualityGrade: t.qualityGrade,
            explanation: t.explanation ?? null,
            invalidation: t.invalidation ?? null,
            status: BACKLOG_STATUS,
            // createdAt intentionally omitted → DB stamps real now() once.
          })),
          // Concurrent instances may race; skip rather than throw.
          skipDuplicates: true,
        });

        // Read back the DB-stamped createdAt for the rows we just created.
        const created = await prisma.tradeSetup.findMany({
          where: { id: { in: creatable.map((c) => c.signature) } },
          select: { id: true, createdAt: true },
        });
        for (const c of created) {
          const iso = c.createdAt.toISOString();
          stampCache.set(c.id, iso);
          result.set(c.id, iso);
        }
      }
    }
  } catch {
    /* best-effort — return what we have */
  }

  return result;
}

/**
 * Adapter for the classic ephemeral engine. Keeps the historical
 * `eng_<id>` signature scheme so previously-captured rows are reused.
 * Returns Map<engineId, firstDroppedISO>.
 */
export async function captureEngineSetups(
  setups: EngineSetup[],
): Promise<Map<string, string>> {
  const stamps = await captureSetups(
    setups.map((s) => ({
      signature: `eng_${s.id}`,
      symbol: s.symbol,
      direction: s.direction,
      setupType: s.setupType,
      timeframe: s.timeframe,
      entry: s.entry,
      stopLoss: s.stopLoss,
      takeProfit1: s.takeProfit1,
      takeProfit2: s.takeProfit2 ?? null,
      riskReward: s.riskReward,
      confidenceScore: clampScore(s.confidenceScore),
      qualityGrade: s.qualityGrade,
      explanation: s.explanation,
      invalidation: s.invalidation,
    })),
  );
  // Re-key from `eng_<id>` back to the bare engine id for easy lookup.
  const byEngineId = new Map<string, string>();
  for (const s of setups) {
    const iso = stamps.get(`eng_${s.id}`);
    if (iso) byEngineId.set(s.id, iso);
  }
  return byEngineId;
}
