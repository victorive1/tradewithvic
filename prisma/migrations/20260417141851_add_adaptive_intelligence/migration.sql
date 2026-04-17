-- CreateTable
CREATE TABLE "SetupDecisionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "marketRegime" TEXT,
    "rulesEngineVersion" TEXT NOT NULL DEFAULT 'v1',
    "modelVersionUsed" TEXT,
    "adaptiveConfigVersion" TEXT,
    "direction" TEXT NOT NULL,
    "setupType" TEXT NOT NULL,
    "rulesScore" REAL NOT NULL,
    "hybridScore" REAL,
    "qualityLabel" TEXT NOT NULL,
    "entry" REAL NOT NULL,
    "stopLoss" REAL NOT NULL,
    "takeProfit1" REAL NOT NULL,
    "takeProfit2" REAL,
    "takeProfit3" REAL,
    "pairStrengthSpread" REAL,
    "alignmentScore" REAL,
    "structureScore" REAL,
    "momentumScore" REAL,
    "entryLocationScore" REAL,
    "rrScore" REAL,
    "volatilityScore" REAL,
    "eventRiskScore" REAL,
    "featureVectorJson" TEXT NOT NULL DEFAULT '{}',
    "reasoningJson" TEXT NOT NULL DEFAULT '[]',
    "invalidationRulesJson" TEXT NOT NULL DEFAULT '[]',
    "marketContextJson" TEXT NOT NULL DEFAULT '{}',
    "rawInputSnapshotJson" TEXT NOT NULL DEFAULT '{}'
);

-- CreateTable
CREATE TABLE "SetupOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setupDecisionLogId" TEXT NOT NULL,
    "labeledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggered" BOOLEAN NOT NULL,
    "entryTriggeredAt" DATETIME,
    "tp1Hit" BOOLEAN NOT NULL DEFAULT false,
    "tp1HitAt" DATETIME,
    "tp2Hit" BOOLEAN NOT NULL DEFAULT false,
    "tp2HitAt" DATETIME,
    "tp3Hit" BOOLEAN NOT NULL DEFAULT false,
    "tp3HitAt" DATETIME,
    "slHit" BOOLEAN NOT NULL DEFAULT false,
    "slHitAt" DATETIME,
    "expired" BOOLEAN NOT NULL DEFAULT false,
    "invalidated" BOOLEAN NOT NULL DEFAULT false,
    "neverTriggered" BOOLEAN NOT NULL DEFAULT false,
    "maxFavorableExcursion" REAL,
    "maxAdverseExcursion" REAL,
    "barsToTrigger" INTEGER,
    "barsToTp1" INTEGER,
    "barsToSl" INTEGER,
    "outcomeClass" TEXT NOT NULL,
    "outcomeScore" REAL,
    "labelingWindowMinutes" INTEGER NOT NULL DEFAULT 360,
    "labelQuality" TEXT NOT NULL DEFAULT 'medium',
    CONSTRAINT "SetupOutcome_setupDecisionLogId_fkey" FOREIGN KEY ("setupDecisionLogId") REFERENCES "SetupDecisionLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SetupUserInteraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setupDecisionLogId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventValue" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SetupUserInteraction_setupDecisionLogId_fkey" FOREIGN KEY ("setupDecisionLogId") REFERENCES "SetupDecisionLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingDataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "labelType" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "featureListJson" TEXT NOT NULL DEFAULT '[]',
    "targetDefinitionJson" TEXT NOT NULL DEFAULT '{}',
    "artifactPath" TEXT,
    "status" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ModelRegistry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelName" TEXT NOT NULL,
    "modelFamily" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trainedAt" DATETIME NOT NULL,
    "trainingWindowStart" DATETIME NOT NULL,
    "trainingWindowEnd" DATETIME NOT NULL,
    "datasetId" TEXT,
    "targetName" TEXT NOT NULL,
    "featureListJson" TEXT NOT NULL DEFAULT '[]',
    "hyperparamsJson" TEXT NOT NULL DEFAULT '{}',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "calibrationMetricsJson" TEXT,
    "artifactPath" TEXT NOT NULL,
    "evaluationReportPath" TEXT,
    "notes" TEXT,
    "promotedAt" DATETIME,
    "demotedAt" DATETIME,
    "replacedByVersion" TEXT,
    CONSTRAINT "ModelRegistry_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "TrainingDataset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModelPromotion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromVersion" TEXT,
    "toVersion" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "decisionReason" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "metricsSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "rolloutStrategyJson" TEXT,
    CONSTRAINT "ModelPromotion_fromVersion_fkey" FOREIGN KEY ("fromVersion") REFERENCES "ModelRegistry" ("version") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ModelPromotion_toVersion_fkey" FOREIGN KEY ("toVersion") REFERENCES "ModelRegistry" ("version") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdaptiveConfigVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" DATETIME,
    "deactivatedAt" DATETIME,
    "parentVersion" TEXT,
    "changeReason" TEXT,
    "maxDailyChangePercent" REAL NOT NULL DEFAULT 5,
    "weightsJson" TEXT NOT NULL DEFAULT '{}',
    "thresholdsJson" TEXT NOT NULL DEFAULT '{}',
    "symbolModifiersJson" TEXT NOT NULL DEFAULT '{}',
    "timeframeModifiersJson" TEXT NOT NULL DEFAULT '{}',
    "sessionModifiersJson" TEXT NOT NULL DEFAULT '{}',
    "freshnessRulesJson" TEXT NOT NULL DEFAULT '{}',
    "stalenessRulesJson" TEXT NOT NULL DEFAULT '{}',
    "eventRiskRulesJson" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "LiveScoringLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setupDecisionLogId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoringMode" TEXT NOT NULL,
    "rulesScore" REAL NOT NULL,
    "modelScore" REAL,
    "calibratedProbability" REAL,
    "visibleScore" REAL NOT NULL,
    "rulesWeight" REAL NOT NULL,
    "modelWeight" REAL NOT NULL,
    "activeModelVersion" TEXT,
    "shadowModelVersion" TEXT,
    "adaptiveConfigVersion" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "fallbackReason" TEXT,
    "guardrailApplied" BOOLEAN NOT NULL DEFAULT false,
    "guardrailReasonsJson" TEXT,
    CONSTRAINT "LiveScoringLog_setupDecisionLogId_fkey" FOREIGN KEY ("setupDecisionLogId") REFERENCES "SetupDecisionLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShadowPredictionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setupDecisionLogId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeScore" REAL NOT NULL,
    "activeModelVersion" TEXT,
    "shadowModelVersion" TEXT NOT NULL,
    "shadowProbability" REAL NOT NULL,
    "shadowScore" REAL NOT NULL,
    "divergence" REAL NOT NULL,
    "featureHash" TEXT,
    "notesJson" TEXT,
    CONSTRAINT "ShadowPredictionLog_setupDecisionLogId_fkey" FOREIGN KEY ("setupDecisionLogId") REFERENCES "SetupDecisionLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeatureDriftReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelVersion" TEXT,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "driftSummaryJson" TEXT NOT NULL DEFAULT '{}',
    "severity" TEXT NOT NULL,
    "recommendedAction" TEXT,
    CONSTRAINT "FeatureDriftReport_modelVersion_fkey" FOREIGN KEY ("modelVersion") REFERENCES "ModelRegistry" ("version") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonitoringAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "modelVersion" TEXT,
    "configVersion" TEXT,
    "metricName" TEXT,
    "metricValue" REAL,
    "thresholdValue" REAL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "recommendedAction" TEXT,
    "actionTaken" TEXT
);

