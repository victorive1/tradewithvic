import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * List every known algo bot with its live DB state + today's routing
 * stats. Used by the Algo Agent page (/dashboard/bot-agents) so the
 * health dashboard reflects the actual DB instead of localStorage.
 */

const BOT_DISPLAY: Array<{ botId: string; name: string }> = [
  { botId: "fx-strength", name: "FX Strength Algo" },
  { botId: "ob", name: "Order Block Algo" },
  { botId: "md", name: "Market Direction Algo" },
  { botId: "breakout", name: "Breakout Algo" },
  { botId: "us30", name: "US30 Algo" },
  { botId: "metals", name: "Silver & Gold Algo" },
  { botId: "hub", name: "Algo Trading Hub" },
  { botId: "vic", name: "Algo Vic" },
];

interface BotStatusRow {
  botId: string;
  name: string;
  enabled: boolean;
  running: boolean;
  status: "healthy" | "warning" | "offline" | "stale";
  lastRunAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  selectedAccounts: string;
  allowedSessions: string;
  strategyFilter: string;
  symbolFilter: string;
  signalsToday: number;
  routedToday: number;
  rejectedToday: number;
  filteredToday: number;
}

function statusFor(args: {
  enabled: boolean;
  running: boolean;
  lastRunAt: Date | null;
  lastErrorAt: Date | null;
}): BotStatusRow["status"] {
  if (!args.enabled || !args.running) return "offline";
  if (args.lastErrorAt && args.lastRunAt && args.lastErrorAt > args.lastRunAt) return "warning";
  if (!args.lastRunAt) return "stale";
  const ageMs = Date.now() - args.lastRunAt.getTime();
  // Cron runs every 2 min. Allow up to 10 minutes before calling it stale.
  if (ageMs > 10 * 60 * 1000) return "stale";
  return "healthy";
}

export async function GET() {
  const configs = await prisma.algoBotConfig.findMany({
    select: {
      botId: true,
      enabled: true,
      running: true,
      lastRunAt: true,
      lastErrorAt: true,
      lastErrorMessage: true,
      selectedAccounts: true,
      allowedSessions: true,
      strategyFilter: true,
      symbolFilter: true,
    },
  });
  const cfgByBot = new Map(configs.map((c) => [c.botId, c]));

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Count AlgoBotExecution by status, per bot, since midnight UTC.
  const execStats = await prisma.algoBotExecution.groupBy({
    by: ["botId", "status"],
    where: { routedAt: { gte: todayStart } },
    _count: { _all: true },
  });
  const statMap = new Map<string, { routed: number; rejected: number; filtered: number; total: number }>();
  for (const s of execStats) {
    const entry = statMap.get(s.botId) ?? { routed: 0, rejected: 0, filtered: 0, total: 0 };
    const n = s._count._all;
    entry.total += n;
    if (s.status === "routed") entry.routed += n;
    else if (s.status === "rejected") entry.rejected += n;
    else if (s.status === "filtered") entry.filtered += n;
    statMap.set(s.botId, entry);
  }

  const bots: BotStatusRow[] = BOT_DISPLAY.map((display) => {
    const cfg = cfgByBot.get(display.botId);
    const stats = statMap.get(display.botId) ?? { routed: 0, rejected: 0, filtered: 0, total: 0 };
    if (!cfg) {
      return {
        botId: display.botId,
        name: display.name,
        enabled: false,
        running: false,
        status: "offline" as const,
        lastRunAt: null,
        lastErrorAt: null,
        lastErrorMessage: null,
        selectedAccounts: "",
        allowedSessions: "",
        strategyFilter: "",
        symbolFilter: "",
        signalsToday: 0,
        routedToday: 0,
        rejectedToday: 0,
        filteredToday: 0,
      };
    }
    return {
      botId: display.botId,
      name: display.name,
      enabled: cfg.enabled,
      running: cfg.running,
      status: statusFor({
        enabled: cfg.enabled,
        running: cfg.running,
        lastRunAt: cfg.lastRunAt,
        lastErrorAt: cfg.lastErrorAt,
      }),
      lastRunAt: cfg.lastRunAt?.toISOString() ?? null,
      lastErrorAt: cfg.lastErrorAt?.toISOString() ?? null,
      lastErrorMessage: cfg.lastErrorMessage,
      selectedAccounts: cfg.selectedAccounts ?? "",
      allowedSessions: cfg.allowedSessions ?? "",
      strategyFilter: cfg.strategyFilter ?? "",
      symbolFilter: cfg.symbolFilter ?? "",
      signalsToday: stats.total,
      routedToday: stats.routed,
      rejectedToday: stats.rejected,
      filteredToday: stats.filtered,
    };
  });

  return NextResponse.json({ bots, checkedAt: new Date().toISOString() });
}
