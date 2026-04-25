-- AlterTable: add Blueprint § 10 risk profile preset
ALTER TABLE "ExecutionAccount" ADD COLUMN IF NOT EXISTS "riskProfile" TEXT NOT NULL DEFAULT 'balanced';
