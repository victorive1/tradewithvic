import { prisma } from "@/lib/prisma";
import {
  type EngineStatus,
  type ProbeResult,
  type DataSourceSnapshot,
  type EngineDependencySnapshot,
  type RecentError,
  type ProbeStatus,
  worstStatus,
} from "@/lib/agent/types";
import { CANDLE_SYMBOLS, CANDLE_TIMEFRAMES } from "@/lib/brain/candles";

const now = () => new Date();
const ageSecs = (date: Date | null | undefined) =>
  date ? Math.max(0, Math.round((Date.now() - date.getTime()) / 1000)) : null;

/**
 * Rough market-hours check so probes don't flag weekend candle gaps as bugs.
 *   - Crypto trades 24/7
 *   - FX + metals: closed Fri 22:00 UTC → Sun 22:00 UTC
 */
function isMarketOpen(symbol: string, at: Date = new Date()): boolean {
  const s = symbol.toUpperCase();
  if (/^(BTC|ETH|SOL|XRP|ADA|DOGE|BNB|LTC)/.test(s)) return true;
  const day = at.getUTCDay();     // 0 Sun … 6 Sat
  const hour = at.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && hour >= 22) return false;
  if (day === 0 && hour < 22) return false;
  return true;
}

function statusForAge(age: number | null, warnSecs: number, critSecs: number): ProbeStatus {
  if (age == null) return "critical";
  if (age > critSecs) return "critical";
  if (age > warnSecs) return "warning";
  return "healthy";
}

/* ─────────────── Shared table probes ─────────────── */

async function probeMarketSnapshotFreshness(): Promise<ProbeResult> {
  const last = await prisma.marketSnapshot.findFirst({ orderBy: { capturedAt: "desc" }, select: { capturedAt: true } });
  const age = ageSecs(last?.capturedAt ?? null);
  const status = statusForAge(age, 180, 600); // 3m warn, 10m crit
  const isFailing = status !== "healthy";
  return {
    id: "market_snapshot_freshness",
    label: "MarketSnapshot freshness",
    status,
    message: age == null ? "No snapshots ever captured" : `Latest capture ${age}s ago`,
    value: age,
    expected: "< 180s (warn) · < 600s (critical)",
    remediationId: isFailing ? "run_scan_cycle" : undefined,
    remediationLabel: isFailing ? "Run scan cycle" : undefined,
  };
}

async function probeQuotesCoverage(): Promise<ProbeResult> {
  // How many distinct symbols got a snapshot in the last 5 min
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const rows = await prisma.marketSnapshot.findMany({
    where: { capturedAt: { gte: fiveMinAgo } },
    distinct: ["symbol"],
    select: { symbol: true },
  });
  const count = rows.length;
  const expected = 10; // we track >=10 instruments regularly
  const status: ProbeStatus = count === 0 ? "critical" : count < expected ? "warning" : "healthy";
  return {
    id: "quotes_coverage",
    label: "Symbol coverage (last 5m)",
    status,
    message: `${count} symbol${count === 1 ? "" : "s"} returned a quote in the last 5 min`,
    value: count,
    expected: `≥ ${expected}`,
  };
}

async function probeScanCycleFreshness(): Promise<ProbeResult> {
  const last = await prisma.scanCycle.findFirst({ orderBy: { startedAt: "desc" } });
  const age = ageSecs(last?.startedAt ?? null);
  // Cron runs every 2 min; warn at 4m, crit at 10m
  const status = statusForAge(age, 240, 600);
  const stuck = last?.status === "running" && (age ?? 0) > 300;
  return {
    id: "scan_cycle_freshness",
    label: "Last scan cycle",
    status,
    message: last
      ? `Last cycle ${age}s ago · status=${last.status} · ${last.durationMs ?? "—"}ms`
      : "No scan cycles recorded yet",
    value: age,
    expected: "< 240s (warn) · < 600s (critical)",
    remediationId: stuck ? "reset_stuck_scan_cycles" : (status !== "healthy" ? "run_scan_cycle" : undefined),
    remediationLabel: stuck ? "Reset stuck cycles" : (status !== "healthy" ? "Run scan cycle" : undefined),
  };
}

