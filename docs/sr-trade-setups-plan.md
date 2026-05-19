# Support & Resistance → Trade Setups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate `TradeSetup` rows from `LiquidityZone` rows whose `isViolated` flipped to true, and render them in a new "Trade Setups" tab on `/dashboard/levels` (the S&R Engine page).

**Architecture:** Pure generator + idempotent persister + cycle-scoped runner, called once per scan after `persistZonesForCycle` (so zone state is fresh). Writes to existing `TradeSetup` table. Zero schema changes. Mirrors the just-shipped Market Structure → Trade Setups feature.

**Tech Stack:** Next.js 16, Prisma 7, React 19. Verification is `npx tsc --noEmit` + manual smoke (no test runner).

**Spec:** `docs/sr-trade-setups-blueprint.md`

---

## File Structure

- `src/lib/brain/sr-setup-generator.ts` — pure function. Takes a
  recently-violated zone + context (current price, ATR, opposing
  zones, higher-TF zones). Returns `SrSetupSpec | null`. No I/O.
- `src/lib/brain/sr-setup-persister.ts` — idempotent insert into
  `TradeSetup`. Idempotency key = `zoneId` inside `metadataJson`.
- `src/lib/brain/sr-setup-runner.ts` — orchestrator. Queries
  `LiquidityZone` rows with `updatedAt` in the last 10 min and
  `isViolated: true`. Gathers context, calls generator + persister.
- `src/lib/brain/scan.ts` — add one call to the runner after
  `persistZonesForCycle`.
- `src/app/api/sr/setups/route.ts` — public GET, returns latest 50
  active `sr_zone_break` setups.
- `src/app/dashboard/levels/page.tsx` — add "Trade Setups" tab.

---

### Task 1: Types + pure generator

**Files:**
- Create: `src/lib/brain/sr-setup-generator.ts`

- [ ] **Step 1: Write the generator file**

