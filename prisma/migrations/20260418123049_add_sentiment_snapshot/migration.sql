-- CreateTable
CREATE TABLE "SentimentSnapshot" (
    "id" TEXT NOT NULL,
    "scanCycleId" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "riskTone" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "usdBias" TEXT NOT NULL,
    "usdScore" DOUBLE PRECISION NOT NULL,
    "goldBias" TEXT NOT NULL,
    "goldChange" DOUBLE PRECISION NOT NULL,
    "cryptoBias" TEXT NOT NULL,
    "cryptoChange" DOUBLE PRECISION NOT NULL,
    "reasoningJson" TEXT NOT NULL DEFAULT '[]',
    "reasoning" TEXT NOT NULL,

    CONSTRAINT "SentimentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentimentSnapshot_computedAt_idx" ON "SentimentSnapshot"("computedAt");

-- CreateIndex
CREATE INDEX "SentimentSnapshot_riskTone_idx" ON "SentimentSnapshot"("riskTone");
