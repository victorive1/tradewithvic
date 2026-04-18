-- CreateTable
CREATE TABLE "FundamentalEvent" (
    "id" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "country" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "forecast" TEXT,
    "previous" TEXT,
    "actual" TEXT,
    "affectedCurrenciesJson" TEXT NOT NULL DEFAULT '[]',
    "affectedSymbolsJson" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundamentalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRiskSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "nearestEventId" TEXT,
    "nearestEventName" TEXT,
    "nearestEventImpact" TEXT,
    "minutesToEvent" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundamentalEvent_eventTime_idx" ON "FundamentalEvent"("eventTime");

-- CreateIndex
CREATE INDEX "FundamentalEvent_impact_idx" ON "FundamentalEvent"("impact");

-- CreateIndex
CREATE UNIQUE INDEX "FundamentalEvent_eventTime_country_eventName_key" ON "FundamentalEvent"("eventTime", "country", "eventName");

-- CreateIndex
CREATE INDEX "EventRiskSnapshot_riskLevel_idx" ON "EventRiskSnapshot"("riskLevel");

-- CreateIndex
CREATE INDEX "EventRiskSnapshot_computedAt_idx" ON "EventRiskSnapshot"("computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventRiskSnapshot_symbol_key" ON "EventRiskSnapshot"("symbol");
