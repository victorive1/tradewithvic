-- CreateTable
CREATE TABLE "RegimeSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "structureRegime" TEXT NOT NULL,
    "volatilityRegime" TEXT NOT NULL,
    "trendStrength" TEXT NOT NULL,
    "directionalBias" TEXT NOT NULL,
    "bbWidth" DOUBLE PRECISION,
    "atrPercent" DOUBLE PRECISION,
    "unstable" BOOLEAN NOT NULL DEFAULT false,
    "unstableReasons" TEXT NOT NULL DEFAULT '[]',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegimeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacroRegimeSnapshot" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "macroTone" TEXT NOT NULL,
    "macroStability" TEXT NOT NULL,
    "usdRegime" TEXT NOT NULL,
    "yieldPressure" TEXT NOT NULL,
    "dominantTheme" TEXT,
    "reasoning" TEXT NOT NULL,
    "reasoningJson" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "MacroRegimeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegimeSnapshot_structureRegime_idx" ON "RegimeSnapshot"("structureRegime");

-- CreateIndex
CREATE INDEX "RegimeSnapshot_volatilityRegime_idx" ON "RegimeSnapshot"("volatilityRegime");

-- CreateIndex
CREATE INDEX "RegimeSnapshot_updatedAt_idx" ON "RegimeSnapshot"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegimeSnapshot_symbol_timeframe_key" ON "RegimeSnapshot"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "MacroRegimeSnapshot_capturedAt_idx" ON "MacroRegimeSnapshot"("capturedAt");