async function probeScanCycleErrors(): Promise<ProbeResult[]> {
  const recent = await prisma.scanCycle.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
    select: { status: true, errorCount: true },
  });
  // True failures: cycle ended in a non-completed status. These are cases
  // where something in the pipeline threw hard, not per-pair provider errors.
  const failures = recent.filter((c) => c.status !== "completed").length;
  const failStatus: ProbeStatus = failures >= 3 ? "critical" : failures >= 1 ? "warning" : "healthy";

  // Error density: average per-cycle errors across the last 10. Small per-
  // pair errors (market closed, provider hiccup, one flaky symbol) are
  // normal — only flag when the noise level is materially elevated.
  const totalErrors = recent.reduce((a, b) => a + (b.errorCount ?? 0), 0);
  const avgErrors = recent.length > 0 ? totalErrors / recent.length : 0;
  const densStatus: ProbeStatus = avgErrors >= 10 ? "critical" : avgErrors >= 3 ? "warning" : "healthy";

  return [
    {
      id: "scan_cycle_failures",
      label: "Failed scan cycles (last 10)",
      status: failStatus,
      message: failures === 0
        ? "No hard failures in the last 10 cycles"
        : `${failures} cycle${failures === 1 ? "" : "s"} ended in a non-completed status`,
      value: failures,
      expected: "0 (warn ≥ 1 · critical ≥ 3)",
      remediationId: failures > 0 ? "run_scan_cycle" : undefined,
      remediationLabel: failures > 0 ? "Run scan cycle" : undefined,
    },
    {
      id: "scan_cycle_error_density",
      label: "Avg errors per cycle (last 10)",
      status: densStatus,
      message: avgErrors < 0.5
        ? "Cycles are running clean"
        : `${avgErrors.toFixed(1)} avg errors/cycle · mostly per-pair provider noise`,
      detail: "Per-pair provider errors (market closed, symbol not supported, transient rate limit) accumulate here but don't fail the cycle. A low baseline is normal.",
      value: Number(avgErrors.toFixed(1)),
      expected: "< 3 (warn) · < 10 (critical)",
    },
  ];
}

async function probeCandleCoverage(): Promise<ProbeResult> {
  // With the full 22-symbol universe and a rotating per-cycle budget, every
  // (symbol, timeframe) pair should have been FETCHED within the rotation
  // window (~30 min for open markets). We probe fetchedAt, not openTime,
  // because the latter reflects candle bar time, not refresh recency.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const rows = await prisma.candle.groupBy({
    by: ["symbol", "timeframe"],
    where: { fetchedAt: { gte: thirtyMinAgo } },
    _count: { _all: true },
  });
  const pairs = new Set(rows.map((r) => `${r.symbol}:${r.timeframe}`));

  const expectedOpen: string[] = [];
  const expectedClosed: string[] = [];
  for (const sym of CANDLE_SYMBOLS) {
    const open = isMarketOpen(sym);
    for (const tf of CANDLE_TIMEFRAMES) {
      (open ? expectedOpen : expectedClosed).push(`${sym}:${tf}`);
    }
  }

  const missingOpen = expectedOpen.filter((p) => !pairs.has(p));
  const closedCount = expectedClosed.length;
  const totalExpected = expectedOpen.length + expectedClosed.length;

  // With ~12-minute full rotation, up to ~10% of pairs can legitimately be
  // outside the 30-minute window right after a restart. Widen the warning
  // band before marking critical.
  const missRatio = expectedOpen.length > 0 ? missingOpen.length / expectedOpen.length : 0;
  const status: ProbeStatus = missRatio === 0 ? "healthy"
    : missRatio < 0.25 ? "warning"
    : "critical";

  const closedNote = closedCount > 0 ? ` · ${closedCount} skipped (market closed)` : "";
  const message = missingOpen.length === 0
    ? `All ${expectedOpen.length} open-market pairs refreshed in last 30 min${closedNote}`
    : `${missingOpen.length} of ${expectedOpen.length} open pairs stale: ${missingOpen.slice(0, 4).join(", ")}${missingOpen.length > 4 ? "…" : ""}${closedNote}`;

  return {
    id: "candle_coverage",
    label: "Candle coverage (last 30 min)",
    status,
    message,
    detail: `Tracking ${totalExpected} symbol×TF pairs total across the full instrument universe. The Brain rotates through the universe over ~12 minutes, prioritising the stalest pairs first. Crypto runs 24/7; FX and metals pause Fri 22:00 UTC → Sun 22:00 UTC.`,
    value: missingOpen.length,
    expected: "0 stale among open markets",
    remediationId: missingOpen.length > 0 ? "fetch_missing_candles" : undefined,
    remediationLabel: missingOpen.length > 0 ? `Backfill ${missingOpen.length} stale pair${missingOpen.length === 1 ? "" : "s"}` : undefined,
  };
}

