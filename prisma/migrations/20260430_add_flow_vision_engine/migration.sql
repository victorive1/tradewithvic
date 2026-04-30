-- Retail vs Institution / FlowVision engine. Per-symbol probabilistic
-- flow intelligence — retail crowding, institutional pressure (proxy),
-- liquidity zones, trap detection, final bias + confidence.

CREATE TABLE "FlowSnapshot" (
  "id"                    TEXT NOT NULL,
  "instrumentId"          TEXT NOT NULL,
  "symbol"                TEXT NOT NULL,
  "timeframe"             TEXT NOT NULL DEFAULT '15m',

  "retailLongPct"         DOUBLE PRECISION,
  "retailShortPct"        DOUBLE PRECISION,
  "retailCrowding"        TEXT,
  "retailDataSource"      TEXT,
  "retailBuyScore"        INTEGER NOT NULL DEFAULT 0,
  "retailSellScore"       INTEGER NOT NULL DEFAULT 0,

  "institutionalBuyScore"  INTEGER NOT NULL DEFAULT 0,
  "institutionalSellScore" INTEGER NOT NULL DEFAULT 0,
  "syntheticCvd"           DOUBLE PRECISION,
  "vwapPosition"           DOUBLE PRECISION,
  "vwapSlope"              DOUBLE PRECISION,
  "volumeZScore"           DOUBLE PRECISION,
  "oiChange"               DOUBLE PRECISION,
  "cotNet"                 DOUBLE PRECISION,

  "trapScore"             INTEGER NOT NULL DEFAULT 0,
  "trapType"              TEXT,

  "finalBias"             TEXT NOT NULL,
  "confidence"            INTEGER NOT NULL,
  "invalidation"          DOUBLE PRECISION,
  "targetLiquidity"       DOUBLE PRECISION,
  "expectedHoldMinutes"   INTEGER NOT NULL DEFAULT 180,

  "narrative"             TEXT,
  "reasonsJson"           TEXT,

  "session"               TEXT,
  "biasState"             TEXT,

  "metadataJson"          TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlowSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FlowSnapshot_symbol_createdAt_idx"     ON "FlowSnapshot"("symbol", "createdAt");
CREATE INDEX "FlowSnapshot_finalBias_confidence_idx" ON "FlowSnapshot"("finalBias", "confidence");
CREATE INDEX "FlowSnapshot_trapScore_idx"            ON "FlowSnapshot"("trapScore");
ALTER TABLE "FlowSnapshot" ADD CONSTRAINT "FlowSnapshot_instrumentId_fkey"
  FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LiquidityZone" (
  "id"            TEXT NOT NULL,
  "instrumentId"  TEXT NOT NULL,
  "symbol"        TEXT NOT NULL,
  "timeframe"     TEXT NOT NULL,
  "zoneType"      TEXT NOT NULL,
  "direction"     TEXT,
  "priceLow"      DOUBLE PRECISION NOT NULL,
  "priceHigh"     DOUBLE PRECISION NOT NULL,
  "strengthScore" INTEGER NOT NULL DEFAULT 50,
  "formedAt"      TIMESTAMP(3) NOT NULL,
  "isFilled"      BOOLEAN NOT NULL DEFAULT false,
  "isViolated"    BOOLEAN NOT NULL DEFAULT false,
  "metadataJson"  TEXT,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LiquidityZone_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LiquidityZone_symbol_timeframe_isFilled_isViolated_idx" ON "LiquidityZone"("symbol", "timeframe", "isFilled", "isViolated");
CREATE INDEX "LiquidityZone_zoneType_formedAt_idx"                    ON "LiquidityZone"("zoneType", "formedAt");
ALTER TABLE "LiquidityZone" ADD CONSTRAINT "LiquidityZone_instrumentId_fkey"
  FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
