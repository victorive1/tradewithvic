-- Per-account broker symbol overrides on LinkedTradingAccount.
-- Additive: both columns are non-null with safe defaults so existing rows stay
-- valid and the runtime falls back to global mapping rules until an account
-- opts in. Suffix is appended to every routed symbol; renames replace the
-- internal symbol before the suffix is appended.

ALTER TABLE "LinkedTradingAccount"
  ADD COLUMN "brokerSymbolSuffix"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN "brokerSymbolRenames" TEXT NOT NULL DEFAULT '{}';
