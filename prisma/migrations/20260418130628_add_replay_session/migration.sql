-- CreateTable
CREATE TABLE "ReplaySession" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "weightsOverrideJson" TEXT NOT NULL DEFAULT '{}',
    "decisionCount" INTEGER NOT NULL DEFAULT 0,
    "baselineMetricsJson" TEXT NOT NULL DEFAULT '{}',
    "simulatedMetricsJson" TEXT NOT NULL DEFAULT '{}',
    "deltaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ReplaySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplaySession_createdAt_idx" ON "ReplaySession"("createdAt");
