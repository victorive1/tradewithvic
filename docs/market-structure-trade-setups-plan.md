# Market Structure → Trade Setups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate `TradeSetup` rows from `StructureEvent`s and render them in a "Trade Setups" tab on `/dashboard/market-structure`, so structural BOS/CHoCH events become tradeable (manual Execute button + algo runtime + Strategy Bible).

**Architecture:** Pure generator + thin persister + cycle-scoped runner, called once per scan after liquidity analysis (so liquidity zones are fresh). Writes to the existing `TradeSetup` table — zero schema changes. UI mirrors the FX Strength sub-tab pattern.

**Tech Stack:** Next.js 16, Prisma 7, React 19, Tailwind 4. Verification rhythm is `npx tsc --noEmit` + manual smoke (this repo has no test runner).

**Spec:** `docs/market-structure-trade-setups-blueprint.md`

---

## File Structure

- `src/lib/brain/structure-setup-generator.ts` — pure function. Takes
  `StructureEvent` + `StructureState` + context (atr, regime,
  higher-TF state, liquidity zones, current price). Returns
  `StructureSetupSpec | null`. No I/O.
- `src/lib/brain/structure-setup-persister.ts` — thin DB layer.
  Idempotent insert into `TradeSetup`.
- `src/lib/brain/structure-setup-runner.ts` — orchestrator. Reads
  recent unprocessed `StructureEvent` rows, gathers context, calls
  generator + persister. Called once per scan cycle.
- `src/lib/brain/scan.ts` — add one call to the runner after liquidity
  analysis.
- `src/app/dashboard/market-structure/page.tsx` — add a 6th tab,
  "Setups", that lists the latest market-structure TradeSetup rows.

---

### Task 1: Types + pure generator

**Files:**
- Create: `src/lib/brain/structure-setup-generator.ts`

- [ ] **Step 1: Write the generator file**

