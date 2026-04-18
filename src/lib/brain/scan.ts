import { prisma } from "@/lib/prisma";
import { fetchAllQuotes } from "@/lib/market-data";
import { ensureInstruments } from "@/lib/brain/instruments";

export interface ScanCycleResult {
  scanCycleId: string;
  status: "completed" | "failed";
  durationMs: number;
  instrumentsScanned: number;
  quotesFetched: number;
  snapshotsWritten: number;
  errors: string[];
}

export async function runScanCycle(triggeredBy = "vercel-cron"): Promise<ScanCycleResult> {
  const startedAt = Date.now();
  const errors: string[] = [];

  const cycle = await prisma.scanCycle.create({
    data: { status: "running", triggeredBy },
  });

  try {
    const instruments = await ensureInstruments();
    const symbolToId = new Map(instruments.map((i: any) => [i.symbol, i.id]));

    const quotes = await fetchAllQuotes();

    let snapshotsWritten = 0;
    if (quotes.length > 0) {
      const rows = quotes.map((q) => ({
        scanCycleId: cycle.id,
        instrumentId: symbolToId.get(q.symbol) ?? null,
        symbol: q.symbol,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        high: q.high,
        low: q.low,
        open: q.open,
        previousClose: q.previousClose,
        sourceTimestamp: q.timestamp,
      }));
      const result = await prisma.marketSnapshot.createMany({ data: rows });
      snapshotsWritten = result.count;
    } else {
      errors.push("No quotes returned from TwelveData");
    }

    const durationMs = Date.now() - startedAt;
    await prisma.scanCycle.update({
      where: { id: cycle.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        durationMs,
        instrumentsScanned: instruments.length,
        quotesFetched: quotes.length,
        errorCount: errors.length,
        errorLogJson: JSON.stringify(errors),
      },
    });

    return {
      scanCycleId: cycle.id,
      status: "completed",
      durationMs,
      instrumentsScanned: instruments.length,
      quotesFetched: quotes.length,
      snapshotsWritten,
      errors,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const message = err?.message || String(err);
    errors.push(message);

    await prisma.scanCycle.update({
      where: { id: cycle.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        durationMs,
        errorCount: errors.length,
        errorLogJson: JSON.stringify(errors),
      },
    });

    return {
      scanCycleId: cycle.id,
      status: "failed",
      durationMs,
      instrumentsScanned: 0,
      quotesFetched: 0,
      snapshotsWritten: 0,
      errors,
    };
  }
}
