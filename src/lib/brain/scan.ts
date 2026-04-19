import { prisma } from "@/lib/prisma";
import { fetchAllQuotes, calculateCurrencyStrength } from "@/lib/market-data";
import { ensureInstruments } from "@/lib/brain/instruments";
import { fetchCandleSet, CANDLE_SYMBOLS, CANDLE_TIMEFRAMES, pickCycleSymbols } from "@/lib/brain/candles";
import { analyzeAllStructure } from "@/lib/brain/structure";
import { analyzeAllIndicators } from "@/lib/brain/indicators";
import { analyzeAllLiquidity } from "@/lib/brain/liquidity";
import { detectAllStrategies } from "@/lib/brain/strategies";
import { computeSentiment, persistSentiment } from "@/lib/brain/sentiment";
import { analyzeEventRisk, seedPlaceholderEventsIfEmpty } from "@/lib/brain/fundamentals";
import { qualifyAllActiveSetups } from "@/lib/brain/confluence";
import { trackAllSetups } from "@/lib/brain/tracking";
import { runExecutionCycle } from "@/lib/brain/execution";
import { classifyAllRegimes, captureMacroRegime } from "@/lib/brain/regime";
import { runOversightCycle } from "@/lib/brain/oversight";

export interface ScanCycleResult {
  scanCycleId: string;
  status: "completed" | "failed";
  durationMs: number;
  instrumentsScanned: number;
  quotesFetched: number;
  snapshotsWritten: number;
  candlesWritten: number;
  structureAnalyses: number;
  structureEvents: number;
  indicatorsComputed: number;
  liquidityLevels: number;
  liquiditySweeps: number;
  setupsDetected: number;
  setupsPersisted: number;
  sentimentTone: string;
  sentimentScore: number;
  eventRiskHigh: number;
  upcomingEvents: number;
  setupsQualified: number;
  aPlusSetups: number;
  aSetups: number;
  candidateSetups: number;
  droppedSetups: number;
  setupsTracked: number;
  setupsLabeled: number;
  setupsClosed: number;
  execOrdersOpened: number;
  execOrdersRejected: number;
  execPositionsClosed: number;
  execBalance: number;
  execEquity: number;
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

    // Pick this cycle's working subset (stalest open-market symbols from
    // the full 22-instrument universe). Keeps the per-cycle workload bounded
    // so the rotating Brain covers everything over ~12 minutes.
    const cycleSymbols = await pickCycleSymbols();

    const candleResult = await fetchCandleSet(symbolToId, { symbols: cycleSymbols });
    for (const r of candleResult.results) {
      if (r.error) errors.push(`${r.symbol} ${r.timeframe}: ${r.error}`);
    }

    const structureResult = await analyzeAllStructure(
      cycleSymbols,
      CANDLE_TIMEFRAMES,
      cycle.id
    );

    const indicatorResult = await analyzeAllIndicators(
      cycleSymbols,
      CANDLE_TIMEFRAMES
    );

    const regimeResult = await classifyAllRegimes(
      cycleSymbols,
      CANDLE_TIMEFRAMES
    );

    const liquidityResult = await analyzeAllLiquidity(
      cycleSymbols,
      CANDLE_TIMEFRAMES,
      cycle.id
    );

    const strategyResult = await detectAllStrategies(
      cycleSymbols,
      CANDLE_TIMEFRAMES,
      symbolToId,
      cycle.id
    );

    const strengths = calculateCurrencyStrength(quotes);
    const sentiment = computeSentiment(quotes, strengths);
    await persistSentiment(cycle.id, sentiment);

    await seedPlaceholderEventsIfEmpty();
    // Event risk still runs across every tracked symbol so alerts persist
    // even when a symbol isn't this cycle's analysis target.
    const eventRisk = await analyzeEventRisk(CANDLE_SYMBOLS);
    const eventRiskHigh = eventRisk.results.filter((r) => r.riskLevel === "high").length;

    await captureMacroRegime();

    const qualified = await qualifyAllActiveSetups();

    const tracking = await trackAllSetups();

    const execution = await runExecutionCycle();

    const oversight = await runOversightCycle();

    // Institutional Flow Intelligence — runs on the same 2-min cadence so
    // the live board stays fresh without a separate cron. Fire-and-forget
    // safe: errors get swallowed into the cycle log, not a scan failure.
    try {
      const { runIFlowCycle } = await import("@/lib/iflow/engine");
      await runIFlowCycle();
    } catch (err: any) {
      errors.push(`iflow: ${err?.message ?? String(err)}`);
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
        candlesFetched: candleResult.totalWritten,
        setupsGenerated: structureResult.eventsDetected,
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
      candlesWritten: candleResult.totalWritten,
      structureAnalyses: structureResult.analyses.length,
      structureEvents: structureResult.eventsDetected,
      indicatorsComputed: indicatorResult.computed,
      liquidityLevels: liquidityResult.totalLevels,
      liquiditySweeps: liquidityResult.totalSweeps,
      setupsDetected: strategyResult.totalDetected,
      setupsPersisted: strategyResult.totalPersisted,
      sentimentTone: sentiment.riskTone,
      sentimentScore: Math.round(sentiment.riskScore),
      eventRiskHigh,
      upcomingEvents: eventRisk.upcomingCount,
      setupsQualified: qualified.scored,
      aPlusSetups: qualified.aPlus,
      aSetups: qualified.a,
      candidateSetups: qualified.candidate,
      droppedSetups: qualified.dropped,
      setupsTracked: tracking.tracked,
      setupsLabeled: tracking.labeled,
      setupsClosed: tracking.closed,
      execOrdersOpened: execution.ordersOpened,
      execOrdersRejected: execution.ordersRejected,
      execPositionsClosed: execution.positionsClosed,
      execBalance: execution.balance,
      execEquity: execution.equity,
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
      candlesWritten: 0,
      structureAnalyses: 0,
      structureEvents: 0,
      indicatorsComputed: 0,
      liquidityLevels: 0,
      liquiditySweeps: 0,
      setupsDetected: 0,
      setupsPersisted: 0,
      sentimentTone: "unknown",
      sentimentScore: 0,
      eventRiskHigh: 0,
      upcomingEvents: 0,
      setupsQualified: 0,
      aPlusSetups: 0,
      aSetups: 0,
      candidateSetups: 0,
      droppedSetups: 0,
      setupsTracked: 0,
      setupsLabeled: 0,
      setupsClosed: 0,
      execOrdersOpened: 0,
      execOrdersRejected: 0,
      execPositionsClosed: 0,
      execBalance: 0,
      execEquity: 0,
      errors,
    };
  }
}
