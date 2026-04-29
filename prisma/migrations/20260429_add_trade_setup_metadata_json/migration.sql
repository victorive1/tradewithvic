-- Generic per-detection metadata column on TradeSetup. Nullable so old
-- rows are unaffected. Triple Lock writes the 12-gate breakdown here.
ALTER TABLE "TradeSetup" ADD COLUMN "metadataJson" TEXT;
