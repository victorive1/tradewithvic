-- Market Prediction Mini — intraday-only decision engine. Separate
-- tables from TradeSetup so swing-oriented brain output and intraday
-- scanner output don't share a status enum or expiry semantics.

CREATE TABLE "MiniSignal" (
  "id"                  TEXT NOT NULL,
  "instrumentId"        TEXT NOT NULL,
  "symbol"              TEXT NOT NULL,
  "template"            TEXT NOT NULL,
  "direction"           TEXT NOT NULL,
  "biasTimeframe"       TEXT NOT NULL DEFAULT '1h',
  "entryTimeframe"      TEXT NOT NULL,
  "speedClass"          TEXT NOT NULL,
  "entryZoneLow"        DOUBLE PRECISION NOT NULL,
  "entryZoneHigh"       DOUBLE PRECISION NOT NULL,
  "stopLoss"            DOUBLE PRECISION NOT NULL,
  "takeProfit1"         DOUBLE PRECISION NOT NULL,
  "takeProfit2"         DOUBLE PRECISION,
  "takeProfit3"         DOUBLE PRECISION,
  "entryType"           TEXT NOT NULL DEFAULT 'retest',
  "score"               INTEGER NOT NULL,
  "grade"               TEXT NOT NULL,
  "biasState"           TEXT,
  "session"             TEXT,
  "expectedHoldMinutes" INTEGER NOT NULL,
  "riskReward"          DOUBLE PRECISION NOT NULL,
  "explanation"         TEXT,
  "invalidation"        TEXT,
  "status"              TEXT NOT NULL DEFAULT 'scanning',
  "metadataJson"        TEXT,
  "expiresAt"           TIMESTAMP(3) NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MiniSignal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MiniSignal_symbol_status_expiresAt_idx" ON "MiniSignal"("symbol", "status", "expiresAt");
CREATE INDEX "MiniSignal_status_score_idx"            ON "MiniSignal"("status", "score");
CREATE INDEX "MiniSignal_template_status_idx"         ON "MiniSignal"("template", "status");
CREATE INDEX "MiniSignal_createdAt_idx"               ON "MiniSignal"("createdAt");
ALTER TABLE "MiniSignal" ADD CONSTRAINT "MiniSignal_instrumentId_fkey"
  FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MiniSignalScore" (
  "id"                   TEXT NOT NULL,
  "miniSignalId"         TEXT NOT NULL,
  "biasAlignment"        INTEGER NOT NULL,
  "liquidityEvent"       INTEGER NOT NULL,
  "microStructure"       INTEGER NOT NULL,
  "entryZoneQuality"     INTEGER NOT NULL,
  "momentumDisplacement" INTEGER NOT NULL,
  "volatilitySpread"     INTEGER NOT NULL,
  "riskReward"           INTEGER NOT NULL,
  "sessionTiming"        INTEGER NOT NULL,
  "total"                INTEGER NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiniSignalScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MiniSignalScore_miniSignalId_key" ON "MiniSignalScore"("miniSignalId");
ALTER TABLE "MiniSignalScore" ADD CONSTRAINT "MiniSignalScore_miniSignalId_fkey"
  FOREIGN KEY ("miniSignalId") REFERENCES "MiniSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MiniSignalLifecycle" (
  "id"           TEXT NOT NULL,
  "miniSignalId" TEXT NOT NULL,
  "fromStatus"   TEXT,
  "toStatus"     TEXT NOT NULL,
  "evidence"     TEXT NOT NULL,
  "priceAtEvent" DOUBLE PRECISION,
  "scoreAtEvent" INTEGER,
  "occurredAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiniSignalLifecycle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MiniSignalLifecycle_miniSignalId_occurredAt_idx" ON "MiniSignalLifecycle"("miniSignalId", "occurredAt");
ALTER TABLE "MiniSignalLifecycle" ADD CONSTRAINT "MiniSignalLifecycle_miniSignalId_fkey"
  FOREIGN KEY ("miniSignalId") REFERENCES "MiniSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MiniSmartExit" (
  "id"           TEXT NOT NULL,
  "miniSignalId" TEXT NOT NULL,
  "alertType"    TEXT NOT NULL,
  "severity"     TEXT NOT NULL DEFAULT 'warning',
  "evidence"     TEXT NOT NULL,
  "raisedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"   TIMESTAMP(3),
  "resolved"     BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "MiniSmartExit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MiniSmartExit_miniSignalId_resolved_idx" ON "MiniSmartExit"("miniSignalId", "resolved");
CREATE INDEX "MiniSmartExit_alertType_raisedAt_idx"    ON "MiniSmartExit"("alertType", "raisedAt");
ALTER TABLE "MiniSmartExit" ADD CONSTRAINT "MiniSmartExit_miniSignalId_fkey"
  FOREIGN KEY ("miniSignalId") REFERENCES "MiniSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
