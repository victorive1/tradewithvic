import { prisma } from "@/lib/prisma";

export interface HealthCheck {
  name: string;
  status: "ok" | "warning" | "critical";
  value?: string | number;
  message: string;
}

export interface OversightResult {
  overall: "healthy" | "degraded" | "critical";
  checks: HealthCheck[];
  alertsCreated: number;
}

async function checkScanLag(): Promise<HealthCheck> {
  const latest = await prisma.scanCycle.findFirst({ orderBy: { startedAt: "desc" } });
  if (!latest) return { name: "scan_cadence", status: "warning", message: "No scans recorded yet." };
  const ageMin = Math.round((Date.now() - latest.startedAt.getTime()) / 60000);
  if (ageMin > 15) return { name: "scan_cadence", status: "critical", value: `${ageMin}m`, message: `Last scan ${ageMin} minutes ago — cron may be stuck.` };
  if (ageMin > 5) return { name: "scan_cadence", status: "warning", value: `${ageMin}m`, message: `Last scan ${ageMin} minutes ago — expected every 2 min.` };
  return { name: "scan_cadence", status: "ok", value: `${ageMin}m`, message: `Last scan ${ageMin}m ago.` };
}

async function checkErrorRate(): Promise<HealthCheck> {
  const recent = await prisma.scanCycle.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
  if (recent.length === 0) return { name: "error_rate", status: "ok", message: "No cycles yet." };
  // Only count STATUS=failed as true failures. Per-symbol fetch hiccups
  // (errorCount > 0 with status=completed) are expected during market-close
  // hours and thin-data windows on TwelveData — treating them as critical
  // creates permanent false-positive alerts. Those are tracked separately.
  const failed = recent.filter((c: any) => c.status === "failed").length;
  const pct = Math.round((failed / recent.length) * 100);
  if (pct > 50) return { name: "error_rate", status: "critical", value: `${pct}%`, message: `${pct}% of last 20 cycles failed.` };
  if (pct > 20) return { name: "error_rate", status: "warning", value: `${pct}%`, message: `${pct}% of last 20 cycles failed.` };
  return { name: "error_rate", status: "ok", value: `${pct}%`, message: `${pct}% cycle failure rate (last 20).` };
}