```ts
// src/lib/brain/sr-setup-generator.ts
//
// Pure function that turns a recently-violated LiquidityZone into a
// TradeSetup spec. No I/O, no DB. All context (ATR, current price,
// opposing zones, higher-TF zones) is passed in. Mirrors
// src/lib/brain/structure-setup-generator.ts.

export type SrZoneType =
  | "fvg" | "order_block"
  | "equal_highs" | "equal_lows"
  | "session_high" | "session_low"
  | "prev_day_high" | "prev_day_low"
  | "swing_high" | "swing_low";

export interface SrZoneInput {
  id: string;
  symbol: string;
  timeframe: string;
  zoneType: SrZoneType;
  direction: "bullish" | "bearish" | null;
  priceLow: number;
  priceHigh: number;
  strengthScore: number;
  updatedAt: Date;
}

export interface SrSetupSpec {
  setupType: "sr_zone_break";
  symbol: string;
  timeframe: string;
  direction: "bullish" | "bearish";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: null;
  riskReward: number;
  confidenceScore: number;
  qualityGrade: "A+" | "A" | "B" | "C";
  validHours: number;
  explanation: string;
  invalidation: string;
  metadata: {
    zoneId: string;
    zoneType: SrZoneType;
    zoneDirection: "bullish" | "bearish" | null;
    brokenSide: "above" | "below";
    scoreBreakdown: {
      zoneStrength: number;
      timeframeQuality: number;
      rr: number;
      multiTfAgreement: number;
      recency: number;
    };
    targetSource: "liquidity_zone" | "rr_fallback";
  };
}

export interface SrGeneratorContext {
  zone: SrZoneInput;
  currentPrice: number;
  atr14: number | null;
  // Active (not filled, not violated) zones on the same TF, for TP targets.
  // Should be sorted by priceHigh ascending or unordered — generator handles both.
  sameTfZones: SrZoneInput[];
  // Active zones on the next higher timeframe (1h for 15min, 4h for 1h,
  // daily for 4h). Used for the multi-TF agreement score component.
  higherTfZones: SrZoneInput[];
}

const POSITIONAL_HIGH_TYPES: Set<SrZoneType> = new Set([
  "equal_highs", "session_high", "prev_day_high", "swing_high",
]);
const POSITIONAL_LOW_TYPES: Set<SrZoneType> = new Set([
  "equal_lows", "session_low", "prev_day_low", "swing_low",
]);

function fallbackBuffer(symbol: string): number {
  if (/JPY$/.test(symbol)) return 0.05;
  if (/^XAU/.test(symbol)) return 0.5;
  if (/^(US30|NAS100|SPX500|GER40)$/.test(symbol)) return 0.5;
  return 0.0005;
}

function gradeFromScore(score: number): SrSetupSpec["qualityGrade"] {
  if (score >= 80) return "A+";
  if (score >= 65) return "A";
  if (score >= 50) return "B";
  return "C";
}

function timeframeQualityScore(tf: string): number {
  if (tf === "15min") return 10;
  if (tf === "1h") return 15;
  if (tf === "4h") return 20;
  return 5;
}

function validHoursForTf(tf: string): number {
  if (tf === "15min") return 2;
  if (tf === "1h") return 4;
  return 6;
}

function inferDirectionAndBrokenSide(
  zone: SrZoneInput,
  currentPrice: number,
): { direction: "bullish" | "bearish"; brokenSide: "above" | "below" } | null {
  // Directional zones: direction tells us the trade direction directly.
  if (zone.direction === "bullish") {
    // Bullish FVG/OB sits below price. Violated = price closed below it.
    if (currentPrice >= zone.priceLow) return null; // ambiguous
    return { direction: "bearish", brokenSide: "below" };
  }
  if (zone.direction === "bearish") {
    if (currentPrice <= zone.priceHigh) return null;
    return { direction: "bullish", brokenSide: "above" };
  }
  // Positional zones: infer from zoneType.
  if (POSITIONAL_HIGH_TYPES.has(zone.zoneType)) {
    if (currentPrice <= zone.priceHigh) return null;
    return { direction: "bullish", brokenSide: "above" };
  }
  if (POSITIONAL_LOW_TYPES.has(zone.zoneType)) {
    if (currentPrice >= zone.priceLow) return null;
    return { direction: "bearish", brokenSide: "below" };
  }
  return null;
}

function pickOpposingZone(
  zones: SrZoneInput[],
  from: number,
  direction: "bullish" | "bearish",
  minDistance: number,
): SrZoneInput | null {
  const candidates = zones
    .filter((z) => {
      const ref = direction === "bullish" ? z.priceLow : z.priceHigh;
      return direction === "bullish" ? ref > from + minDistance : ref < from - minDistance;
    })
    .sort((a, b) => {
      const refA = direction === "bullish" ? a.priceLow : a.priceHigh;
      const refB = direction === "bullish" ? b.priceLow : b.priceHigh;
      return direction === "bullish" ? refA - refB : refB - refA;
    });
  return candidates[0] ?? null;
}

export function generateSrSetup(ctx: SrGeneratorContext): SrSetupSpec | null {
  const { zone, currentPrice, atr14, sameTfZones, higherTfZones } = ctx;

  // Stale zones (>2h) → null
  const ageMs = Date.now() - zone.updatedAt.getTime();
  if (ageMs > 2 * 60 * 60 * 1000) return null;

  const inferred = inferDirectionAndBrokenSide(zone, currentPrice);
  if (!inferred) return null;
  const { direction, brokenSide } = inferred;

  const entry = (zone.priceLow + zone.priceHigh) / 2;
  const buffer = atr14 != null ? atr14 * 0.3 : fallbackBuffer(zone.symbol);
  const stopLoss = direction === "bullish" ? zone.priceLow - buffer : zone.priceHigh + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (!(risk > 0)) return null;

  // "Already moved past" filter: entry must still be within retest range
  // of current price (no more than 0.5*ATR away in the trade direction).
  if (atr14 != null) {
    const movedPast = direction === "bullish"
      ? currentPrice > entry + atr14 * 0.5
      : currentPrice < entry - atr14 * 0.5;
    if (movedPast) return null;
  }

  // TP1: nearest opposing-direction zone with min 1.5*risk distance.
  const tp1Zone = pickOpposingZone(sameTfZones, entry, direction, risk * 1.5);
  const tp1FromZone = tp1Zone ? (direction === "bullish" ? tp1Zone.priceLow : tp1Zone.priceHigh) : null;
  const tp1 = tp1FromZone ?? (direction === "bullish" ? entry + risk * 2 : entry - risk * 2);
  const tp1Source: SrSetupSpec["metadata"]["targetSource"] =
    tp1FromZone != null ? "liquidity_zone" : "rr_fallback";

  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 1.5) return null;

  // TP2: second opposing zone beyond TP1 with min 0.5*risk distance, with
  // a strict-beyond-TP1 guard against tied prices. Fallback to 3R.
  const tp2Zone = pickOpposingZone(sameTfZones, tp1, direction, risk * 0.5);
  const tp2FromZone = tp2Zone ? (direction === "bullish" ? tp2Zone.priceLow : tp2Zone.priceHigh) : null;
  const tp2Raw = tp2FromZone ?? (direction === "bullish" ? entry + risk * 3 : entry - risk * 3);
  const tp2Valid = direction === "bullish" ? tp2Raw > tp1 : tp2Raw < tp1;
  const tp2 = tp2Valid ? tp2Raw : (direction === "bullish" ? entry + risk * 3 : entry - risk * 3);

  // ── Scoring ───────────────────────────────────────────────────────
  const zoneStrength = Math.min(25, Math.round(zone.strengthScore * 0.25));
  const tfQuality = timeframeQualityScore(zone.timeframe);
  const rrScore = Math.min(20, Math.round(rr * 8));

  // Multi-TF agreement: look for a higher-TF zone in the trade direction
  // within 2*ATR of TP1.
  let multiTfAgreement = 10;
  if (atr14 != null && higherTfZones.length > 0) {
    const window = 2 * atr14;
    const aligned = higherTfZones.some((z) => {
      // The higher-TF zone is "in trade direction" if its price band is
      // beyond entry in the trade direction (i.e. it's a confluence
      // opposing-side wall the move can stretch into).
      const ref = direction === "bullish" ? z.priceLow : z.priceHigh;
      const beyondEntry = direction === "bullish" ? ref > entry : ref < entry;
      return beyondEntry && Math.abs(ref - tp1) <= window;
    });
    const opposing = higherTfZones.some((z) => {
      // A higher-TF zone *between* entry and TP1 in the wrong direction
      // would block the move. Detect by checking if a zone sits with its
      // mid between entry and TP1 on the opposite side of the trade.
      const mid = (z.priceLow + z.priceHigh) / 2;
      if (direction === "bullish") return mid > entry && mid < tp1 && z.direction === "bearish";
      return mid < entry && mid > tp1 && z.direction === "bullish";
    });
    if (aligned && !opposing) multiTfAgreement = 20;
    else if (opposing) multiTfAgreement = 0;
    else multiTfAgreement = 10;
  }

  // Recency: 15 within 30min, decays to 0 over next 90min.
  const minutesOld = ageMs / (60 * 1000);
  const recency = minutesOld <= 30
    ? 15
    : Math.max(0, Math.round(15 * (1 - (minutesOld - 30) / 90)));

  const confidenceScore = Math.min(100, Math.max(0,
    zoneStrength + tfQuality + rrScore + multiTfAgreement + recency,
  ));
  const qualityGrade = gradeFromScore(confidenceScore);

  const dirLabel = direction === "bullish" ? "Bullish" : "Bearish";
  const explanation =
    `${dirLabel} S&R zone break on ${zone.timeframe}. ` +
    `${zone.zoneType.replace(/_/g, " ")} zone at ${zone.priceLow.toFixed(5)}–${zone.priceHigh.toFixed(5)} ` +
    `was violated (price closed ${brokenSide}). ` +
    `Enter on retest of zone midpoint ${entry.toFixed(5)}. ` +
    `Stop ${stopLoss.toFixed(5)} (zone far side + ${atr14 != null ? "0.3×ATR" : "fallback buffer"}). ` +
    `TP1 ${tp1.toFixed(5)} ${tp1Source === "liquidity_zone" ? "(opposing zone)" : "(2R fallback)"}, ` +
    `TP2 ${tp2.toFixed(5)}. RR ${rr.toFixed(2)}.`;
  const invalidation =
    `Price closes back through ${stopLoss.toFixed(5)} into the zone. ` +
    `Failed retest → setup invalidated.`;

  return {
    setupType: "sr_zone_break",
    symbol: zone.symbol,
    timeframe: zone.timeframe,
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: null,
    riskReward: rr,
    confidenceScore,
    qualityGrade,
    validHours: validHoursForTf(zone.timeframe),
    explanation,
    invalidation,
    metadata: {
      zoneId: zone.id,
      zoneType: zone.zoneType,
      zoneDirection: zone.direction,
      brokenSide,
      scoreBreakdown: {
        zoneStrength,
        timeframeQuality: tfQuality,
        rr: rrScore,
        multiTfAgreement,
        recency,
      },
      targetSource: tp1Source,
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/brain/sr-setup-generator.ts
git commit -m "$(cat <<'EOF'
S&R: pure setup generator (zone-break → spec)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Idempotent persister

**Files:**
- Create: `src/lib/brain/sr-setup-persister.ts`

- [ ] **Step 1: Write the persister**

```ts
// src/lib/brain/sr-setup-persister.ts
//
// Idempotent insert of an SrSetupSpec into the TradeSetup table.
// Idempotency: skip if an active TradeSetup with the same zoneId in
// its metadataJson already exists, created in the last 6 hours.