```ts
// src/lib/brain/structure-setup-generator.ts
//
// Pure function that turns a single StructureEvent into a TradeSetup
// spec. No I/O, no DB. All context (ATR, regime, higher-TF bias,
// liquidity zones, current price) is passed in. Mirrors
// src/lib/flow/setup-generator.ts so the surrounding wiring is
// familiar.

// Minimal inline shapes — decoupled from Prisma so the generator stays
// pure and unit-test friendly. Callers (the runner) pass plain objects
// matching these shapes; Prisma's generated types are assignable to them.

export interface StructureEventInput {
  id: string;
  symbol: string;
  timeframe: string;
  eventType: "bos_bullish" | "bos_bearish" | "choch_bullish" | "choch_bearish";
  priceLevel: number;
  brokerCandleTime: Date;
  priorBias: string;
  newBias: string;
}

export interface StructureStateInput {
  bias: string;
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  candlesAnalyzed: number;
}

export interface RegimeInput {
  state: string;
}

export interface LiquidityZoneInput {
  priceHigh: number;
  priceLow: number;
}

export interface StructureSetupSpec {
  setupType: "market_structure_bos" | "market_structure_choch";
  symbol: string;
  timeframe: string;
  direction: "bullish" | "bearish";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: null;
  riskReward: number;
  confidenceScore: number;          // 0–100
  qualityGrade: "A+" | "A" | "B" | "C";
  validHours: number;
  explanation: string;
  invalidation: string;
  metadata: {
    eventId: string;
    eventType: StructureEventInput["eventType"];
    priorBias: string;
    newBias: string;
    scoreBreakdown: {
      eventQuality: number;
      structureQuality: number;
      rr: number;
      multiTfAgreement: number;
      recency: number;
    };
    targetSource: "liquidity_zone" | "rr_fallback";
  };
}

export interface GeneratorContext {
  event: StructureEventInput;
  state: StructureStateInput;
  higherTfState: StructureStateInput | null;   // 1h for a 15m event, 4h for a 1h event, null for 4h
  regime: RegimeInput | null;
  liquidityZones: LiquidityZoneInput[];        // active zones for this symbol/timeframe
  atr14: number | null;                        // 14-period ATR on the event's timeframe
  currentPrice: number;
}

// 5-pip in price (forex) / 0.5pt (indices, metals). Used as fallback
// when ATR is missing. Mirrors the buffer convention in
// src/lib/flow/setup-generator.ts.
function fallbackBuffer(symbol: string): number {
  if (/JPY$/.test(symbol)) return 0.05;
  if (/^XAU/.test(symbol)) return 0.5;
  if (/^US30|NAS100|SPX500|GER40/.test(symbol)) return 0.5;
  return 0.0005;
}

function gradeFromScore(score: number): StructureSetupSpec["qualityGrade"] {
  if (score >= 80) return "A+";
  if (score >= 65) return "A";
  if (score >= 50) return "B";
  return "C";
}

export function generateStructureSetup(ctx: GeneratorContext): StructureSetupSpec | null {
  const { event, state, higherTfState, regime, liquidityZones, atr14, currentPrice } = ctx;

  // Skip stale events. Prevents back-filling on a fresh deploy or after
  // a scanner outage.
  const eventAgeMs = Date.now() - event.brokerCandleTime.getTime();
  if (eventAgeMs > 2 * 60 * 60 * 1000) return null;

  const isBullishEvent = event.eventType === "bos_bullish" || event.eventType === "choch_bullish";
  const direction: "bullish" | "bearish" = isBullishEvent ? "bullish" : "bearish";
  const setupType: StructureSetupSpec["setupType"] =
    event.eventType.startsWith("bos_") ? "market_structure_bos" : "market_structure_choch";

  // 15m alignment guard: 15m setups must agree with 1h bias.
  if (event.timeframe === "15min" && higherTfState && higherTfState.bias !== direction) {
    return null;
  }

  // Opposite-side swing for SL placement.
  const oppositeSwing = direction === "bullish" ? state.lastSwingLow : state.lastSwingHigh;
  if (oppositeSwing == null) return null;

  const buffer = atr14 != null ? atr14 * 0.3 : fallbackBuffer(event.symbol);
  const entry = event.priceLevel;
  const stopLoss = direction === "bullish" ? oppositeSwing - buffer : oppositeSwing + buffer;
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;

  // "Already moved past" filter — if price has already left the entry
  // zone by more than 0.2 * ATR, there's no retest edge.
  const distanceToEntry = Math.abs(currentPrice - entry);
  const movedPast = atr14 != null && distanceToEntry > atr14 * 0.2 &&
    (direction === "bullish" ? currentPrice > entry : currentPrice < entry);
  if (movedPast) return null;

  // TP1: nearest liquidity zone in the trade direction beyond entry.
  // Fallback: entry +/- 2R.
  const tp1Target = pickLiquidityTarget(liquidityZones, entry, direction, risk * 1.5);
  const tp1 = tp1Target.price ?? (direction === "bullish" ? entry + risk * 2 : entry - risk * 2);
  const tp1Source: "liquidity_zone" | "rr_fallback" = tp1Target.price != null ? "liquidity_zone" : "rr_fallback";

  const rr = Math.abs(tp1 - entry) / risk;
  if (rr < 1.5) return null;

  // TP2: second liquidity zone beyond TP1, or 3R fallback.
  const tp2Target = pickLiquidityTarget(liquidityZones, tp1, direction, risk * 0.5);
  const tp2 = tp2Target.price ?? (direction === "bullish" ? entry + risk * 3 : entry - risk * 3);

  // ── Scoring ───────────────────────────────────────────────────────
  let eventQuality: number;
  if (setupType === "market_structure_bos") {
    eventQuality = event.priorBias === event.newBias ? 25 : 18;
  } else {
    eventQuality = regime && regime.state !== "high_risk" ? 20 : 10;
  }

  const recentSwings = state.candlesAnalyzed > 0 ? Math.min(5, state.candlesAnalyzed / 40) : 0;
  const structureQuality = Math.min(20, Math.round(recentSwings * 4));

  const rrScore = Math.min(20, Math.round(rr * 8));

  let multiTfAgreement = 10; // neutral default (also used when there is no higher TF in scope, e.g. 4h events)
  if (higherTfState) {
    if (higherTfState.bias === direction) multiTfAgreement = 20;
    else if (higherTfState.bias === "range") multiTfAgreement = 10;
    else multiTfAgreement = 0;
  }

  // Recency: 15 if break within last 30 min, decays linearly to 0 over 2h.
  const minutesOld = eventAgeMs / (60 * 1000);
  const recency = minutesOld <= 30 ? 15 : Math.max(0, Math.round(15 * (1 - (minutesOld - 30) / 90)));

  const confidenceScore = Math.min(100, Math.max(0, eventQuality + structureQuality + rrScore + multiTfAgreement + recency));
  const qualityGrade = gradeFromScore(confidenceScore);

  const explanation =
    `${setupType === "market_structure_bos" ? "BOS continuation" : "CHoCH reversal"} on ${event.timeframe}. ` +
    `Break of ${event.eventType.includes("bullish") ? "swing high" : "swing low"} at ${entry.toFixed(5)} confirms ${direction} direction. ` +
    `Enter on retest of ${entry.toFixed(5)}. ` +
    `Stop beyond opposing swing at ${stopLoss.toFixed(5)} (${atr14 != null ? "0.3×ATR buffer" : "fallback buffer"}). ` +
    `TP1 ${tp1.toFixed(5)} ${tp1Source === "liquidity_zone" ? "(nearest liquidity)" : "(2R fallback)"}, TP2 ${tp2.toFixed(5)}. ` +
    `RR ${rr.toFixed(2)}.`;

  const invalidation =
    `Price closes through ${stopLoss.toFixed(5)}. If structure flips back before retest, setup is invalidated.`;

  return {
    setupType,
    symbol: event.symbol,
    timeframe: event.timeframe,
    direction,
    entry,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    takeProfit3: null,
    riskReward: rr,
    confidenceScore,
    qualityGrade,
    validHours: event.timeframe === "15min" ? 2 : 6,
    explanation,
    invalidation,
    metadata: {
      eventId: event.id,
      eventType: event.eventType,
      priorBias: event.priorBias,
      newBias: event.newBias,
      scoreBreakdown: { eventQuality, structureQuality, rr: rrScore, multiTfAgreement, recency },
      targetSource: tp1Source,
    },
  };
}

function pickLiquidityTarget(
  zones: LiquidityZone[],
  from: number,
  direction: "bullish" | "bearish",
  minDistance: number,
): { price: number | null } {
  const candidates = zones
    .map((z) => (direction === "bullish" ? z.priceHigh : z.priceLow))
    .filter((p) => (direction === "bullish" ? p > from + minDistance : p < from - minDistance))
    .sort((a, b) => (direction === "bullish" ? a - b : b - a));
  return { price: candidates[0] ?? null };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/brain/structure-setup-generator.ts
git commit -m "Market Structure: pure setup generator (BOS/CHoCH → spec)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Persister with idempotency

**Files:**
- Create: `src/lib/brain/structure-setup-persister.ts`

- [ ] **Step 1: Write the persister file**

```ts
// src/lib/brain/structure-setup-persister.ts
//
// Idempotent insert of a StructureSetupSpec into the TradeSetup table.
// Idempotency: skip if an active TradeSetup with the same eventId in
// its metadataJson already exists. The eventId comes from a single,
// write-once StructureEvent row, so this is sufficient.

