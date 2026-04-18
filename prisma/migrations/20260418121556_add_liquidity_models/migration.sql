-- CreateTable
CREATE TABLE "LiquidityLevel" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "levelType" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "strength" INTEGER NOT NULL DEFAULT 1,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiquidityLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidityEvent" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "levelType" TEXT NOT NULL,
    "levelPrice" DOUBLE PRECISION NOT NULL,
    "sweepCandleTime" TIMESTAMP(3) NOT NULL,
    "sweepHigh" DOUBLE PRECISION NOT NULL,
    "sweepLow" DOUBLE PRECISION NOT NULL,
    "sweepClose" DOUBLE PRECISION NOT NULL,
    "sweepDirection" TEXT NOT NULL,
    "reversalStrength" DOUBLE PRECISION NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanCycleId" TEXT,

    CONSTRAINT "LiquidityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiquidityLevel_symbol_timeframe_status_idx" ON "LiquidityLevel"("symbol", "timeframe", "status");

-- CreateIndex
CREATE INDEX "LiquidityLevel_updatedAt_idx" ON "LiquidityLevel"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidityLevel_symbol_timeframe_levelType_price_key" ON "LiquidityLevel"("symbol", "timeframe", "levelType", "price");

-- CreateIndex
CREATE INDEX "LiquidityEvent_symbol_timeframe_detectedAt_idx" ON "LiquidityEvent"("symbol", "timeframe", "detectedAt");

-- CreateIndex
CREATE INDEX "LiquidityEvent_sweepDirection_idx" ON "LiquidityEvent"("sweepDirection");

-- CreateIndex
CREATE INDEX "LiquidityEvent_detectedAt_idx" ON "LiquidityEvent"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidityEvent_symbol_timeframe_levelType_levelPrice_sweepC_key" ON "LiquidityEvent"("symbol", "timeframe", "levelType", "levelPrice", "sweepCandleTime");
