-- Trading journal — TradeJournalEntry (per-trade) + TradeJournalDay (per-day).
-- Both cascade-delete from User. ExecutionTrade is unrelated by foreign key
-- (executionTradeId held as a plain string with @unique) so journal entries
-- survive if the broker-side row is ever pruned.

CREATE TABLE "TradeJournalEntry" (
  "id"                 TEXT PRIMARY KEY,
  "userId"             TEXT NOT NULL,
  "executionTradeId"   TEXT,
  "symbol"             TEXT NOT NULL,
  "direction"          TEXT NOT NULL,
  "entry"              DOUBLE PRECISION NOT NULL,
  "exit"               DOUBLE PRECISION,
  "stopLoss"           DOUBLE PRECISION NOT NULL,
  "takeProfit"         DOUBLE PRECISION,
  "positionSize"       DOUBLE PRECISION NOT NULL,
  "riskAmount"         DOUBLE PRECISION,
  "riskPercent"        DOUBLE PRECISION,
  "realizedPnl"        DOUBLE PRECISION,
  "rMultiple"          DOUBLE PRECISION,
  "openedAt"           TIMESTAMP(3) NOT NULL,
  "closedAt"           TIMESTAMP(3),
  "durationMinutes"    INTEGER,
  "session"            TEXT,
  "timeframe"          TEXT,
  "broker"             TEXT,
  "account"            TEXT,
  "strategy"           TEXT,
  "marketCondition"    TEXT,
  "htfBias"            TEXT,
  "preTradeChecklist"  TEXT NOT NULL DEFAULT '{}',
  "tradeQualityScore"  INTEGER,
  "qualityGrade"       TEXT,
  "emotionBefore"      TEXT,
  "emotionDuring"      TEXT,
  "emotionAfter"       TEXT,
  "mistakesJson"       TEXT NOT NULL DEFAULT '[]',
  "rulesFollowed"      BOOLEAN NOT NULL DEFAULT true,
  "rulesViolatedJson"  TEXT NOT NULL DEFAULT '[]',
  "disciplineScore"    INTEGER,
  "notes"              TEXT,
  "lessonLearned"      TEXT,
  "screenshotsJson"    TEXT NOT NULL DEFAULT '[]',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradeJournalEntry_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeJournalEntry_executionTradeId_key" ON "TradeJournalEntry"("executionTradeId");
CREATE INDEX "TradeJournalEntry_userId_openedAt_idx" ON "TradeJournalEntry"("userId", "openedAt");
CREATE INDEX "TradeJournalEntry_userId_closedAt_idx" ON "TradeJournalEntry"("userId", "closedAt");
CREATE INDEX "TradeJournalEntry_userId_strategy_idx" ON "TradeJournalEntry"("userId", "strategy");
CREATE INDEX "TradeJournalEntry_userId_qualityGrade_idx" ON "TradeJournalEntry"("userId", "qualityGrade");

CREATE TABLE "TradeJournalDay" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "date"           TEXT NOT NULL,
  "preMarketBias"  TEXT,
  "watchlistJson"  TEXT NOT NULL DEFAULT '[]',
  "newsRiskJson"   TEXT NOT NULL DEFAULT '[]',
  "marketView"     TEXT,
  "planAdherence"  INTEGER,
  "overtraded"     BOOLEAN NOT NULL DEFAULT false,
  "hitDailyLimit"  BOOLEAN NOT NULL DEFAULT false,
  "topMistake"     TEXT,
  "lessonLearned"  TEXT,
  "tomorrowsFocus" TEXT,
  "notes"          TEXT,
  "pnl"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  "trades"         INTEGER NOT NULL DEFAULT 0,
  "wins"           INTEGER NOT NULL DEFAULT 0,
  "losses"         INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradeJournalDay_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeJournalDay_userId_date_key" ON "TradeJournalDay"("userId", "date");
CREATE INDEX "TradeJournalDay_userId_date_idx" ON "TradeJournalDay"("userId", "date");
