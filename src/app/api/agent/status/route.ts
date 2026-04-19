import { NextResponse } from "next/server";
import { runAllEngineProbes } from "@/lib/agent/probes";
import type { ProbeStatus } from "@/lib/agent/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Lightweight rollup used by the sidebar health dots. Only the id/status
 * pair is returned — the full per-probe detail lives on
 * /dashboard/agent/{id} and /api/agent/status is not the right place to
 * dump it.
 */
export async function GET() {
  try {
    const engines = await runAllEngineProbes();
    const statuses: ProbeStatus[] = engines.map((e) => e.status);
    const overall: ProbeStatus = statuses.includes("critical") ? "critical"
      : statuses.includes("warning") ? "warning"
      : statuses.every((s) => s === "healthy") ? "healthy"
      : "unknown";
    return NextResponse.json({
      overall,
      engines: engines.map((e) => ({
        id: e.id,
        status: e.status,
        statusMessage: e.statusMessage,
      })),
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { overall: "unknown" as ProbeStatus, engines: [], error: e?.message ?? "probe_failed" },
      { status: 500 },
    );
  }
}
