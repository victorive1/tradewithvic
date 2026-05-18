# Market Structure → Trade Setups

Adds a setup generator on top of the existing market-structure engine
(`src/lib/brain/structure.ts`) so structural events become actionable
`TradeSetup` rows. Mirrors the pattern already in place for FX Strength
and Retail-vs-Institution.

## Goal

Turn structural break events (BOS, CHoCH) into TradeSetup rows that:

- Render in a new "Trade Setups" sub-tab on `/dashboard/market-structure`
- Are auto-picked-up by the algo runtime (`src/lib/algos/runtime.ts`)
  via `setupType` filter
- Are auto-included in the Strategy Bible
- Work unchanged with the existing manual `ExecuteTradeButton`

No schema changes. No new persistence layer.

## Triggers

Generate a setup only when `analyzeStructure()` writes a
`StructureEvent` row (the existing engine only does this when bias
actually changes, so each setup corresponds to one real event — no
spam).

Two setup kinds:

- **`market_structure_bos`** (continuation) — BOS confirms the existing
  trend. Direction = trend direction. The setup is "the trend resumed
  after a pullback; enter on retest of the broken swing."
- **`market_structure_choch`** (reversal) — CHoCH flips bias. Direction =
  new bias direction. The setup is "trend has changed; enter on retest
  of the broken swing in the new direction."

## Entry / SL / TP model

Mirrors `src/lib/flow/setup-generator.ts`.

- **Entry**: `event.priceLevel` (the broken swing level). Limit order —
  wait for retest, do not chase.
- **Stop**: beyond the *opposite-side* most-recent swing + `0.3 × ATR(14)`
  buffer. For a bullish setup, SL goes below the most-recent swing low;
  for bearish, above the most-recent swing high.
- **TP1**: nearest `LiquidityZone` in the trade direction beyond entry,
  if one exists; fallback `entry ± 2R`.
- **TP2**: second `LiquidityZone` if present; fallback `entry ± 3R`.
- **TP3**: omitted (set null).

### Hard rejection filters

- `RR < 1.5` (computed on TP1) → return null.
- No opposite-side swing yet (insufficient history) → return null.
- Entry within `0.2 × ATR` of current price → return null (no retest
  edge; price has already moved past).
- 15m-only: setup direction must align with the 1h `StructureState`
  bias. 1h CHoCH against 4h bias is allowed (CHoCH = the flip itself).
  Without this guard 15m generates excessive countertrend noise.

## Scoring

Confidence score 0–100, mapped to `qualityGrade`:

| Score   | Grade |
|---------|-------|
| ≥ 80    | A+    |
| 65–79   | A     |
| 50–64   | B     |
| < 50    | C     |

Components:

- **Event quality** (0–25): BOS clean continuation (newBias === priorBias)
  gets 25. CHoCH gets 20 if the current `Regime.state` is not
  `"high_risk"`, 10 if it is.
- **Structure quality** (0–20): more recent confirmed swings = stronger
  trend. `min(20, swingsLast24h × 4)`.
- **RR** (0–20): `min(20, round(RR × 8))`. Caps at RR=2.5.
- **Multi-TF agreement** (0–20): higher TF is 1h for a 15m event and
  4h for a 1h event. If that higher TF's `StructureState.bias` matches
  the setup direction, +20; range/neutral, +10; opposed, 0. For 4h
  events there is no higher TF in scope, so this component scores 10
  (neutral).
- **Recency** (0–15): break candle within last 30 min = 15, decays linearly
  to 0 over 2h.

## Timeframes

Generate setups on **15m, 1h, 4h**. Lower TFs (5m) stay context-only;
they generate too many false breakouts to be tradeable. Timeframe
strings use the canonical project format (`"15min"`, `"1h"`, `"4h"`)
matching the existing scanner.

`analyzeAllStructure` continues to run for all TFs — the generator just
filters at the call site.

## Persistence

Write to existing `TradeSetup` table. Key fields:

