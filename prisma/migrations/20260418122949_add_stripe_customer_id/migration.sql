-- AlterTable: add Stripe customer ID to BillingAccount.
--
-- This migration was authored before add_billing_payments (where
-- BillingAccount is actually created), so on a clean shadow-DB replay
-- the table doesn't exist yet. The DO block guards both statements so
-- they no-op when the table is absent; the column and index have been
-- folded into add_billing_payments so the final schema matches after
-- a full replay. On production this migration is already marked
-- applied in _prisma_migrations and does not re-run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'BillingAccount'
  ) THEN
    ALTER TABLE "BillingAccount" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "BillingAccount_stripeCustomerId_key" ON "BillingAccount"("stripeCustomerId");
  END IF;
END $$;