async function probeStructureFreshness(): Promise<ProbeResult> {
  const last = await prisma.structureState.findFirst({ orderBy: { updatedAt: "desc" } });
  const age = ageSecs(last?.updatedAt ?? null);
  const status = statusForAge(age, 300, 1800);
  return {
    id: "structure_freshness",
    label: "Structure state freshness",
    status,
    message: age == null ? "No structure state rows" : `Updated ${age}s ago`,
    value: age,
    expected: "< 300s (warn) · < 1800s (critical)",
  };
}

/* ─────────────── Data-source snapshots ─────────────── */

async function snapTable(opts: {
  label: string;
  tableName: string;
  count: () => Promise<number>;
  lastUpdated: () => Promise<Date | null>;
  warnSecs: number;
  critSecs: number;
  note?: string;
}): Promise<DataSourceSnapshot> {
  const [rowCount, lastUpdatedAt] = await Promise.all([opts.count(), opts.lastUpdated()]);
  const age = ageSecs(lastUpdatedAt);
  return {
    label: opts.label,
    tableName: opts.tableName,
    rowCount,
    lastUpdatedAt: lastUpdatedAt ? lastUpdatedAt.toISOString() : null,
    ageSeconds: age,
    status: rowCount === 0 ? "warning" : statusForAge(age, opts.warnSecs, opts.critSecs),
    note: opts.note,
  };
}

async function sourceMarketSnapshot(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Quote snapshots",
    tableName: "MarketSnapshot",
    count: () => prisma.marketSnapshot.count(),
    lastUpdated: async () => (await prisma.marketSnapshot.findFirst({ orderBy: { capturedAt: "desc" }, select: { capturedAt: true } }))?.capturedAt ?? null,
    warnSecs: 180,
    critSecs: 600,
  });
}

async function sourceScanCycle(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Scan cycles",
    tableName: "ScanCycle",
    count: () => prisma.scanCycle.count(),
    lastUpdated: async () => (await prisma.scanCycle.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } }))?.startedAt ?? null,
    warnSecs: 240,
    critSecs: 600,
  });
}

async function sourceCandle(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Candles",
    tableName: "Candle",
    count: () => prisma.candle.count(),
    // fetchedAt tracks when we last asked the provider for this row. openTime
    // is the bar's own time and can legitimately be hours/days old on longer
    // timeframes, which would misleadingly look like staleness.
    lastUpdated: async () => (await prisma.candle.findFirst({ orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } }))?.fetchedAt ?? null,
    warnSecs: 900,
    critSecs: 3600,
  });
}