import { prisma } from "@/lib/prisma";
import type { SrSetupSpec } from "@/lib/brain/sr-setup-generator";

export async function persistSrSetup(
  spec: SrSetupSpec,
  instrumentId: string,
): Promise<{ created: boolean; id: string | null }> {
  const zoneIdMarker = `"zoneId":"${spec.metadata.zoneId}"`;
  const existing = await prisma.tradeSetup.findFirst({
    where: {
      symbol: spec.symbol,
      timeframe: spec.timeframe,
      setupType: spec.setupType,
      createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      metadataJson: { contains: zoneIdMarker },
    },
    select: { id: true },
  });
  if (existing) return { created: false, id: existing.id };

  const validUntil = new Date(Date.now() + spec.validHours * 60 * 60 * 1000);

  const created = await prisma.tradeSetup.create({
    data: {
      instrumentId,
      symbol: spec.symbol,
      direction: spec.direction,
      setupType: spec.setupType,
      timeframe: spec.timeframe,
      entry: spec.entry,
      stopLoss: spec.stopLoss,
      takeProfit1: spec.takeProfit1,
      takeProfit2: spec.takeProfit2,
      takeProfit3: spec.takeProfit3,
      riskReward: spec.riskReward,
      confidenceScore: spec.confidenceScore,
      qualityGrade: spec.qualityGrade,
      explanation: spec.explanation,
      invalidation: spec.invalidation,
      metadataJson: JSON.stringify(spec.metadata),
      status: "active",
      validUntil,
    },
    select: { id: true },
  });

  return { created: true, id: created.id };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/brain/sr-setup-persister.ts
git commit -m "$(cat <<'EOF'
S&R: idempotent persister for zone-break setups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Cycle runner

**Files:**
- Create: `src/lib/brain/sr-setup-runner.ts`

- [ ] **Step 1: Write the runner**

```ts
// src/lib/brain/sr-setup-runner.ts
//
// Orchestrates LiquidityZone violations → TradeSetup generation for
// one scan cycle. Reads zones whose updatedAt is within the last
// 10 min AND isViolated=true; for each, gathers context (current
// price, ATR, opposing same-TF zones, higher-TF zones), runs the
// pure generator, persists the result.
//
// Runs AFTER persistZonesForCycle in scan.ts so zone state is fresh.

import { prisma } from "@/lib/prisma";
import { generateSrSetup, type SrZoneInput, type SrZoneType } from "@/lib/brain/sr-setup-generator";
import { persistSrSetup } from "@/lib/brain/sr-setup-persister";

const ELIGIBLE_TIMEFRAMES = new Set(["15min", "1h", "4h"]);
const VALID_ZONE_TYPES: Set<SrZoneType> = new Set([
  "fvg", "order_block",
  "equal_highs", "equal_lows",
  "session_high", "session_low",
  "prev_day_high", "prev_day_low",
  "swing_high", "swing_low",
]);

function higherTfFor(tf: string): string | null {
  if (tf === "15min") return "1h";
  if (tf === "1h") return "4h";
  if (tf === "4h") return "1d";
  return null;
}

async function computeAtr14(symbol: string, timeframe: string): Promise<number | null> {
  const rows = await prisma.candle.findMany({
    where: { symbol, timeframe, isClosed: true },
    orderBy: { openTime: "desc" },
    take: 15,
    select: { high: true, low: true, close: true },
  });
  if (rows.length < 15) return null;
  const ordered = rows.reverse();
  const trs: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const c = ordered[i];
    const prev = ordered[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

export interface SrSetupRunResult {
  zonesConsidered: number;
  setupsCreated: number;
  setupsSkippedExisting: number;
  setupsRejectedByGenerator: number;
  errors: string[];
}

function toSrZoneInput(raw: {
  id: string;
  symbol: string;
  timeframe: string;
  zoneType: string;
  direction: string | null;
  priceLow: number;
  priceHigh: number;
  strengthScore: number;
  updatedAt: Date;
}): SrZoneInput | null {
  if (!VALID_ZONE_TYPES.has(raw.zoneType as SrZoneType)) return null;
  const dir = raw.direction === "bullish" || raw.direction === "bearish" ? raw.direction : null;
  return {
    id: raw.id,
    symbol: raw.symbol,
    timeframe: raw.timeframe,
    zoneType: raw.zoneType as SrZoneType,
    direction: dir,
    priceLow: raw.priceLow,
    priceHigh: raw.priceHigh,
    strengthScore: raw.strengthScore,
    updatedAt: raw.updatedAt,
  };
}

export async function runSrSetupGeneration(
  cycleSymbols: readonly string[],
): Promise<SrSetupRunResult> {
  const result: SrSetupRunResult = {
    zonesConsidered: 0,
    setupsCreated: 0,
    setupsSkippedExisting: 0,
    setupsRejectedByGenerator: 0,
    errors: [],
  };
  if (cycleSymbols.length === 0) return result;

  const sinceMs = Date.now() - 10 * 60 * 1000;
  const violated = await prisma.liquidityZone.findMany({
    where: {
      symbol: { in: [...cycleSymbols] },
      isViolated: true,
      updatedAt: { gte: new Date(sinceMs) },
    },
    orderBy: { updatedAt: "desc" },
  });

  for (const raw of violated) {
    if (!ELIGIBLE_TIMEFRAMES.has(raw.timeframe)) continue;
    const zone = toSrZoneInput(raw);
    if (!zone) continue;
    result.zonesConsidered++;

    try {
      const lastCandle = await prisma.candle.findFirst({
        where: { symbol: zone.symbol, timeframe: zone.timeframe, isClosed: true },
        orderBy: { openTime: "desc" },
        select: { close: true },
      });
      const currentPrice = lastCandle?.close;
      if (currentPrice == null) continue;

      const atr14 = await computeAtr14(zone.symbol, zone.timeframe);

      const sameTfRaw = await prisma.liquidityZone.findMany({
        where: {
          symbol: zone.symbol,
          timeframe: zone.timeframe,
          isFilled: false,
          isViolated: false,
        },
        take: 30,
      });
      const sameTfZones = sameTfRaw
        .map(toSrZoneInput)
        .filter((z): z is SrZoneInput => z !== null);

      const higherTf = higherTfFor(zone.timeframe);
      const higherTfRaw = higherTf
        ? await prisma.liquidityZone.findMany({
            where: {
              symbol: zone.symbol,
              timeframe: higherTf,
              isFilled: false,
              isViolated: false,
            },
            take: 30,
          })
        : [];
      const higherTfZones = higherTfRaw
        .map(toSrZoneInput)
        .filter((z): z is SrZoneInput => z !== null);

      const instrument = await prisma.instrument.findFirst({
        where: { symbol: zone.symbol },
        select: { id: true },
      });
      if (!instrument) continue;

      const spec = generateSrSetup({ zone, currentPrice, atr14, sameTfZones, higherTfZones });
      if (!spec) {
        result.setupsRejectedByGenerator++;
        continue;
      }

      const persisted = await persistSrSetup(spec, instrument.id);
      if (persisted.created) result.setupsCreated++;
      else result.setupsSkippedExisting++;
    } catch (err) {
      result.errors.push(`${zone.symbol} ${zone.timeframe}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If the schema's `LiquidityZone.zoneType` is `String` and the cast doesn't compile, the runtime guard `VALID_ZONE_TYPES.has(raw.zoneType as SrZoneType)` covers correctness; the cast inside `toSrZoneInput` is safe because we've already validated.

- [ ] **Step 3: Commit**

```bash
git add src/lib/brain/sr-setup-runner.ts
git commit -m "$(cat <<'EOF'
S&R: cycle runner that gathers context + persists

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire runner into scan.ts

**Files:**
- Modify: `src/lib/brain/scan.ts`

- [ ] **Step 1: Add the import**

Near the other `@/lib/brain/*` imports at the top of `src/lib/brain/scan.ts`, add:

```ts
import { runSrSetupGeneration } from "@/lib/brain/sr-setup-runner";
```

- [ ] **Step 2: Insert the call after `persistZonesForCycle`**

Find the existing `persistZonesForCycle(...)` block in `scan.ts` (around line 146). Immediately after that block ends (after the closing `})` of its `.catch`), add:

```ts
    // S&R setup generation. Runs after persistZonesForCycle so any
    // zones violated this cycle have isViolated=true persisted.
    const srSetupResult = await runSrSetupGeneration(cycleSymbols).catch((err) => {
      errors.push(`sr-setups: ${err?.message ?? String(err)}`);
      return { zonesConsidered: 0, setupsCreated: 0, setupsSkippedExisting: 0, setupsRejectedByGenerator: 0, errors: [] };
    });
```

Match indentation of surrounding code exactly (likely 4 spaces).

- [ ] **Step 3: Surface counts in cycle return payload**

Search for `structureSetups:` (added in the prior Market Structure feature). Right after that field in the cycle handler's return object literal, add a sibling field:

```ts
      srSetups: {
        considered: srSetupResult.zonesConsidered,
        created: srSetupResult.setupsCreated,
        skippedExisting: srSetupResult.setupsSkippedExisting,
        rejected: srSetupResult.setupsRejectedByGenerator,
      },
```

If the explicit return type (`ScanCycleResult` interface in the same file) doesn't allow the new field, add it there with the same shape (all 4 fields are `number`).

Also add a zero-valued `srSetups` to the failure-path catch return (mirroring how `structureSetups` was added there in the prior feature).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brain/scan.ts
git commit -m "$(cat <<'EOF'
S&R: invoke setup generation in scan cycle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: API route + UI sub-tab

**Files:**
- Create: `src/app/api/sr/setups/route.ts`
- Modify: `src/app/dashboard/levels/page.tsx`

- [ ] **Step 1: Create the API route**

Create `src/app/api/sr/setups/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const setups = await prisma.tradeSetup.findMany({
    where: {
      setupType: "sr_zone_break",
      status: "active",
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      symbol: true,
      timeframe: true,
      direction: true,
      setupType: true,
      entry: true,
      stopLoss: true,
      takeProfit1: true,
      takeProfit2: true,
      riskReward: true,
      confidenceScore: true,
      qualityGrade: true,
      explanation: true,
      invalidation: true,
      createdAt: true,
      validUntil: true,
    },
  });
  return NextResponse.json({ setups });
}
```

- [ ] **Step 2: Add tab state + interface + fetch effect to levels page**

The current `/dashboard/levels/page.tsx` is a 297-line client component without a tab system — it directly renders zone cards filtered by `typeFilter` and `timeframeFilter`. We need to add a tab toggle above the existing zone list that switches between "Zones" (the existing content) and "Trade Setups" (new).

Near the existing `useState` hooks (around line 95–102), add:

```ts
const [activeTab, setActiveTab] = useState<"zones" | "setups">("zones");
const [setupsList, setSetupsList] = useState<SrSetupRow[]>([]);

useEffect(() => {
  if (activeTab !== "setups") return;
  let cancelled = false;
  fetch("/api/sr/setups")
    .then((r) => r.json())
    .then((d) => { if (!cancelled) setSetupsList(d.setups ?? []); })
    .catch(() => { if (!cancelled) setSetupsList([]); });
  return () => { cancelled = true; };
}, [activeTab]);
```

Add this interface near the top of the file (after the `SRZone` interface around line 22):

```ts
interface SrSetupRow {
  id: string;
  symbol: string;
  timeframe: string;
  direction: string;
  setupType: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  riskReward: number;
  confidenceScore: number;
  qualityGrade: string;
  explanation: string | null;
  invalidation: string | null;
  createdAt: string;
  validUntil: string | null;
}
```

Ensure these imports exist at the top of the file (add what's missing — do not duplicate):

```ts
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getDirectionBg, getDirectionColor, getGradeColor } from "@/lib/utils";
```

- [ ] **Step 3: Add the tab toggle and panels**

Find the existing zone-list JSX (it's inside the page's main return — the block that maps over `filteredZones`). Above that block, add a simple two-tab toggle:

```tsx
<div className="mb-4 flex gap-2 border-b border-zinc-800">
  <button
    onClick={() => setActiveTab("zones")}
    className={cn(
      "px-3 py-2 text-sm",
      activeTab === "zones" ? "border-b-2 border-emerald-400 text-emerald-400" : "text-zinc-400"
    )}
  >
    Zones
  </button>
  <button
    onClick={() => setActiveTab("setups")}
    className={cn(
      "px-3 py-2 text-sm",
      activeTab === "setups" ? "border-b-2 border-emerald-400 text-emerald-400" : "text-zinc-400"
    )}
  >
    Trade Setups
  </button>
</div>
```

Then wrap the existing zone-list block with a guard so it only renders when `activeTab === "zones"`:

```tsx
{activeTab === "zones" && (
  /* existing zone-list JSX here, unchanged */
)}
```

And immediately after that block, add the setups panel:

```tsx
{activeTab === "setups" && (
  <div className="space-y-3">
    {setupsList.length === 0 ? (
      <div className="text-sm text-zinc-400">
        No active S&R setups. Setups appear here once a LiquidityZone is broken on a 15m, 1h, or 4h timeframe.
      </div>
    ) : (
      setupsList.map((s) => (
        <div key={s.id} className={cn("rounded-xl border p-4", getDirectionBg(s.direction))}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">
                <span className={cn("mr-2 font-semibold", getDirectionColor(s.direction))}>
                  {s.direction.toUpperCase()}
                </span>
                {s.symbol} · {s.timeframe} ·{" "}
                <span className="uppercase text-zinc-300">S&R BREAK</span>
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                Posted {new Date(s.createdAt).toLocaleString()} · expires{" "}
                {s.validUntil ? new Date(s.validUntil).toLocaleString() : "—"}
              </div>
            </div>
            <div className="text-right">
              <div className={cn("text-sm font-semibold", getGradeColor(s.qualityGrade))}>{s.qualityGrade}</div>
              <div className="text-xs text-zinc-400">conv {s.confidenceScore}/100</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div><div className="text-zinc-500">Entry</div><div>{s.entry.toFixed(5)}</div></div>
            <div><div className="text-zinc-500">Stop</div><div>{s.stopLoss.toFixed(5)}</div></div>
            <div><div className="text-zinc-500">TP1</div><div>{s.takeProfit1.toFixed(5)}</div></div>
            <div><div className="text-zinc-500">RR</div><div>{s.riskReward.toFixed(2)}R</div></div>
          </div>
          {s.explanation && <div className="mt-3 text-xs text-zinc-300">{s.explanation}</div>}
        </div>
      ))
    )}
  </div>
)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual smoke**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard/levels`. Confirm:
- The new "Zones" / "Trade Setups" tab toggle appears.
- Clicking "Trade Setups" either shows the empty-state message (likely, until a zone is violated on a cycle symbol) or a list of setup cards.
- Clicking "Zones" returns to the existing zone view, unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sr/setups/route.ts src/app/dashboard/levels/page.tsx
git commit -m "$(cat <<'EOF'
S&R: Trade Setups tab + API route on /dashboard/levels

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done

After Task 5, the next scan cycle (every 2 min) will scan recently-violated LiquidityZones, generate setups, and persist them. They appear under the Trade Setups tab on `/dashboard/levels`. The algo runtime auto-picks them up for any bot whose `allowedSetupTypes` includes `sr_zone_break`.

## Out of scope (per blueprint)

- Zone rejection setups (touch-and-bounce).
- Filled-FVG re-entry.
- Replacing the synthetic Levels page zones with brain-backed zones in the main view.
- Push notifications.
