# Support & Resistance → Trade Setups

Adds a setup generator on top of the existing `LiquidityZone` table
(populated by `src/lib/flow/scan.ts`) so zone-break events become
actionable `TradeSetup` rows. Mirrors the pattern shipped for Market
Structure, FX Strength, and Retail-vs-Institution.

## Goal

Turn zone-break events (a previously unbroken S&R level closes through)
into TradeSetup rows that:

- Render in a new "Trade Setups" sub-tab on `/dashboard/levels` (the S&R
  Engine page)
- Are auto-picked-up by the algo runtime (`src/lib/algos/runtime.ts`)
  via `setupType` filter
- Are auto-included in the Strategy Bible
- Work unchanged with the existing manual `ExecuteTradeButton`

No schema changes. No new persistence layer.

## Why brain-backed zones (not the synthetic page zones)

`/dashboard/levels` currently synthesizes 6 display-only zones per page
load from a single live quote (session high/low, prev close, round
numbers, midpoint). Those zones are not persisted and have no touch /
rejection / break history, so they cannot reliably trigger setups.

The real source is `LiquidityZone` — populated and maintained by the
flow scan (`src/lib/flow/scan.ts:147–186`). Every cycle it (a) creates
new zones with a deduplication fingerprint and (b) flips
`isFilled`/`isViolated` when price returns to or breaks a zone.

This blueprint uses `LiquidityZone` as the truth. A later phase may
also surface those zones on the Levels page above the synthetic ones.

## Triggers

Generate a setup when a `LiquidityZone` row's `isViolated` flag flips
to `true` (body close broke through the zone in the wrong direction —
the canonical breakout signal in the flow engine).

`isFilled = true` is **not** a setup trigger: for FVG/OB zones a fill
invalidates the zone. For pure liquidity references (equal highs/lows,
prev-day highs/lows) the engine treats fill and violation the same way.

One setup kind for v1:

- **`sr_zone_break`** (continuation in the break direction). Enter on
  retest of the broken zone — limit at the zone midpoint.

## Direction derivation

Each `LiquidityZone` is either *directional* (FVG, order block — has
`direction: "bullish" | "bearish"`) or *positional* (equal highs/lows,
session/prev-day/swing highs/lows — `direction` null).

For **directional** zones:

- Bullish zone violated (price closed below) → **bearish** continuation
- Bearish zone violated (price closed above) → **bullish** continuation

For **positional** zones, infer from `zoneType`:

- `equal_highs` / `session_high` / `prev_day_high` / `swing_high` →
  resistance. Violated upward → **bullish** continuation.
- `equal_lows` / `session_low` / `prev_day_low` / `swing_low` →
  support. Violated downward → **bearish** continuation.

The runner resolves "which side was broken" by comparing current price
to the zone's `priceLow` / `priceHigh` at the time the violation is
processed. If the inference is ambiguous (price between low and high),
skip the zone.

## Entry / SL / TP model

Mirrors the Market Structure generator.

- **Entry**: `(priceLow + priceHigh) / 2` of the broken zone — limit
  order, retest expected.
- **Stop**: far side of the broken zone + `0.3 × ATR(14)` buffer.
  Bullish setup: `SL = priceLow - 0.3·ATR`. Bearish: `SL = priceHigh + 0.3·ATR`.
- **TP1**: nearest opposing-direction `LiquidityZone` beyond entry, with
  minimum distance `1.5 × risk`; fallback `entry ± 2R`.
- **TP2**: second opposing zone beyond TP1 with min distance `0.5 × risk`;
  fallback `entry ± 3R`. Guard `TP2 > TP1` (bullish) / `TP2 < TP1`
  (bearish), else use 3R fallback.
- **TP3**: omitted (set null).

### Hard rejection filters

- `RR < 1.5` (computed on TP1) → return null.
- Risk ≤ 0 (or NaN) → return null. Use `!(risk > 0)`.
- Entry > `0.5 × ATR` past the current price in trade direction → null
  (no retest edge; the move has run too far).
