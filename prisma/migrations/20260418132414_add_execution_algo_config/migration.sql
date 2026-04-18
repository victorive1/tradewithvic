-- AlterTable
ALTER TABLE "ExecutionAccount" ADD COLUMN     "allowedSessionsJson" TEXT NOT NULL DEFAULT '["london","newyork","overlap","crypto_24_7"]',
ADD COLUMN     "executionMode" TEXT NOT NULL DEFAULT 'paper',
ADD COLUMN     "fridayCloseProtection" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "minConfidenceScore" INTEGER NOT NULL DEFAULT 65,
ADD COLUMN     "minRiskReward" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
ADD COLUMN     "newsFilterEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "selectedMtAccountIdsJson" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "selectedSymbolsJson" TEXT NOT NULL DEFAULT '[]';