async function sourceStructureState(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Structure state",
    tableName: "StructureState",
    count: () => prisma.structureState.count(),
    lastUpdated: async () => (await prisma.structureState.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }))?.updatedAt ?? null,
    warnSecs: 600,
    critSecs: 1800,
  });
}

async function sourceIndicatorSnapshot(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Indicator snapshots",
    tableName: "IndicatorSnapshot",
    count: () => prisma.indicatorSnapshot.count(),
    lastUpdated: async () => (await prisma.indicatorSnapshot.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }))?.computedAt ?? null,
    warnSecs: 600,
    critSecs: 1800,
  });
}

async function sourceSupplyDemandZone(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Supply & demand zones",
    tableName: "SupplyDemandZone",
    count: () => prisma.supplyDemandZone.count({ where: { freshnessState: { in: ["FRESH", "ARMED", "TOUCHED"] } } }),
    lastUpdated: async () => (await prisma.supplyDemandZone.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }))?.updatedAt ?? null,
    warnSecs: 600,
    critSecs: 1800,
    note: "Active zones only (FRESH / ARMED / TOUCHED)",
  });
}

async function sourceLiquidityLevel(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Liquidity levels",
    tableName: "LiquidityLevel",
    count: () => prisma.liquidityLevel.count({ where: { status: "active" } }),
    lastUpdated: async () => (await prisma.liquidityLevel.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }))?.lastSeenAt ?? null,
    warnSecs: 1800,
    critSecs: 7200,
    note: "Active levels only",
  });
}

async function sourceExecutionAccount(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Execution account",
    tableName: "ExecutionAccount",
    count: () => prisma.executionAccount.count(),
    lastUpdated: async () => (await prisma.executionAccount.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }))?.updatedAt ?? null,
    warnSecs: 3600,
    critSecs: 86400,
  });
}

async function sourceExecutionOrder(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Execution orders",
    tableName: "ExecutionOrder",
    count: () => prisma.executionOrder.count(),
    lastUpdated: async () => (await prisma.executionOrder.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }))?.createdAt ?? null,
    warnSecs: 86400,
    critSecs: 604800,
    note: "Orders only fire when a qualifying setup appears — idle is normal",
  });
}

async function sourceExecutionPosition(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Execution positions",
    tableName: "ExecutionPosition",
    count: () => prisma.executionPosition.count(),
    lastUpdated: async () => (await prisma.executionPosition.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }))?.updatedAt ?? null,
    warnSecs: 86400,
    critSecs: 604800,
  });
}