async function checkHiccupDensity(): Promise<HealthCheck> {
  // Secondary signal — average per-symbol fetch errors across the last 20
  // completed cycles. A handful of hiccups is normal; a persistent spike
  // points at a broken symbol or API quota issue.
  const recent = await prisma.scanCycle.findMany({
    where: { status: "completed" },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  if (recent.length === 0) return { name: "hiccup_density", status: "ok", message: "No completed cycles yet." };
  const avg = recent.reduce((sum: number, c: any) => sum + (c.errorCount ?? 0), 0) / recent.length;
  const rounded = Math.round(avg * 10) / 10;
  if (avg > 10) return { name: "hiccup_density", status: "warning", value: `${rounded}/cycle`, message: `Avg ${rounded} per-symbol hiccups/cycle — check feed health.` };
  return { name: "hiccup_density", status: "ok", value: `${rounded}/cycle`, message: `Avg ${rounded} per-symbol hiccups/cycle (normal).` };
}

async function checkCandleFreshness(): Promise<HealthCheck> {
  // For 24/7 symbols (crypto), candles should be recent.
  const latest = await prisma.candle.findFirst({
    where: { symbol: "BTCUSD" },
    orderBy: { fetchedAt: "desc" },
  });
  if (!latest) return { name: "feed_freshness", status: "warning", message: "No candles fetched yet." };
  const ageMin = Math.round((Date.now() - latest.fetchedAt.getTime()) / 60000);
  if (ageMin > 15) return { name: "feed_freshness", status: "critical", value: `${ageMin}m`, message: `BTC candles last fetched ${ageMin}m ago — feed may be down.` };
  if (ageMin > 5) return { name: "feed_freshness", status: "warning", value: `${ageMin}m`, message: `BTC candles stale ${ageMin}m.` };
  return { name: "feed_freshness", status: "ok", value: `${ageMin}m`, message: `Latest candle fetched ${ageMin}m ago.` };
}

async function checkStuckPositions(): Promise<HealthCheck> {
  const twoDaysAgo = new Date(Date.now() - 48 * 3600_000);
  const stuck = await prisma.executionPosition.findMany({
    where: { status: "open", openedAt: { lte: twoDaysAgo } },
  });
  if (stuck.length === 0) return { name: "stuck_positions", status: "ok", message: "No positions older than 48h." };
  return {
    name: "stuck_positions",
    status: "warning",
    value: stuck.length,
    message: `${stuck.length} position(s) open over 48h — review thesis and consider closing.`,
  };
}

async function checkExecutionHealth(): Promise<HealthCheck> {
  const account = await prisma.executionAccount.findUnique({ where: { name: "paper-default" } });
  if (!account) return { name: "execution_account", status: "ok", message: "No account yet — normal before first trade." };
  if (account.killSwitchEngaged) return { name: "execution_account", status: "critical", message: "Kill switch engaged — execution halted." };
  const dailyLossLimit = -account.startingBalance * (account.maxDailyLossPct / 100);
  if (account.dailyPnl <= dailyLossLimit) {
    return { name: "execution_account", status: "critical", value: `${account.dailyPnl.toFixed(2)}`, message: `Daily loss limit breached (${account.dailyPnl.toFixed(2)}).` };
  }
  if (account.dailyPnl < dailyLossLimit * 0.6) {
    return { name: "execution_account", status: "warning", value: `${account.dailyPnl.toFixed(2)}`, message: `Daily PnL approaching limit.` };
  }
  return { name: "execution_account", status: "ok", value: `${account.currentBalance.toFixed(2)}`, message: "Execution account healthy." };
}

async function openAlert(check: HealthCheck) {
  // Dedupe — only create if there's no open alert with same title in the last hour
  const oneHourAgo = new Date(Date.now() - 3600_000);
  const existing = await prisma.monitoringAlert.findFirst({
    where: {
      title: `oversight.${check.name}`,
      status: { in: ["open", "acknowledged"] },
      createdAt: { gte: oneHourAgo },
    },
  });
  if (existing) return;
  await prisma.monitoringAlert.create({
    data: {
      level: check.status === "critical" ? "critical" : "warning",
      category: "operational",
      title: `oversight.${check.name}`,
      message: check.message,
      metricName: check.name,
      metricValue: typeof check.value === "number" ? check.value : undefined,
    },
  });
}

/**
 * Close any still-open alerts for a check that's now passing. Without this
 * the panel accumulates forever — an alert raised yesterday for 95% error
 * rate stays "critical" on the dashboard even after cycles recover.
 */
async function resolveAlert(check: HealthCheck) {
  await prisma.monitoringAlert.updateMany({
    where: {
      title: `oversight.${check.name}`,
      status: { in: ["open", "acknowledged"] },
    },
    data: { status: "resolved", resolvedAt: new Date() },
  });
}

export async function runOversightCycle(): Promise<OversightResult> {
  const checks = await Promise.all([
    checkScanLag(),
    checkErrorRate(),
    checkHiccupDensity(),
    checkCandleFreshness(),
    checkStuckPositions(),
    checkExecutionHealth(),
  ]);

  let alertsCreated = 0;
  for (const c of checks) {
    if (c.status !== "ok") {
      await openAlert(c);
      alertsCreated++;
    } else {
      // Condition cleared — close any lingering alerts of this name so the
      // panel reflects current state instead of historical noise.
      await resolveAlert(c);
    }
  }

  const hasCritical = checks.some((c) => c.status === "critical");
  const hasWarning = checks.some((c) => c.status === "warning");
  const overall = hasCritical ? "critical" : hasWarning ? "degraded" : "healthy";

  const scoringModeRow = await prisma.systemControlState.findFirst({ orderBy: { createdAt: "desc" } });
  const scoringMode = scoringModeRow?.scoringMode ?? "rules_only";

  // Capture a snapshot so trend of degradation is visible
  await prisma.monitoringSnapshot.create({
    data: {
      scoringMode,
      inferenceSuccessRate: checks.find((c) => c.name === "error_rate")?.status === "ok" ? 1 : 0.8,
      fallbackRate: 0,
      driftSeverity: overall === "critical" ? "critical" : overall === "degraded" ? "warning" : "stable",
    },
  });

  return { overall, checks, alertsCreated };
}
