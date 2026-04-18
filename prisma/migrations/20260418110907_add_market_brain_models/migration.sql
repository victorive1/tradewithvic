-- AlterTable
ALTER TABLE "Instrument" ADD COLUMN     "scanTier" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ScanCycle" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "durationMs" INTEGER,
    "instrumentsScanned" INTEGER NOT NULL DEFAULT 0,
    "quotesFetched" INTEGER NOT NULL DEFAULT 0,
    "candlesFetched" INTEGER NOT NULL DEFAULT 0,
    "setupsGenerated" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorLogJson" TEXT NOT NULL DEFAULT '[]',
    "triggeredBy" TEXT NOT NULL DEFAULT 'vercel-cron',

    CONSTRAINT "ScanCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "scanCycleId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "symbol" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price" DOUBLE PRECISION NOT NULL,
    "change" DOUBLE PRECISION NOT NULL,
    "changePercent" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "previousClose" DOUBLE PRECISION NOT NULL,
    "sourceTimestamp" INTEGER,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candle" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "closeTime" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanCycle_startedAt_idx" ON "ScanCycle"("startedAt");

-- CreateIndex
CREATE INDEX "ScanCycle_status_idx" ON "ScanCycle"("status");

-- CreateIndex
CREATE INDEX "MarketSnapshot_symbol_capturedAt_idx" ON "MarketSnapshot"("symbol", "capturedAt");

-- CreateIndex
CREATE INDEX "MarketSnapshot_scanCycleId_idx" ON "MarketSnapshot"("scanCycleId");

-- CreateIndex
CREATE INDEX "MarketSnapshot_capturedAt_idx" ON "MarketSnapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "Candle_symbol_timeframe_openTime_idx" ON "Candle"("symbol", "timeframe", "openTime");

-- CreateIndex
CREATE INDEX "Candle_fetchedAt_idx" ON "Candle"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Candle_symbol_timeframe_openTime_key" ON "Candle"("symbol", "timeframe", "openTime");

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_scanCycleId_fkey" FOREIGN KEY ("scanCycleId") REFERENCES "ScanCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candle" ADD CONSTRAINT "Candle_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