async function sourceTradeSetup(): Promise<DataSourceSnapshot> {
  return snapTable({
    label: "Trade setups (active)",
    tableName: "TradeSetup",
    count: () => prisma.tradeSetup.count({ where: { status: "active" } }),
    lastUpdated: async () => (await prisma.tradeSetup.findFirst({ where: { status: "active" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }))?.createdAt ?? null,
    warnSecs: 1800,
    critSecs: 7200,
  });
}

/* ─────────────── Recent errors ─────────────── */

async function recentScanCycleErrors(): Promise<RecentError[]> {
  const rows = await prisma.scanCycle.findMany({
    where: { OR: [{ status: { not: "completed" } }, { errorCount: { gt: 0 } }] },
    orderBy: { startedAt: "desc" },
    take: 10,
  });
  return rows.map((r) => {
    // errorLogJson is either a JSON array of {message} entries or a plain string.
    let first = "";
    try {
      const parsed = JSON.parse(r.errorLogJson || "[]");
      if (Array.isArray(parsed) && parsed.length > 0) {
        const head = parsed[0];
        first = typeof head === "string" ? head : (head?.message ?? JSON.stringify(head));
      }
    } catch { /* ignore */ }
    return {
      at: r.startedAt.toISOString(),
      source: "ScanCycle",
      code: r.status,
      message: first || `${r.errorCount} error${r.errorCount === 1 ? "" : "s"} during cycle`,
    };
  });
}

async function recentMonitoringAlerts(level?: string[]): Promise<RecentError[]> {
  try {
    const rows = await prisma.monitoringAlert.findMany({
      where: {
        ...(level ? { level: { in: level } } : {}),
        status: { in: ["open", "acknowledged"] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return rows.map((r) => ({
      at: r.createdAt.toISOString(),
      source: "MonitoringAlert",
      code: r.level,
      message: r.message,
    }));
  } catch {
    return [];
  }
}

async function recentRejectedOrders(): Promise<RecentError[]> {
  const rows = await prisma.executionOrder.findMany({
    where: { status: "rejected" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { createdAt: true, rejectReason: true, symbol: true },
  });
  return rows.map((r) => ({
    at: r.createdAt.toISOString(),
    source: "ExecutionOrder",
    code: "rejected",
    message: `${r.symbol}: ${r.rejectReason ?? "—"}`,
  }));
}

/* ─────────────── Engine probes ─────────────── */

export async function probeMarketRadar(): Promise<EngineStatus> {
  const [probe1, probe2, snap] = await Promise.all([
    probeMarketSnapshotFreshness(),
    probeQuotesCoverage(),
    sourceMarketSnapshot(),
  ]);
  const probes = [probe1, probe2];
  const status = worstStatus(probes.map((p) => p.status));
  return {
    id: "market-radar",
    label: "Market Radar",
    route: "/dashboard",
    summary: "Live quotes feed — powers every other engine that reads price data.",
    status,
    statusMessage: probes.find((p) => p.status === status)?.message ?? "",
    lastUpdatedAt: snap.lastUpdatedAt,
    probes,
    dataSources: [snap],
    dependencies: [],
    recentErrors: [],
  };
}

export async function probeMarketDirection(): Promise<EngineStatus> {
  const [probe1, probe2, candleSrc, structSrc] = await Promise.all([
    probeCandleCoverage(),
    probeStructureFreshness(),
    sourceCandle(),
    sourceStructureState(),
  ]);
  const probes = [probe1, probe2];
  const status = worstStatus(probes.map((p) => p.status));
  return {
    id: "market-direction",
    label: "Market Direction",
    route: "/dashboard/market-direction",
    summary: "Multi-timeframe direction matrix + alignment-based trade setups.",
    status,
    statusMessage: probes.find((p) => p.status === status)?.message ?? "",
    lastUpdatedAt: structSrc.lastUpdatedAt,
    probes,
    dataSources: [candleSrc, structSrc],
    dependencies: [{ engineId: "market-core-brain", label: "Market Core Brain", status: "healthy", statusMessage: "" }],
    recentErrors: [],
  };
}

export async function probeMarketPrediction(radarStatus: ProbeStatus, radarMessage: string): Promise<EngineStatus> {
  // The screener is pure client math off the quotes feed — its health IS
  // Market Radar's health.
  const snap = await sourceMarketSnapshot();
  const probe: ProbeResult = {
    id: "prediction_derives_from_radar",
    label: "Quotes feed available",
    status: radarStatus,
    message: radarMessage || "Market Prediction is derived client-side from the quotes feed",
    detail: "Uses the same getBias / grade math now shared with the Brain execution gate (src/lib/market-prediction.ts).",
  };
  return {
    id: "market-prediction",
    label: "Market Prediction",
    route: "/dashboard/screener",
    summary: "Client-side scoring and bias engine; derives entirely from the quotes feed.",
    status: radarStatus,
    statusMessage: probe.message,
    lastUpdatedAt: snap.lastUpdatedAt,
    probes: [probe],
    dataSources: [snap],
    dependencies: [{ engineId: "market-radar", label: "Market Radar", status: radarStatus, statusMessage: radarMessage }],
    recentErrors: [],
    note: "No persistent tables — logic lives in src/lib/market-prediction.ts.",
  };
}

export async function probeMarketCoreBrain(): Promise<EngineStatus> {
  const [p1, errorProbes, p3, p4, snapCycle, snapCandle, snapStruct, snapInd, snapLiq, snapZone, errors, alerts] = await Promise.all([
    probeScanCycleFreshness(),
    probeScanCycleErrors(),
    probeCandleCoverage(),
    probeMarketSnapshotFreshness(),
    sourceScanCycle(),
    sourceCandle(),
    sourceStructureState(),
    sourceIndicatorSnapshot(),
    sourceLiquidityLevel(),
    sourceSupplyDemandZone(),
    recentScanCycleErrors(),
    recentMonitoringAlerts(["critical", "warning"]),
  ]);
  const probes = [p1, ...errorProbes, p3, p4];
  const status = worstStatus(probes.map((p) => p.status));
  return {
    id: "market-core-brain",
    label: "Market Core Brain",
    route: "/dashboard/brain",
    summary: "2-minute multi-asset scanner: candles, structure, indicators, liquidity, strategies, confluence.",
    status,
    statusMessage: probes.find((p) => p.status === status)?.message ?? "",
    lastUpdatedAt: snapCycle.lastUpdatedAt,
    probes,
    dataSources: [snapCycle, snapCandle, snapStruct, snapInd, snapLiq, snapZone],
    dependencies: [{ engineId: "market-radar", label: "Market Radar (quotes feed)", status: "healthy", statusMessage: "" }],
    recentErrors: [...errors, ...alerts].slice(0, 10),
  };
}

export async function probeBrainExecution(): Promise<EngineStatus> {
  const account = await prisma.executionAccount.findUnique({ where: { name: "paper-default" } });
  const openPositions = account ? await prisma.executionPosition.count({ where: { accountId: account.id, status: "open" } }) : 0;

  const probes: ProbeResult[] = [];
  if (!account) {
    probes.push({ id: "account_exists", label: "Execution account", status: "critical", message: "No ExecutionAccount row — the Brain has nowhere to place trades" });
  } else {
    probes.push({
      id: "auto_execute_enabled",
      label: "Auto-execute switch",
      status: account.autoExecuteEnabled ? "healthy" : "warning",
      message: account.autoExecuteEnabled ? "Auto-execute is ON" : "Auto-execute is OFF — setups will not become orders",
    });
    probes.push({
      id: "kill_switch",
      label: "Kill switch",
      status: account.killSwitchEngaged ? "critical" : "healthy",
      message: account.killSwitchEngaged ? "Kill switch is ENGAGED — all new orders blocked" : "Kill switch disengaged",
    });
    probes.push({
      id: "last_cycle",
      label: "Last execution cycle",
      status: statusForAge(ageSecs(account.lastCycleAt ?? null), 240, 900),
      message: account.lastCycleAt ? `${ageSecs(account.lastCycleAt)}s ago` : "No recorded execution cycle yet",
      value: ageSecs(account.lastCycleAt ?? null),
      expected: "< 240s (warn) · < 900s (critical)",
    });
    probes.push({
      id: "open_positions",
      label: "Open positions",
      status: openPositions > account.maxConcurrentPositions ? "warning" : "healthy",
      message: `${openPositions} / ${account.maxConcurrentPositions} concurrent`,
      value: openPositions,
      expected: `≤ ${account.maxConcurrentPositions}`,
    });
  }

  const [acctSrc, orderSrc, posSrc, rejected] = await Promise.all([
    sourceExecutionAccount(),
    sourceExecutionOrder(),
    sourceExecutionPosition(),
    recentRejectedOrders(),
  ]);

  const status = worstStatus(probes.map((p) => p.status));
  return {
    id: "brain-execution",
    label: "Market Core Brain Execution",
    route: "/dashboard/brain-execution",
    summary: "Paper/live executor that turns qualifying setups into orders + manages positions.",
    status,
    statusMessage: probes.find((p) => p.status === status)?.message ?? "",
    lastUpdatedAt: acctSrc.lastUpdatedAt,
    probes,
    dataSources: [acctSrc, orderSrc, posSrc],
    dependencies: [{ engineId: "market-core-brain", label: "Market Core Brain (setup source)", status: "healthy", statusMessage: "" }],
    recentErrors: rejected,
  };
}

export async function probeSignalChannel(radarStatus: ProbeStatus, radarMessage: string): Promise<EngineStatus> {
  const snap = await sourceTradeSetup();
  const probe: ProbeResult = {
    id: "signal_channel_derives",
    label: "Setup generator input",
    status: radarStatus,
    message: radarMessage || "Signal Channel renders client-side from the live quotes feed.",
    detail: "No persistent table dedicated to this page. Reflects Market Radar health.",
  };
  return {
    id: "signal-channel",
    label: "Signal Channel",
    route: "/dashboard/signal-channel",
    summary: "Grouped strategy signals + result simulation. Client-only view over the quotes feed.",
    status: radarStatus,
    statusMessage: probe.message,
    lastUpdatedAt: snap.lastUpdatedAt,
    probes: [probe],
    dataSources: [snap],
    dependencies: [{ engineId: "market-radar", label: "Market Radar", status: radarStatus, statusMessage: radarMessage }],
    recentErrors: [],
    note: "This tab derives entirely from /api/market/quotes — if the Radar is healthy, this is healthy.",
  };
}

export async function probeEditorsPick(radarStatus: ProbeStatus, radarMessage: string): Promise<EngineStatus> {
  const snap = await sourceTradeSetup();
  const probe: ProbeResult = {
    id: "editors_pick_derives",
    label: "Pick generator input",
    status: radarStatus,
    message: radarMessage || "Editors Pick renders client-side from the live quotes feed.",
    detail: "Ranks setups using scoring breakdown + confidence + R:R. No dedicated DB.",
  };
  return {
    id: "editors-pick",
    label: "Editors Pick",
    route: "/dashboard/editors-pick",
    summary: "Curated top setups with confluence tags. Client-only view.",
    status: radarStatus,
    statusMessage: probe.message,
    lastUpdatedAt: snap.lastUpdatedAt,
    probes: [probe],
    dataSources: [snap],
    dependencies: [{ engineId: "market-radar", label: "Market Radar", status: radarStatus, statusMessage: radarMessage }],
    recentErrors: [],
    note: "Derives entirely from /api/market/quotes; reflects Market Radar health.",
  };
}

/* ─────────────── Orchestration ─────────────── */

export async function runAllEngineProbes(): Promise<EngineStatus[]> {
  const radar = await probeMarketRadar();
  // The four engines below all depend on Market Radar, so wait on it first to
  // pass through accurate dependency status.
  const [direction, prediction, brain, execution, signals, editors] = await Promise.all([
    probeMarketDirection(),
    probeMarketPrediction(radar.status, radar.statusMessage),
    probeMarketCoreBrain(),
    probeBrainExecution(),
    probeSignalChannel(radar.status, radar.statusMessage),
    probeEditorsPick(radar.status, radar.statusMessage),
  ]);

  // Backfill dependency status rows now that we've evaluated each engine.
  const byId: Record<string, EngineStatus> = {
    [radar.id]: radar,
    [direction.id]: direction,
    [prediction.id]: prediction,
    [brain.id]: brain,
    [execution.id]: execution,
    [signals.id]: signals,
    [editors.id]: editors,
  };
  for (const engine of Object.values(byId)) {
    engine.dependencies = engine.dependencies.map((dep: EngineDependencySnapshot) => {
      const target = byId[dep.engineId];
      if (!target) return dep;
      return { ...dep, status: target.status, statusMessage: target.statusMessage };
    });
  }
  return [radar, direction, prediction, brain, execution, signals, editors];
}

export async function probeEngine(id: string): Promise<EngineStatus | null> {
  const all = await runAllEngineProbes();
  return all.find((e) => e.id === id) ?? null;
}
