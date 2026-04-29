-- Adds an explicit win/loss tag to TradeJournalEntry. Nullable so existing
-- rows keep working; downstream stats fall back to realizedPnl-sign when
-- this column is null.
ALTER TABLE "TradeJournalEntry" ADD COLUMN "outcome" TEXT;
