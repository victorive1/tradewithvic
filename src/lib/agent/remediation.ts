import { prisma } from "@/lib/prisma";
import { runScanCycle } from "@/lib/brain/scan";
import { fetchCandleSet } from "@/lib/brain/candles";
import { ensureInstruments } from "@/lib/brain/instruments";

export interface RemediationRecipe {
  id: string;
  label: string;
  description: string;
  run(): Promise<RemediationResult>;
}

export interface RemediationResult {
  ok: boolean;
  summary: string;
  details?: string[];
  error?: string;
  durationMs: number;
}

const recipes: Record<string, RemediationRecipe> = {
  fetch_missing_candles: {
    id: "fetch_missing_candles",
    label: "Backfill missing candles",
    description:
      "Re-runs candle fetch for every expected symbol × timeframe. Idempotent — existing candles are left alone.",
    async run(): Promise<RemediationResult> {
      const started = Date.now();
      try {
        const instruments = await ensureInstruments();
        const symbolToId = new Map(instruments.map((i: { symbol: string; id: string }) => [i.symbol, i.id]));
        const result = await fetchCandleSet(symbolToId);
        const errors = result.results.filter((r) => r.error);
        const providerEmpty = result.results.filter((r) => !r.error && r.fetched === 0).length;
        const providerReturned = result.results.filter((r) => r.fetched > 0).length;

        // Zero data back from provider across the board usually means the
        // market is closed (weekend for FX/metals). Surface that clearly
        // instead of silently "succeeding" with 0 new rows.
        const allEmpty = providerEmpty === result.results.length && errors.length === 0;

        return {
          ok: errors.length === 0 && !allEmpty,
          summary: allEmpty
            ? `Provider returned 0 candles for all ${result.requestCount} pairs — markets may be closed (weekend for FX/metals)`
            : `Fetched ${result.requestCount} pairs · wrote ${result.totalWritten} new · ${providerReturned} pairs had data from provider${errors.length ? ` · ${errors.length} errors` : ""}`,
          details: result.results.map((r) =>
            `${r.symbol} ${r.timeframe}: ${r.fetched} from provider · ${r.written} new${r.error ? ` · error: ${r.error}` : ""}`,
          ),
          error: allEmpty
            ? "No upstream data returned. If the market should be open, check TWELVEDATA_API_KEY and the provider status."
            : errors.length > 0
              ? errors.map((e) => `${e.symbol} ${e.timeframe}: ${e.error}`).join("; ")
              : undefined,
          durationMs: Date.now() - started,
        };
      } catch (e: any) {
        return {
          ok: false,
          summary: "Candle backfill failed before it could run",
          error: e?.message ?? String(e),
          durationMs: Date.now() - started,
        };
      }
    },
  },

  run_scan_cycle: {
    id: "run_scan_cycle",
    label: "Run full scan cycle",
    description:
      "Fires a complete Brain scan: quotes, candles, structure, indicators, liquidity, strategies, confluence, execution.",
    async run(): Promise<RemediationResult> {
      const started = Date.now();
      try {
        const result = await runScanCycle("agent-remediation");
        const durationMs = Date.now() - started;
        return {
          ok: result.status === "completed",
          summary: `Scan ${result.status} in ${result.durationMs ?? "?"}ms · ${result.candlesWritten ?? 0} candles · ${result.snapshotsWritten ?? 0} snapshots · ${result.setupsDetected ?? 0} setups`,
          error: result.status !== "completed" ? `Cycle ended in status "${result.status}"` : undefined,
          durationMs,
        };
      } catch (e: any) {
        return {
          ok: false,
          summary: "Scan cycle could not start",
          error: e?.message ?? String(e),
          durationMs: Date.now() - started,
        };
      }
    },
  },

  reset_stuck_scan_cycles: {
    id: "reset_stuck_scan_cycles",
    label: "Reset stuck cycles",
    description:
      "Marks any ScanCycle row that has been 'running' for more than 5 minutes as 'failed' so new cycles can start.",
    async run(): Promise<RemediationResult> {
      const started = Date.now();
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const updated = await prisma.scanCycle.updateMany({
        where: { status: "running", startedAt: { lt: fiveMinAgo } },
        data: { status: "failed", completedAt: new Date() },
      });
      return {
        ok: true,
        summary: `${updated.count} stuck cycle${updated.count === 1 ? "" : "s"} reset to failed`,
        durationMs: Date.now() - started,
      };
    },
  },
};

export function getRecipe(id: string): RemediationRecipe | null {
  return recipes[id] ?? null;
}

export function listRecipes(): RemediationRecipe[] {
  return Object.values(recipes);
}

export async function runRemediation(
  recipeId: string,
  engineId?: string,
): Promise<RemediationResult & { logId: string | null }> {
  const recipe = getRecipe(recipeId);
  if (!recipe) {
    return {
      ok: false,
      summary: "Unknown recipe",
      error: `No recipe with id "${recipeId}"`,
      durationMs: 0,
      logId: null,
    };
  }
  const log = await prisma.agentRemediationLog.create({
    data: { recipeId, engineId: engineId ?? null, summary: `Running ${recipe.label}…` },
  });
  const result = await recipe.run();
  await prisma.agentRemediationLog.update({
    where: { id: log.id },
    data: {
      completedAt: new Date(),
      durationMs: result.durationMs,
      success: result.ok,
      summary: result.summary,
      detailsJson: JSON.stringify(result.details ?? []),
      error: result.error ?? null,
    },
  });
  return { ...result, logId: log.id };
}