import { prisma } from "@/lib/prisma";
import type { StructureSetupSpec } from "@/lib/brain/structure-setup-generator";

export async function persistStructureSetup(
  spec: StructureSetupSpec,
  instrumentId: string,
): Promise<{ created: boolean; id: string | null }> {
  // Cheap pre-check using a recent-window filter and a JSON substring
  // contains. This is a small table per-symbol so the scan is fine.
  // The substring is anchored to the JSON key/value pair to avoid
  // accidental matches.
  const eventIdMarker = `"eventId":"${spec.metadata.eventId}"`;
  const existing = await prisma.tradeSetup.findFirst({
    where: {
      symbol: spec.symbol,
      timeframe: spec.timeframe,
      setupType: spec.setupType,
      createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      metadataJson: { contains: eventIdMarker },
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
git add src/lib/brain/structure-setup-persister.ts
git commit -m "Market Structure: idempotent persister for structure setups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Cycle runner (orchestrator)

**Files:**
- Create: `src/lib/brain/structure-setup-runner.ts`

- [ ] **Step 1: Write the runner**

```ts
// src/lib/brain/structure-setup-runner.ts
//
// Orchestrates StructureEvent → TradeSetup generation for one scan
// cycle. Reads recent events (last 10 min) for the cycle symbols,
// gathers context (state, higher-TF state, regime, liquidity zones,
// ATR, current price), runs the pure generator, persists the result.
//
// Runs AFTER liquidity analysis in scan.ts so liquidityZones are fresh.

import { prisma } from "@/lib/prisma";
import { generateStructureSetup } from "@/lib/brain/structure-setup-generator";
import { persistStructureSetup } from "@/lib/brain/structure-setup-persister";

const ELIGIBLE_TIMEFRAMES = new Set(["15min", "1h", "4h"]);

function higherTfFor(tf: string): string | null {
  if (tf === "15min") return "1h";
  if (tf === "1h") return "4h";
  return null;
}

// Simple ATR(14) computed from the most recent closed candles on the
// event's timeframe. Avoids a hard dependency on the indicators module
// in case it's run on a different cadence.
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

export interface StructureSetupRunResult {
  eventsConsidered: number;
  setupsCreated: number;
  setupsSkippedExisting: number;
  setupsRejectedByGenerator: number;
  errors: string[];
}

export async function runStructureSetupGeneration(
  cycleSymbols: readonly string[],
): Promise<StructureSetupRunResult> {
  const result: StructureSetupRunResult = {
    eventsConsidered: 0,
    setupsCreated: 0,
    setupsSkippedExisting: 0,
    setupsRejectedByGenerator: 0,
    errors: [],
  };

  if (cycleSymbols.length === 0) return result;

  const sinceMs = Date.now() - 10 * 60 * 1000;
  const events = await prisma.structureEvent.findMany({
    where: {
      symbol: { in: [...cycleSymbols] },
      createdAt: { gte: new Date(sinceMs) },
    },
    orderBy: { createdAt: "desc" },
  });

  for (const event of events) {
    if (!ELIGIBLE_TIMEFRAMES.has(event.timeframe)) continue;
    result.eventsConsidered++;

    try {
      const state = await prisma.structureState.findUnique({
        where: { symbol_timeframe: { symbol: event.symbol, timeframe: event.timeframe } },
      });
      if (!state) continue;

      const higherTf = higherTfFor(event.timeframe);
      const higherTfState = higherTf
        ? await prisma.structureState.findUnique({
            where: { symbol_timeframe: { symbol: event.symbol, timeframe: higherTf } },
          })
        : null;

      const regime = await prisma.regime.findUnique({
        where: { symbol_timeframe: { symbol: event.symbol, timeframe: event.timeframe } },
      });

      const liquidityZones = await prisma.liquidityZone.findMany({
        where: {
          symbol: event.symbol,
          timeframe: event.timeframe,
          isFilled: false,
          isViolated: false,
        },
        take: 20,
      });

      const atr14 = await computeAtr14(event.symbol, event.timeframe);

      const lastCandle = await prisma.candle.findFirst({
        where: { symbol: event.symbol, timeframe: event.timeframe, isClosed: true },
        orderBy: { openTime: "desc" },
        select: { close: true },
      });
      const currentPrice = lastCandle?.close;
      if (currentPrice == null) continue;

      const instrument = await prisma.instrument.findFirst({
        where: { symbol: event.symbol },
        select: { id: true },
      });
      if (!instrument) continue;

      const spec = generateStructureSetup({
        event,
        state,
        higherTfState,
        regime,
        liquidityZones,
        atr14,
        currentPrice,
      });

      if (!spec) {
        result.setupsRejectedByGenerator++;
        continue;
      }

      const persisted = await persistStructureSetup(spec, instrument.id);
      if (persisted.created) result.setupsCreated++;
      else result.setupsSkippedExisting++;
    } catch (err) {
      result.errors.push(`${event.symbol} ${event.timeframe}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/brain/structure-setup-runner.ts
git commit -m "Market Structure: cycle runner that gathers context + persists

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire into scan loop

**Files:**
- Modify: `src/lib/brain/scan.ts` (insert after liquidity analysis)

- [ ] **Step 1: Add the import**

Find the existing brain imports near the top of `src/lib/brain/scan.ts` and add:

```ts
import { runStructureSetupGeneration } from "@/lib/brain/structure-setup-runner";
```

- [ ] **Step 2: Insert the call after liquidity analysis**

In `src/lib/brain/scan.ts`, immediately after the `liquidityResult = await analyzeAllLiquidity(...)` block (around line 128), add:

```ts
    // Structure-setup generation. Runs after liquidity so the
    // generator can use fresh LiquidityZone rows for TP targets.
    const structureSetupResult = await runStructureSetupGeneration(cycleSymbols).catch((err) => {
      errors.push(`structure-setups: ${err?.message ?? String(err)}`);
      return { eventsConsidered: 0, setupsCreated: 0, setupsSkippedExisting: 0, setupsRejectedByGenerator: 0, errors: [] };
    });
```

- [ ] **Step 3: Surface the counts in the cycle's return payload**

In `src/lib/brain/scan.ts`, search for `eventsDetected` (the field already returned for structure events). Wherever that field is included in the cycle handler's return object literal, add this sibling field right after it:

```ts
      structureSetups: {
        considered: structureSetupResult.eventsConsidered,
        created: structureSetupResult.setupsCreated,
        skippedExisting: structureSetupResult.setupsSkippedExisting,
        rejected: structureSetupResult.setupsRejectedByGenerator,
      },
```

If `tsc` reports the return type doesn't allow this field, find the explicit return type (likely an `interface` or `type` near the top of the file or imported from `@/lib/brain/types`) and add the same field to it with type:

```ts
structureSetups: {
  considered: number;
  created: number;
  skippedExisting: number;
  rejected: number;
};
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual smoke (no UI yet)**

Trigger one scan cycle via the cron route (substitute the actual `CRON_SECRET` value):

```bash
curl -sS "http://localhost:3000/api/cron/brain-scan" -H "x-cron-secret: $CRON_SECRET" | jq '.structureSetups'
```

Expected: a JSON object with the four counts. `created` may be 0 if no recent events qualify — that's fine for this step.

- [ ] **Step 6: Commit**

```bash
git add src/lib/brain/scan.ts
git commit -m "Market Structure: invoke setup generation in scan cycle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: UI sub-tab on /dashboard/market-structure

**Files:**
- Modify: `src/app/dashboard/market-structure/page.tsx`

- [ ] **Step 1: Add "setups" to the tab union and add the tab entry**

Find the `useState<"overview" | "swings" | "events" | "alignment" | "settings">` declaration around line 350 and extend it:

```ts
const [tab, setTab] = useState<"overview" | "swings" | "events" | "alignment" | "setups" | "settings">("overview");
```

Find the `const tabs = [` array (around line 442) and add a setups entry between `events` and `alignment` (or wherever feels right in the existing order):

```ts
{ id: "setups", label: "Trade Setups" },
```

Match the existing entry shape exactly (key names, casing).

- [ ] **Step 2: Add a client-side data fetch for the setups list**

In the same component, add a state slot and an effect that fetches via the API route created in Step 4. Use this client-side fetch even if other tabs use server-side data — it keeps the new tab decoupled from any existing server-data wiring and only loads when the user opens the tab.

```ts
const [setupsList, setSetupsList] = useState<StructureSetupRow[]>([]);

useEffect(() => {
  if (tab !== "setups") return;
  let cancelled = false;
  fetch("/api/brain/market-structure/setups")
    .then((r) => r.json())
    .then((d) => { if (!cancelled) setSetupsList(d.setups ?? []); })
    .catch(() => { if (!cancelled) setSetupsList([]); });
  return () => { cancelled = true; };
}, [tab]);
```

With this interface near the top of the file (or in a local types section):

```ts
interface StructureSetupRow {
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

- [ ] **Step 3: Add the tab panel**

Add this block alongside the other `{tab === "..." && (...)}` blocks, modeled on the existing `events` tab:

```tsx
{tab === "setups" && (
  <div className="space-y-3">
    {setupsList.length === 0 ? (
      <div className="text-sm text-zinc-400">
        No active market-structure setups. Setups appear here once a BOS or CHoCH event qualifies on 15m, 1h, or 4h.
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
                <span className="uppercase text-zinc-300">{s.setupType.replace("market_structure_", "")}</span>
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

Imports needed at top of file (add if not already present):

```ts
import { cn } from "@/lib/utils";
import { getDirectionBg, getDirectionColor, getGradeColor } from "@/lib/utils";
import { useEffect, useState } from "react";
```

- [ ] **Step 4: Create the API route**

Create `src/app/api/brain/market-structure/setups/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const setups = await prisma.tradeSetup.findMany({
    where: {
      setupType: { in: ["market_structure_bos", "market_structure_choch"] },
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

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Manual smoke**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard/market-structure`. Click the "Trade Setups" tab. Expected:
- Tab is visible alongside Overview/Swings/Events/Alignment/Settings.
- Either the empty-state message OR a list of setup cards. If a recent scan cycle has run with qualifying BOS/CHoCH events, cards appear with grade, direction, entry/stop/TP, RR, explanation.

If the list is empty in dev: confirm at least one row exists by running:

```bash
sqlite3 prisma/dev.db "select count(*) from TradeSetup where setupType like 'market_structure%';"
```

A zero result with no recent events is expected — the feature is wired and quiet until events fire.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/market-structure/page.tsx src/app/api/brain/market-structure/setups/route.ts
git commit -m "Market Structure: Trade Setups sub-tab + API route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Done

After Task 5 commits, the feature is live. Once the next scan cycle runs (every 2 min via Vercel Cron) and a BOS/CHoCH event qualifies on 15m/1h/4h, a TradeSetup row appears in the sub-tab. The algo runtime picks it up automatically for any bot whose `allowedSetupTypes` includes the new keys.

## Out of scope (per blueprint)

- Swing-point rejection setups (third trigger type).
- Re-entry on failed retest.
- Push notifications / Slack on new setup.
- 5m structure setups.
