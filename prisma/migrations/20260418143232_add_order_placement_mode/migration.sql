-- AlterTable
ALTER TABLE "ExecutionAccount" ADD COLUMN     "orderPlacementMode" TEXT NOT NULL DEFAULT 'pending_limit',
ADD COLUMN     "pendingEntryTolerancePct" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
ADD COLUMN     "pendingOrderTtlMinutes" INTEGER NOT NULL DEFAULT 240;

-- AlterTable
ALTER TABLE "ExecutionOrder" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "orderType" TEXT NOT NULL DEFAULT 'instant_market',
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExecutionOrder_status_validUntil_idx" ON "ExecutionOrder"("status", "validUntil");
