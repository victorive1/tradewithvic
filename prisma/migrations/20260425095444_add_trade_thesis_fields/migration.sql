-- AlterTable: add Trade Thesis Monitor fields (Blueprint § 13)
ALTER TABLE "TradeSetup" ADD COLUMN IF NOT EXISTS "originalThesis" TEXT;
ALTER TABLE "TradeSetup" ADD COLUMN IF NOT EXISTS "requiredConditionsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "TradeSetup" ADD COLUMN IF NOT EXISTS "invalidationConditionsJson" TEXT NOT NULL DEFAULT '[]';
