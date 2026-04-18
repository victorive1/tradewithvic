-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "userKey" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "availableBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lockedBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "methodType" TEXT NOT NULL,
    "processorName" TEXT NOT NULL,
    "processorTokenRef" TEXT NOT NULL,
    "brand" TEXT,
    "last4" TEXT,
    "expiryMonth" INTEGER,
    "expiryYear" INTEGER,
    "nickname" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoDestination" (
    "id" TEXT NOT NULL,
    "ownerScope" TEXT NOT NULL,
    "ownerKey" TEXT,
    "currencyCode" TEXT NOT NULL,
    "destinationType" TEXT NOT NULL,
    "walletAddressRef" TEXT,
    "processorAccountRef" TEXT,
    "network" TEXT,
    "nickname" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositRequest" (
    "id" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "userKey" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "methodType" TEXT NOT NULL,
    "methodId" TEXT,
    "processorChargeRef" TEXT,
    "networkHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "statusReason" TEXT,
    "feeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "userKey" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "destinationType" TEXT NOT NULL,
    "destinationRef" TEXT NOT NULL,
    "destinationLabel" TEXT,
    "feeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "statusReason" TEXT,
    "reviewNotes" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingTransaction" (
    "id" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "userKey" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "description" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingWebhookEvent" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventRef" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',
    "processingError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAdminSetting" (
    "id" TEXT NOT NULL,
    "paymentMethodKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minAmount" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "maxAmount" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "feeRuleJson" TEXT NOT NULL DEFAULT '{}',
    "reviewRuleJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAdminSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_userKey_key" ON "BillingAccount"("userKey");

-- CreateIndex
CREATE INDEX "BillingAccount_createdAt_idx" ON "BillingAccount"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentMethod_billingAccountId_isActive_idx" ON "PaymentMethod"("billingAccountId", "isActive");

-- CreateIndex
CREATE INDEX "CryptoDestination_ownerScope_ownerKey_currencyCode_idx" ON "CryptoDestination"("ownerScope", "ownerKey", "currencyCode");

-- CreateIndex
CREATE INDEX "DepositRequest_billingAccountId_status_idx" ON "DepositRequest"("billingAccountId", "status");

-- CreateIndex
CREATE INDEX "DepositRequest_userKey_idx" ON "DepositRequest"("userKey");

-- CreateIndex
CREATE INDEX "DepositRequest_createdAt_idx" ON "DepositRequest"("createdAt");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_billingAccountId_status_idx" ON "WithdrawalRequest"("billingAccountId", "status");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingTransaction_billingAccountId_createdAt_idx" ON "BillingTransaction"("billingAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingTransaction_transactionType_idx" ON "BillingTransaction"("transactionType");

-- CreateIndex
CREATE INDEX "BillingWebhookEvent_providerName_processingStatus_idx" ON "BillingWebhookEvent"("providerName", "processingStatus");

-- CreateIndex
CREATE INDEX "BillingWebhookEvent_receivedAt_idx" ON "BillingWebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingWebhookEvent_providerName_eventRef_key" ON "BillingWebhookEvent"("providerName", "eventRef");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAdminSetting_paymentMethodKey_key" ON "BillingAdminSetting"("paymentMethodKey");

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