- Ambiguous side (current price inside the zone) → null.
- Stale (zone's `updatedAt` is older than 2h) → null.

## Scoring

Confidence score 0–100. Same grade mapping as Market Structure:
≥80=A+, 65–79=A, 50–64=B, <50=C.

Components:

- **Zone strength** (0–25): `round(strengthScore × 0.25)`, capped at 25.
- **Timeframe quality** (0–20): `15min=10`, `1h=15`, `4h=20`. Other TFs = 5.
- **Risk/Reward** (0–20): `min(20, round(rr × 8))`.
- **Multi-TF agreement** (0–20): if a non-filled, non-violated
  `LiquidityZone` exists on a higher TF (1h for 15m, 4h for 1h, daily
  for 4h) within `2 × ATR(14)` of TP1 in the trade direction, +20. None
  in range, +10. Higher-TF zone *opposing* the trade direction, 0. For
  daily and above (no higher TF in scope) = 10 (neutral).
- **Recency** (0–15): 15 if violated within last 30 min; linear decay to
  0 over the next 90 min.

## Timeframes

Generate setups on **15min, 1h, 4h** zones only (matches Market
Structure). 5min zones too noisy. Daily/4h zones are eligible but the
multi-TF component scores neutral for them.

## Persistence

Write to existing `TradeSetup` table. Key fields:

- `setupType`: `"sr_zone_break"`
- `direction`: `"bullish"` or `"bearish"`
- `timeframe`: from the source zone
- entry / stopLoss / takeProfit1 / takeProfit2: as computed; TP3 null
- `riskReward`: TP1-based
- `qualityGrade`, `confidenceScore`: from scoring
- `validHours`: 2 for 15min, 4 for 1h, 6 for 4h
- `metadata` (JSON): `{ zoneId, zoneType, zoneDirection, brokenSide,
  scoreBreakdown, targetSource }` where `brokenSide` ∈ {"above",
  "below"} and `targetSource` ∈ {"liquidity_zone", "rr_fallback"}.

Idempotency: skip insert if a TradeSetup with the same `zoneId` in its
`metadataJson` already exists, created within the last 6 hours.

## Wiring

### New files

- `src/lib/brain/sr-setup-generator.ts` — pure function:
  `generateSrSetup(ctx) → SrSetupSpec | null`. No I/O, no DB. Mirrors
  `src/lib/brain/structure-setup-generator.ts`.
- `src/lib/brain/sr-setup-persister.ts` — thin DB layer:
  `persistSrSetup(spec, instrumentId)` with the idempotency check.
- `src/lib/brain/sr-setup-runner.ts` — cycle orchestrator: reads
  recently-violated `LiquidityZone` rows for cycle symbols, gathers
  context (current price, ATR, higher-TF zones, opposing zones), calls
  generator + persister.
- `src/app/api/sr/setups/route.ts` — GET endpoint returning the latest
  50 active `sr_zone_break` rows for the dashboard. Public read-only,
  matching the established pattern for read-only dashboard data routes.

### Modified files

- `src/lib/brain/scan.ts` — after `persistZonesForCycle` (one step
  below where `runStructureSetupGeneration` was just added), call
  `runSrSetupGeneration(cycleSymbols)`. Surface the run counts in the
  cycle return payload as `srSetups`. Wrap in `.catch` mirroring the
  structure-setup pattern.
- `src/app/dashboard/levels/page.tsx` — add a new "Trade Setups" sub-tab
  alongside whatever filter UI already exists. Fetch from
  `/api/sr/setups`; render card layout mirroring Market Structure's
  Setups tab. The tab must render independent of any per-symbol state
  (the setups list is global).

### No changes needed

- Schema. `TradeSetup` and `LiquidityZone` already have every field used.
- Flow scan. It already maintains `isFilled` / `isViolated`.
- Algo runtime. Picks up `"sr_zone_break"` automatically once a bot's
  `allowedSetupTypes` includes it.

## Out of scope (v1)

- Zone *rejection* setups (touch-and-bounce). Requires touch detection
  the engine doesn't currently track. Revisit once break setups produce
  signal.
- Filled-FVG re-entry. FVGs treat fill as invalidation in the flow scan,
  so re-entry is not a clean signal.
- Replacing the synthetic Levels page zones with brain-backed zones in
  the main view. Out of scope here; consider as a follow-up.
- Push notifications.

## Failure modes & handling

- **Missing ATR data**: fall back to a fixed-pip buffer (5p FX, 0.5pt
  metals/indices) mirroring the Market Structure generator.
- **No opposing zones in range**: use 2R/3R fallback. Tag metadata
  `targetSource = "rr_fallback"`.
- **DB write fails**: catch, log via runner's `errors[]`. No retry —
  next cycle re-evaluates.
- **Schema drift on zoneType**: validate `zoneType` against a known
  allow-list in the runner before passing to the generator. Skip
  unknown values silently (defensive).

## Verification

- TypeScript: `npx tsc --noEmit` clean.
- Manual sanity: spot-check one bullish and one bearish setup for
  `stopLoss < entry < tp1` (bullish) or `stopLoss > entry > tp1`
  (bearish), and confirm `RR = |tp1 - entry| / |entry - stopLoss| ≥ 1.5`.
- UI smoke: open `/dashboard/levels`, click the new tab, confirm cards
  render or the empty-state message appears.

## Estimated surface

- 1 new generator file (~200 LOC)
- 1 new persister file (~50 LOC)
- 1 new runner file (~150 LOC)
- 1 new API route (~30 LOC)
- ~25 LOC added to `scan.ts`
- ~80 LOC added to `levels/page.tsx`
