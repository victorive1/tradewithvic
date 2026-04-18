-- CreateTable
CREATE TABLE "StructureState" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "bias" TEXT NOT NULL,
    "lastSwingHigh" DOUBLE PRECISION,
    "lastSwingHighTime" TIMESTAMP(3),
    "priorSwingHigh" DOUBLE PRECISION,
    "priorSwingHighTime" TIMESTAMP(3),
    "lastSwingLow" DOUBLE PRECISION,
    "lastSwingLowTime" TIMESTAMP(3),
    "priorSwingLow" DOUBLE PRECISION,
    "priorSwingLowTime" TIMESTAMP(3),
    "lastSwingsJson" TEXT NOT NULL DEFAULT '[]',
    "candlesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "lastEventType" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StructureState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StructureEvent" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceLevel" DOUBLE PRECISION NOT NULL,
    "brokerCandleTime" TIMESTAMP(3) NOT NULL,
    "brokerClose" DOUBLE PRECISION NOT NULL,
    "priorBias" TEXT NOT NULL,
    "newBias" TEXT NOT NULL,
    "scanCycleId" TEXT,

    CONSTRAINT "StructureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StructureState_updatedAt_idx" ON "StructureState"("updatedAt");

-- CreateIndex
CREATE INDEX "StructureState_bias_idx" ON "StructureState"("bias");

-- CreateIndex
CREATE UNIQUE INDEX "StructureState_symbol_timeframe_key" ON "StructureState"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "StructureEvent_symbol_timeframe_detectedAt_idx" ON "StructureEvent"("symbol", "timeframe", "detectedAt");

-- CreateIndex
CREATE INDEX "StructureEvent_detectedAt_idx" ON "StructureEvent"("detectedAt");

-- CreateIndex
CREATE INDEX "StructureEvent_eventType_idx" ON "StructureEvent"("eventType");
