-- CreateTable
CREATE TABLE "IndicatorSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "candleTime" TIMESTAMP(3) NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "candleCount" INTEGER NOT NULL,
    "ema20" DOUBLE PRECISION,
    "ema50" DOUBLE PRECISION,
    "ema200" DOUBLE PRECISION,
    "rsi14" DOUBLE PRECISION,
    "rsiState" TEXT,
    "atr14" DOUBLE PRECISION,
    "atrPercent" DOUBLE PRECISION,
    "macdLine" DOUBLE PRECISION,
    "macdSignal" DOUBLE PRECISION,
    "macdHist" DOUBLE PRECISION,
    "bbUpper" DOUBLE PRECISION,
    "bbMiddle" DOUBLE PRECISION,
    "bbLower" DOUBLE PRECISION,
    "bbWidth" DOUBLE PRECISION,
    "bbPercentB" DOUBLE PRECISION,
    "trendBias" TEXT NOT NULL DEFAULT 'neutral',
    "momentum" TEXT NOT NULL DEFAULT 'neutral',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicatorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndicatorSnapshot_updatedAt_idx" ON "IndicatorSnapshot"("updatedAt");

-- CreateIndex
CREATE INDEX "IndicatorSnapshot_trendBias_idx" ON "IndicatorSnapshot"("trendBias");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorSnapshot_symbol_timeframe_key" ON "IndicatorSnapshot"("symbol", "timeframe");
