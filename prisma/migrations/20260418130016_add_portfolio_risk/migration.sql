-- AlterTable
ALTER TABLE "ExecutionAccount" ADD COLUMN     "maxCurrencyExposurePct" DOUBLE PRECISION NOT NULL DEFAULT 60,
ADD COLUMN     "maxSameAssetClassPositions" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "maxSameDirectionPositions" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "maxSameStrategyPositions" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "maxTotalRiskPct" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
ADD COLUMN     "weeklyLossLimitPct" DOUBLE PRECISION NOT NULL DEFAULT 8.0,
ADD COLUMN     "weeklyPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "weeklyPnlResetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "balance" DOUBLE PRECISION NOT NULL,
    "equity" DOUBLE PRECISION NOT NULL,
    "openPositionsCount" INTEGER NOT NULL,
    "totalRiskAmount" DOUBLE PRECISION NOT NULL,
    "totalRiskPct" DOUBLE PRECISION NOT NULL,
    "unrealizedPnl" DOUBLE PRECISION NOT NULL,
    "dailyPnl" DOUBLE PRECISION NOT NULL,
    "weeklyPnl" DOUBLE PRECISION NOT NULL,
    "longCount" INTEGER NOT NULL DEFAULT 0,
    "shortCount" INTEGER NOT NULL DEFAULT 0,
    "categoryBreakdownJson" TEXT NOT NULL DEFAULT '{}',
    "strategyBreakdownJson" TEXT NOT NULL DEFAULT '{}',
    "currencyExposureJson" TEXT NOT NULL DEFAULT '{}',
    "drawdownPct" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioDecisionLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "originalRisk" DOUBLE PRECISION NOT NULL,
    "adjustedRisk" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioDecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_accountId_capturedAt_idx" ON "PortfolioSnapshot"("accountId", "capturedAt");

-- CreateIndex
CREATE INDEX "PortfolioDecisionLog_setupId_idx" ON "PortfolioDecisionLog"("setupId");

-- CreateIndex
CREATE INDEX "PortfolioDecisionLog_createdAt_idx" ON "PortfolioDecisionLog"("createdAt");

-- CreateIndex
CREATE INDEX "PortfolioDecisionLog_decision_idx" ON "PortfolioDecisionLog"("decision");