- `setupType`: `"market_structure_bos"` or `"market_structure_choch"`
- `direction`: `"bullish"` or `"bearish"` (note: use these literal values
  for consistency with brain output — `isBullishDirection` will handle
  reads downstream)
- `symbol`, `timeframe`: from the event
- `entry`, `stopLoss`, `takeProfit1`, `takeProfit2`: as computed
- `riskReward`: TP1-based
- `qualityGrade`, `confidenceScore`: from scoring
- `validHours`: 6 for 1h/4h, 2 for 15m
- `metadata` (JSON): `{ eventId, eventType, priorBias, newBias, scoreBreakdown }`

Idempotency: before insert, check for an existing `TradeSetup` with
`(symbol, timeframe, setupType, metadata.eventId)`. If present, skip.
This protects against re-runs of `analyzeStructure` for the same event.

## Wiring

### New files

- `src/lib/brain/structure-setup-generator.ts` — pure function:
  `generateStructureSetup(event, state, ctx) → StructureSetupSpec | null`.
  No I/O, no DB. Mirrors `src/lib/flow/setup-generator.ts`.
- `src/lib/brain/structure-setup-persister.ts` — thin DB layer:
  `persistStructureSetup(spec) → TradeSetup | null` with the idempotency
  check.

### Modified files

- `src/lib/brain/structure.ts` — at the existing
  `prisma.structureEvent.create(...)` site (line ~217), call the
  generator with the event, current `StructureState`, and the most recent
  `LiquidityZone` rows. If non-null, call the persister.
- `src/app/dashboard/market-structure/page.tsx` — add a new "Trade
  Setups" sub-tab mirroring the FX Strength layout. Reads from
  `TradeSetup` with `setupType IN ('market_structure_bos',
  'market_structure_choch')` ordered by `createdAt desc`, limit 50.
  Each card shows direction, grade, conviction, entry, SL, TP, RR, posted
  time, and an Execute button.

### No changes needed

- Schema. `TradeSetup` already has every field used.
- Algo runtime. Will pick up the new `setupType` values automatically if
  any bot's `allowedSetupTypes` includes them. Bot config UI already
  exposes setupType selection; the new values appear once setups exist.
- Cron / scan loop. `analyzeStructure` already runs every cycle.

## Out of scope (v1)

- Swing-point rejection setups (touch-and-reject at unbroken swings).
- Re-entry logic if the first retest fails.
- Notifications / push alerts for new setups.
- Backtest harness specific to structure setups — the existing
  `src/lib/brain/learning.ts` pipeline picks these up via
  `TradeSetup` reads.
- 5m structure setups (too noisy).

## Failure modes & handling

- **Missing ATR data**: if `ctx.atr14` is null, fall back to a
  fixed-pip buffer (10p for FX, 5p for indices/metals). Log a warning.
- **No `LiquidityZone` rows for the symbol**: fall back to 2R/3R targets.
  Note in metadata so the UI can show "RR-based target, no liquidity
  confluence."
- **DB write fails** (idempotency race or constraint): catch, log, do
  not retry — next cycle will re-evaluate. Same approach as
  `algoBotExecution` writes in `runtime.ts`.
- **Stale events**: events older than 2h are skipped at the generator
  entry. Prevents back-filling setups on a fresh deploy or after a
  scanner outage.

## Verification

- TypeScript: `npx tsc --noEmit` clean.
- Manual sanity: trigger a fake event by inserting a `StructureEvent`
  row, confirm a `TradeSetup` row appears with the expected fields, and
  the UI sub-tab renders it.
- Direction consistency: spot-check three setups (one BOS bullish, one
  CHoCH bearish, one 15m-with-1h-aligned) for `entry`/`stopLoss`/`tp1`
  on the correct sides — same `isDirectionallyConsistent`-style sanity
  check used in mini templates.

## Estimated surface

- 1 new generator file (~150 LOC)
- 1 new persister file (~40 LOC)
- ~10 LOC added to `structure.ts`
- ~200 LOC added to the page for the new sub-tab (matching FX Strength
  size)
