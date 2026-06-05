import { prisma } from "@/lib/prisma";
import type { TradeSetup as EngineSetup } from "@/lib/setup-engine";

// Persist live engine setups into the backlog the first time each one
// appears, so admins/agents get a durable 30-day history with a TRUE
// "first dropped" time.
//
// Why this exists: the classic setup engine (generateSetups) is ephemeral
// — it recomputes on every 30s poll and its own `createdAt` is a synthetic
// day-bucket midnight (00:00 UTC), useless as an origin time. We instead
// write each setup once into TradeSetup and let the DB column
// `createdAt @default(now())` stamp the real wall-clock moment of first
// capture. Re-captures are no-ops (upsert update:{}) so that origin time
// is immutable.
//
// These rows carry status "backlog" so they never enter the active /
// quant / algo-runtime flows (all of which filter status:"active"). They
// surface only in the Backlog view, which reads all statuses in-window.

const BACKLOG_STATUS = "backlog";

// Per-process guards to keep write amplification down. The public
// /api/market/setups route is polled every 30s by every open browser; the
// upsert is already idempotent, but skipping signatures we've handled in
// this instance avoids needless round-trips. Keyed by the engine id, which
// embeds the day bucket, so entries naturally rotate at the UTC day
// boundary. Both maps are bounded by (#instruments × #setups-per-day).
const capturedThisProcess = new Set<string>();
const instrumentIdBySymbol = new Map<string, string>();

async function resolveInstrumentId(symbol: string): Promise<string | null> {
  const cached = instrumentIdBySymbol.get(symbol);
  if (cached) return cached;
  try {
    const row = await prisma.instrument.findUnique({
      where: { symbol },
      select: { id: true },
    });
    if (row?.id) {
      instrumentIdBySymbol.set(symbol, row.id);
      return row.id;
    }
  } catch {
    /* swallow — capture is best-effort */
  }
  return null;
}

/**
 * Best-effort, fire-and-forget capture of engine setups into the backlog.
 * Never throws — failures are swallowed so the setups API response is
 * unaffected. Call WITHOUT awaiting from the route handler.
 */
export async function captureEngineSetups(setups: EngineSetup[]): Promise<void> {
  for (const s of setups) {
    if (capturedThisProcess.has(s.id)) continue;
    capturedThisProcess.add(s.id);

    try {
      const instrumentId = await resolveInstrumentId(s.symbol);
      if (!instrumentId) continue; // no instrument row → can't satisfy FK; skip

      // Engine uses "buy"/"sell"; keep the literal so isBullishDirection
      // resolves it the same way everywhere else in the app.
      const direction = s.direction;

      await prisma.tradeSetup.upsert({
        where: { id: `eng_${s.id}` },
        // No-op on re-capture: this is what makes the first-dropped time
        // (createdAt) immutable.
        update: {},
        create: {
          id: `eng_${s.id}`,
          instrumentId,
          symbol: s.symbol,
          direction,
          setupType: s.setupType,
          timeframe: s.timeframe,
          entry: s.entry,
          stopLoss: s.stopLoss,
          takeProfit1: s.takeProfit1,
          takeProfit2: s.takeProfit2 ?? null,
          riskReward: s.riskReward,
          confidenceScore: s.confidenceScore,
          qualityGrade: s.qualityGrade,
          explanation: s.explanation,
          invalidation: s.invalidation,
          status: BACKLOG_STATUS,
          // createdAt intentionally omitted → DB stamps real now() once.
        },
      });
    } catch {
      // Swallow. If a write fails we drop it from the process guard so a
      // later poll can retry.
      capturedThisProcess.delete(s.id);
    }
  }
}
