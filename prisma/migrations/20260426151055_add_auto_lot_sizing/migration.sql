-- Auto Lot Sizing fields on AlgoBotConfig.
-- Additive: every column is non-null with a safe default, so existing rows stay valid
-- and the runtime falls back to its current behavior until the user opts in.

ALTER TABLE "AlgoBotConfig"
  ADD COLUMN "closeAt1R" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoLotSizingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoLotSizingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
