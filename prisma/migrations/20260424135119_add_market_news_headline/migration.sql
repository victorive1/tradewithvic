-- CreateTable
CREATE TABLE "MarketNewsHeadline" (
    "id" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "affectedSymbolsJson" TEXT NOT NULL DEFAULT '[]',
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "externalId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketNewsHeadline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketNewsHeadline_publishedAt_idx" ON "MarketNewsHeadline"("publishedAt");

-- CreateIndex
CREATE INDEX "MarketNewsHeadline_severity_isActive_idx" ON "MarketNewsHeadline"("severity", "isActive");

-- CreateIndex
CREATE INDEX "MarketNewsHeadline_isActive_publishedAt_idx" ON "MarketNewsHeadline"("isActive", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketNewsHeadline_sourceName_externalId_key" ON "MarketNewsHeadline"("sourceName", "externalId");
