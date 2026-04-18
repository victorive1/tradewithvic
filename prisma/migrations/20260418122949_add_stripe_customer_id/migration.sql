-- AlterTable: add Stripe customer ID to BillingAccount
ALTER TABLE "BillingAccount" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "BillingAccount_stripeCustomerId_key" ON "BillingAccount"("stripeCustomerId");
