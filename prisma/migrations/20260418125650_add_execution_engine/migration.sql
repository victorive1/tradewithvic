-- CreateTable
CREATE TABLE "ExecutionAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'paper-default',
    "mode" TEXT NOT NULL DEFAULT 'paper',
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "startingBalance" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "equityHigh" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "equityLow" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "totalRealizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUnrealizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalClosedTrades" INTEGER NOT NULL DEFAULT 0,
    "totalWins" INTEGER NOT NULL DEFAULT 0,
    "totalLosses" INTEGER NOT NULL DEFAULT 0,
    "dailyPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyPnlResetAt" TIMESTAMP(3),
    "riskPerTradePct" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "maxConcurrentPositions" INTEGER NOT NULL DEFAULT 5,
    "maxDailyLossPct" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "allowedGrades" TEXT NOT NULL DEFAULT '["A+","A"]',
    "smartExitMode" TEXT NOT NULL DEFAULT 'balanced',
    "autoExecuteEnabled" BOOLEAN NOT NULL DEFAULT true,
    "killSwitchEngaged" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCycleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "decisionLogId" TEXT,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit1" DOUBLE PRECISION NOT NULL,
    "takeProfit2" DOUBLE PRECISION,
    "takeProfit3" DOUBLE PRECISION,
    "riskAmount" DOUBLE PRECISION NOT NULL,
    "sizeUnits" DOUBLE PRECISION NOT NULL,
    "grade" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "rejectReason" TEXT,
    "filledAt" TIMESTAMP(3),
    "filledPrice" DOUBLE PRECISION,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionPosition" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "decisionLogId" TEXT,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "originalStopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit1" DOUBLE PRECISION NOT NULL,
    "takeProfit2" DOUBLE PRECISION,
    "takeProfit3" DOUBLE PRECISION,
    "sizeUnits" DOUBLE PRECISION NOT NULL,
    "riskAmount" DOUBLE PRECISION NOT NULL,
    "grade" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "exitPrice" DOUBLE PRECISION,
    "exitReason" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "mfe" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mae" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unrealizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closedPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tp1Hit" BOOLEAN NOT NULL DEFAULT false,
    "tp2Hit" BOOLEAN NOT NULL DEFAULT false,
    "tp3Hit" BOOLEAN NOT NULL DEFAULT false,
    "movedToBreakeven" BOOLEAN NOT NULL DEFAULT false,
    "thesisScore" INTEGER NOT NULL DEFAULT 100,
    "thesisState" TEXT NOT NULL DEFAULT 'strong',
    "lastThesisCheckAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionTrade" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL,
    "exit" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "sizeUnits" DOUBLE PRECISION NOT NULL,
    "riskAmount" DOUBLE PRECISION NOT NULL,
    "realizedPnl" DOUBLE PRECISION NOT NULL,
    "pnlPct" DOUBLE PRECISION NOT NULL,
    "rMultiple" DOUBLE PRECISION NOT NULL,
    "exitReason" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "mfe" DOUBLE PRECISION NOT NULL,
    "mae" DOUBLE PRECISION NOT NULL,
    "maxThesisScore" INTEGER NOT NULL DEFAULT 100,
    "minThesisScore" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "ExecutionTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionEvent" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "fromValue" TEXT,
    "toValue" TEXT,
    "reason" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionGuardrailLog" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "failureReasons" TEXT NOT NULL DEFAULT '[]',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionGuardrailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionAccount_name_key" ON "ExecutionAccount"("name");

-- CreateIndex
CREATE INDEX "ExecutionAccount_isActive_idx" ON "ExecutionAccount"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionOrder_setupId_key" ON "ExecutionOrder"("setupId");

-- CreateIndex
CREATE INDEX "ExecutionOrder_accountId_status_idx" ON "ExecutionOrder"("accountId", "status");

-- CreateIndex
CREATE INDEX "ExecutionOrder_createdAt_idx" ON "ExecutionOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionPosition_orderId_key" ON "ExecutionPosition"("orderId");

-- CreateIndex
CREATE INDEX "ExecutionPosition_accountId_status_idx" ON "ExecutionPosition"("accountId", "status");

-- CreateIndex
CREATE INDEX "ExecutionPosition_symbol_status_idx" ON "ExecutionPosition"("symbol", "status");

-- CreateIndex
CREATE INDEX "ExecutionPosition_thesisState_idx" ON "ExecutionPosition"("thesisState");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionTrade_positionId_key" ON "ExecutionTrade"("positionId");

-- CreateIndex
CREATE INDEX "ExecutionTrade_accountId_closedAt_idx" ON "ExecutionTrade"("accountId", "closedAt");

-- CreateIndex
CREATE INDEX "ExecutionTrade_symbol_closedAt_idx" ON "ExecutionTrade"("symbol", "closedAt");

-- CreateIndex
CREATE INDEX "ExecutionTrade_exitReason_idx" ON "ExecutionTrade"("exitReason");

-- CreateIndex
CREATE INDEX "ExecutionEvent_positionId_createdAt_idx" ON "ExecutionEvent"("positionId", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutionEvent_eventType_idx" ON "ExecutionEvent"("eventType");

-- CreateIndex
CREATE INDEX "ExecutionGuardrailLog_setupId_idx" ON "ExecutionGuardrailLog"("setupId");

-- CreateIndex
CREATE INDEX "ExecutionGuardrailLog_checkedAt_idx" ON "ExecutionGuardrailLog"("checkedAt");

-- CreateIndex
CREATE INDEX "ExecutionGuardrailLog_passed_idx" ON "ExecutionGuardrailLog"("passed");

-- AddForeignKey
ALTER TABLE "ExecutionOrder" ADD CONSTRAINT "ExecutionOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ExecutionAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPosition" ADD CONSTRAINT "ExecutionPosition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ExecutionAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPosition" ADD CONSTRAINT "ExecutionPosition_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ExecutionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionTrade" ADD CONSTRAINT "ExecutionTrade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ExecutionAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEvent" ADD CONSTRAINT "ExecutionEvent_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ExecutionPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