-- CreateTable
CREATE TABLE "MonitoringSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeModelVersion" TEXT,
    "adaptiveConfigVersion" TEXT,
    "scoringMode" TEXT NOT NULL,
    "inferenceSuccessRate" REAL,
    "fallbackRate" REAL,
    "topBucketHitRate" REAL,
    "topBucketFalsePositiveRate" REAL,
    "driftSeverity" TEXT,
    "driftSummaryJson" TEXT,
    "scoreBandSummaryJson" TEXT
);

-- CreateTable
CREATE TABLE "DailyLearningReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setupsLogged" INTEGER NOT NULL,
    "setupsLabeled" INTEGER NOT NULL,
    "candidateModelVersion" TEXT,
    "baselineMetricsJson" TEXT NOT NULL DEFAULT '{}',
    "candidateMetricsJson" TEXT,
    "recommendationsJson" TEXT,
    "promotionDecision" TEXT
);

-- CreateTable
CREATE TABLE "OperatorActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "reason" TEXT,
    "metadataJson" TEXT
);

-- CreateTable
CREATE TABLE "SystemControlState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "scoringMode" TEXT NOT NULL DEFAULT 'rules_only',
    "rulesWeight" REAL NOT NULL DEFAULT 1.0,
    "modelWeight" REAL NOT NULL DEFAULT 0.0,
    "forceRulesOnly" BOOLEAN NOT NULL DEFAULT false,
    "configPromotionsFrozen" BOOLEAN NOT NULL DEFAULT false,
    "activeModelVersion" TEXT,
    "shadowModelVersion" TEXT,
    "activeConfigVersion" TEXT,
    "notes" TEXT
);

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
