import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Observability + System Health — Quant Engine Blueprint § 23.
//
// Aggregates health signals the brain already produces (ScanCycle,
// MonitoringAlert, MarketSnapshot freshness, EventRiskSnapshot) into
// a single status doc the dashboard can render.

type Status = "healthy" | "warning" | "degraded" | "down";

interface ComponentHealth {
  name: string;
  status: Status;
  detail: string;
  lastUpdatedAt: string | null;
}

export async function GET() {
  const now = Date.now();

  const [latestScan, openAlerts, latestQuote] = await Promise.all([
    prisma.scanCycle.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.monitoringAlert.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.marketSnapshot.findFirst({ orderBy: { capturedAt: "desc" } }),
  ]);

  const components: ComponentHealth[] = [];

  // Brain scan loop — should fire every 2 minutes via Vercel cron.
  const scanAge = latestScan ? Math.round((now - latestScan.startedAt.getTime()) / 60_000) : null;
  components.push({
    name: "Brain scan loop",
    status: scanAge == null ? "down"
      : scanAge > 10 ? "degraded"
      : scanAge > 5 ? "warning"
      : "healthy",
    detail: scanAge == null ? "no scans recorded" : `last scan ${scanAge}m ago`,
    lastUpdatedAt: latestScan?.startedAt.toISOString() ?? null,
  });

  // Market data freshness.
  const quoteAge = latestQuote ? Math.round((now - latestQuote.capturedAt.getTime()) / 60_000) : null;
  components.push({
    name: "Market data feed",
    status: quoteAge == null ? "down"
      : quoteAge > 15 ? "degraded"
      : quoteAge > 8 ? "warning"
      : "healthy",
    detail: quoteAge == null ? "no quotes recorded" : `last quote ${quoteAge}m ago`,
    lastUpdatedAt: latestQuote?.capturedAt.toISOString() ?? null,
  });

  // Open monitoring alerts (the oversight cycle dedupes these).
  const criticalAlerts = openAlerts.filter((a) => a.level === "critical").length;
  const warningAlerts = openAlerts.filter((a) => a.level === "warning").length;
  components.push({
    name: "Oversight alerts",
    status: criticalAlerts > 0 ? "degraded"
      : warningAlerts > 2 ? "warning"
      : "healthy",
    detail: `${criticalAlerts} critical, ${warningAlerts} warning, ${openAlerts.length} total open`,
    lastUpdatedAt: openAlerts[0]?.createdAt?.toISOString() ?? null,
  });

  // Database connectivity — if any of the queries above succeeded, DB is up.
  components.push({
    name: "Database",
    status: "healthy",
    detail: "Postgres queries returning",
    lastUpdatedAt: new Date().toISOString(),
  });

  // Latest scan duration health.
  if (latestScan) {
    const dur = latestScan.durationMs ?? 0;
    components.push({
      name: "Scan duration",
      status: dur > 90_000 ? "warning" : dur > 60_000 ? "degraded" : "healthy",
      detail: `${(dur / 1000).toFixed(1)}s for last scan`,
      lastUpdatedAt: latestScan.startedAt.toISOString(),
    });
  }

  // Overall = worst per-component status (rank-ordered).
  const rank: Status[] = ["healthy", "warning", "degraded", "down"];
  const overall = components.reduce<Status>(
    (acc, c) => (rank.indexOf(c.status) > rank.indexOf(acc) ? c.status : acc),
    "healthy",
  );

  // Trading permission decision per § 23 example output.
  const tradingPermission =
    overall === "down" || overall === "degraded" ? "blocked" :
    overall === "warning" ? "reduced_risk_only" :
    "allowed";

  return NextResponse.json({
    overall,
    tradingPermission,
    components,
    openAlerts: openAlerts.map((a) => ({
      id: a.id,
      level: a.level,
      category: a.category,
      title: a.title,
      message: a.message,
      createdAt: a.createdAt.toISOString(),
    })),
    generatedAt: new Date().toISOString(),
  });
}
