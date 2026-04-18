-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoriteMarkets" TEXT NOT NULL DEFAULT '[]',
    "defaultTimeframe" TEXT NOT NULL DEFAULT '1h',
    "dashboardLayout" TEXT NOT NULL DEFAULT '[]',
    "alertSettings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "baseCurrency" TEXT,
    "quoteCurrency" TEXT,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeSetup" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "setupType" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit1" DOUBLE PRECISION NOT NULL,
    "takeProfit2" DOUBLE PRECISION,
    "takeProfit3" DOUBLE PRECISION,
    "riskReward" DOUBLE PRECISION NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "qualityGrade" TEXT NOT NULL,
    "explanation" TEXT,
    "invalidation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "symbol" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "message" TEXT,
    "isTriggered" BOOLEAN NOT NULL DEFAULT false,
    "triggeredAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupDecisionLog" (
    "id" TEXT NOT NULL,
    "setupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "marketRegime" TEXT,
    "rulesEngineVersion" TEXT NOT NULL DEFAULT 'v1',
    "modelVersionUsed" TEXT,
    "adaptiveConfigVersion" TEXT,
    "direction" TEXT NOT NULL,
    "setupType" TEXT NOT NULL,
    "rulesScore" DOUBLE PRECISION NOT NULL,
    "hybridScore" DOUBLE PRECISION,
    "qualityLabel" TEXT NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit1" DOUBLE PRECISION NOT NULL,
    "takeProfit2" DOUBLE PRECISION,
    "takeProfit3" DOUBLE PRECISION,
    "pairStrengthSpread" DOUBLE PRECISION,
    "alignmentScore" DOUBLE PRECISION,
    "structureScore" DOUBLE PRECISION,
    "momentumScore" DOUBLE PRECISION,
    "entryLocationScore" DOUBLE PRECISION,
    "rrScore" DOUBLE PRECISION,
    "volatilityScore" DOUBLE PRECISION,
    "eventRiskScore" DOUBLE PRECISION,
    "featureVectorJson" TEXT NOT NULL DEFAULT '{}',
    "reasoningJson" TEXT NOT NULL DEFAULT '[]',
    "invalidationRulesJson" TEXT NOT NULL DEFAULT '[]',
    "marketContextJson" TEXT NOT NULL DEFAULT '{}',
    "rawInputSnapshotJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "SetupDecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupOutcome" (
    "id" TEXT NOT NULL,
    "setupDecisionLogId" TEXT NOT NULL,
    "labeledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggered" BOOLEAN NOT NULL,
    "entryTriggeredAt" TIMESTAMP(3),
    "tp1Hit" BOOLEAN NOT NULL DEFAULT false,
    "tp1HitAt" TIMESTAMP(3),
    "tp2Hit" BOOLEAN NOT NULL DEFAULT false,
    "tp2HitAt" TIMESTAMP(3),
    "tp3Hit" BOOLEAN NOT NULL DEFAULT false,
    "tp3HitAt" TIMESTAMP(3),
    "slHit" BOOLEAN NOT NULL DEFAULT false,
    "slHitAt" TIMESTAMP(3),
    "expired" BOOLEAN NOT NULL DEFAULT false,
    "invalidated" BOOLEAN NOT NULL DEFAULT false,
    "neverTriggered" BOOLEAN NOT NULL DEFAULT false,
    "maxFavorableExcursion" DOUBLE PRECISION,
    "maxAdverseExcursion" DOUBLE PRECISION,
    "barsToTrigger" INTEGER,
    "barsToTp1" INTEGER,
    "barsToSl" INTEGER,
    "outcomeClass" TEXT NOT NULL,
    "outcomeScore" DOUBLE PRECISION,
    "labelingWindowMinutes" INTEGER NOT NULL DEFAULT 360,
    "labelQuality" TEXT NOT NULL DEFAULT 'medium',

    CONSTRAINT "SetupOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupUserInteraction" (
    "id" TEXT NOT NULL,
    "setupDecisionLogId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventValue" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupUserInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingDataset" (
    "id" TEXT NOT NULL,
    "datasetName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "labelType" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "featureListJson" TEXT NOT NULL DEFAULT '[]',
    "targetDefinitionJson" TEXT NOT NULL DEFAULT '{}',
    "artifactPath" TEXT,
    "status" TEXT NOT NULL,

    CONSTRAINT "TrainingDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRegistry" (
    "id" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelFamily" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trainedAt" TIMESTAMP(3) NOT NULL,
    "trainingWindowStart" TIMESTAMP(3) NOT NULL,
    "trainingWindowEnd" TIMESTAMP(3) NOT NULL,
    "datasetId" TEXT,
    "targetName" TEXT NOT NULL,
    "featureListJson" TEXT NOT NULL DEFAULT '[]',
    "hyperparamsJson" TEXT NOT NULL DEFAULT '{}',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "calibrationMetricsJson" TEXT,
    "artifactPath" TEXT NOT NULL,
    "evaluationReportPath" TEXT,
    "notes" TEXT,
    "promotedAt" TIMESTAMP(3),
    "demotedAt" TIMESTAMP(3),
    "replacedByVersion" TEXT,

    CONSTRAINT "ModelRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPromotion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromVersion" TEXT,
    "toVersion" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "decisionReason" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "metricsSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "rolloutStrategyJson" TEXT,

    CONSTRAINT "ModelPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdaptiveConfigVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "parentVersion" TEXT,
    "changeReason" TEXT,
    "maxDailyChangePercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "weightsJson" TEXT NOT NULL DEFAULT '{}',
    "thresholdsJson" TEXT NOT NULL DEFAULT '{}',
    "symbolModifiersJson" TEXT NOT NULL DEFAULT '{}',
    "timeframeModifiersJson" TEXT NOT NULL DEFAULT '{}',
    "sessionModifiersJson" TEXT NOT NULL DEFAULT '{}',
    "freshnessRulesJson" TEXT NOT NULL DEFAULT '{}',
    "stalenessRulesJson" TEXT NOT NULL DEFAULT '{}',
    "eventRiskRulesJson" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT,

    CONSTRAINT "AdaptiveConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveScoringLog" (
    "id" TEXT NOT NULL,
    "setupDecisionLogId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoringMode" TEXT NOT NULL,
    "rulesScore" DOUBLE PRECISION NOT NULL,
    "modelScore" DOUBLE PRECISION,
    "calibratedProbability" DOUBLE PRECISION,
    "visibleScore" DOUBLE PRECISION NOT NULL,
    "rulesWeight" DOUBLE PRECISION NOT NULL,
    "modelWeight" DOUBLE PRECISION NOT NULL,
    "activeModelVersion" TEXT,
    "shadowModelVersion" TEXT,
    "adaptiveConfigVersion" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "fallbackReason" TEXT,
    "guardrailApplied" BOOLEAN NOT NULL DEFAULT false,
    "guardrailReasonsJson" TEXT,

    CONSTRAINT "LiveScoringLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowPredictionLog" (
    "id" TEXT NOT NULL,
    "setupDecisionLogId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeScore" DOUBLE PRECISION NOT NULL,
    "activeModelVersion" TEXT,
    "shadowModelVersion" TEXT NOT NULL,
    "shadowProbability" DOUBLE PRECISION NOT NULL,
    "shadowScore" DOUBLE PRECISION NOT NULL,
    "divergence" DOUBLE PRECISION NOT NULL,
    "featureHash" TEXT,
    "notesJson" TEXT,

    CONSTRAINT "ShadowPredictionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureDriftReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelVersion" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "driftSummaryJson" TEXT NOT NULL DEFAULT '{}',
    "severity" TEXT NOT NULL,
    "recommendedAction" TEXT,

    CONSTRAINT "FeatureDriftReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringAlert" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "modelVersion" TEXT,
    "configVersion" TEXT,
    "metricName" TEXT,
    "metricValue" DOUBLE PRECISION,
    "thresholdValue" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'open',
    "recommendedAction" TEXT,
    "actionTaken" TEXT,

    CONSTRAINT "MonitoringAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeModelVersion" TEXT,
    "adaptiveConfigVersion" TEXT,
    "scoringMode" TEXT NOT NULL,
    "inferenceSuccessRate" DOUBLE PRECISION,
    "fallbackRate" DOUBLE PRECISION,
    "topBucketHitRate" DOUBLE PRECISION,
    "topBucketFalsePositiveRate" DOUBLE PRECISION,
    "driftSeverity" TEXT,
    "driftSummaryJson" TEXT,
    "scoreBandSummaryJson" TEXT,

    CONSTRAINT "MonitoringSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLearningReport" (
    "id" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setupsLogged" INTEGER NOT NULL,
    "setupsLabeled" INTEGER NOT NULL,
    "candidateModelVersion" TEXT,
    "baselineMetricsJson" TEXT NOT NULL DEFAULT '{}',
    "candidateMetricsJson" TEXT,
    "recommendationsJson" TEXT,
    "promotionDecision" TEXT,

    CONSTRAINT "DailyLearningReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorActionLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "reason" TEXT,
    "metadataJson" TEXT,

    CONSTRAINT "OperatorActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemControlState" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scoringMode" TEXT NOT NULL DEFAULT 'rules_only',
    "rulesWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "modelWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "forceRulesOnly" BOOLEAN NOT NULL DEFAULT false,
    "configPromotionsFrozen" BOOLEAN NOT NULL DEFAULT false,
    "activeModelVersion" TEXT,
    "shadowModelVersion" TEXT,
    "activeConfigVersion" TEXT,
    "notes" TEXT,

    CONSTRAINT "SystemControlState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

-- CreateIndex
CREATE INDEX "TradeSetup_symbol_status_idx" ON "TradeSetup"("symbol", "status");

-- CreateIndex
CREATE INDEX "TradeSetup_createdAt_idx" ON "TradeSetup"("createdAt");

-- CreateIndex
CREATE INDEX "TradeSetup_qualityGrade_idx" ON "TradeSetup"("qualityGrade");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_symbol_key" ON "Watchlist"("userId", "symbol");

-- CreateIndex
CREATE INDEX "Alert_userId_isActive_idx" ON "Alert"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Alert_symbol_isActive_idx" ON "Alert"("symbol", "isActive");

-- CreateIndex
CREATE INDEX "SetupDecisionLog_createdAt_idx" ON "SetupDecisionLog"("createdAt");

-- CreateIndex
CREATE INDEX "SetupDecisionLog_symbol_timeframe_idx" ON "SetupDecisionLog"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "SetupDecisionLog_rulesEngineVersion_idx" ON "SetupDecisionLog"("rulesEngineVersion");

-- CreateIndex
CREATE UNIQUE INDEX "SetupOutcome_setupDecisionLogId_key" ON "SetupOutcome"("setupDecisionLogId");

-- CreateIndex
CREATE INDEX "SetupOutcome_labeledAt_idx" ON "SetupOutcome"("labeledAt");

-- CreateIndex
CREATE INDEX "SetupOutcome_outcomeClass_idx" ON "SetupOutcome"("outcomeClass");

-- CreateIndex
CREATE INDEX "SetupUserInteraction_setupDecisionLogId_idx" ON "SetupUserInteraction"("setupDecisionLogId");

-- CreateIndex
CREATE INDEX "SetupUserInteraction_createdAt_idx" ON "SetupUserInteraction"("createdAt");

-- CreateIndex
CREATE INDEX "TrainingDataset_createdAt_idx" ON "TrainingDataset"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelRegistry_version_key" ON "ModelRegistry"("version");

-- CreateIndex
CREATE INDEX "ModelRegistry_status_idx" ON "ModelRegistry"("status");

-- CreateIndex
CREATE INDEX "ModelRegistry_modelName_idx" ON "ModelRegistry"("modelName");

-- CreateIndex
CREATE INDEX "ModelPromotion_createdAt_idx" ON "ModelPromotion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdaptiveConfigVersion_version_key" ON "AdaptiveConfigVersion"("version");

-- CreateIndex
CREATE INDEX "AdaptiveConfigVersion_status_idx" ON "AdaptiveConfigVersion"("status");

-- CreateIndex
CREATE INDEX "AdaptiveConfigVersion_createdAt_idx" ON "AdaptiveConfigVersion"("createdAt");

-- CreateIndex
CREATE INDEX "LiveScoringLog_setupDecisionLogId_idx" ON "LiveScoringLog"("setupDecisionLogId");

-- CreateIndex
CREATE INDEX "LiveScoringLog_createdAt_idx" ON "LiveScoringLog"("createdAt");

-- CreateIndex
CREATE INDEX "LiveScoringLog_scoringMode_idx" ON "LiveScoringLog"("scoringMode");

-- CreateIndex
CREATE INDEX "ShadowPredictionLog_setupDecisionLogId_idx" ON "ShadowPredictionLog"("setupDecisionLogId");

-- CreateIndex
CREATE INDEX "ShadowPredictionLog_createdAt_idx" ON "ShadowPredictionLog"("createdAt");

-- CreateIndex
CREATE INDEX "FeatureDriftReport_createdAt_idx" ON "FeatureDriftReport"("createdAt");

-- CreateIndex
CREATE INDEX "FeatureDriftReport_severity_idx" ON "FeatureDriftReport"("severity");

-- CreateIndex
CREATE INDEX "MonitoringAlert_createdAt_idx" ON "MonitoringAlert"("createdAt");

-- CreateIndex
CREATE INDEX "MonitoringAlert_level_idx" ON "MonitoringAlert"("level");

-- CreateIndex
CREATE INDEX "MonitoringAlert_status_idx" ON "MonitoringAlert"("status");

-- CreateIndex
CREATE INDEX "MonitoringSnapshot_createdAt_idx" ON "MonitoringSnapshot"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLearningReport_reportDate_key" ON "DailyLearningReport"("reportDate");

-- CreateIndex
CREATE INDEX "DailyLearningReport_createdAt_idx" ON "DailyLearningReport"("createdAt");

-- CreateIndex
CREATE INDEX "OperatorActionLog_createdAt_idx" ON "OperatorActionLog"("createdAt");

-- CreateIndex
CREATE INDEX "OperatorActionLog_operatorId_idx" ON "OperatorActionLog"("operatorId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeSetup" ADD CONSTRAINT "TradeSetup_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOutcome" ADD CONSTRAINT "SetupOutcome_setupDecisionLogId_fkey" FOREIGN KEY ("setupDecisionLogId") REFERENCES "SetupDecisionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupUserInteraction" ADD CONSTRAINT "SetupUserInteraction_setupDecisionLogId_fkey" FOREIGN KEY ("setupDecisionLogId") REFERENCES "SetupDecisionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRegistry" ADD CONSTRAINT "ModelRegistry_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "TrainingDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPromotion" ADD CONSTRAINT "ModelPromotion_fromVersion_fkey" FOREIGN KEY ("fromVersion") REFERENCES "ModelRegistry"("version") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPromotion" ADD CONSTRAINT "ModelPromotion_toVersion_fkey" FOREIGN KEY ("toVersion") REFERENCES "ModelRegistry"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveScoringLog" ADD CONSTRAINT "LiveScoringLog_setupDecisionLogId_fkey" FOREIGN KEY ("setupDecisionLogId") REFERENCES "SetupDecisionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowPredictionLog" ADD CONSTRAINT "ShadowPredictionLog_setupDecisionLogId_fkey" FOREIGN KEY ("setupDecisionLogId") REFERENCES "SetupDecisionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureDriftReport" ADD CONSTRAINT "FeatureDriftReport_modelVersion_fkey" FOREIGN KEY ("modelVersion") REFERENCES "ModelRegistry"("version") ON DELETE SET NULL ON UPDATE CASCADE;
