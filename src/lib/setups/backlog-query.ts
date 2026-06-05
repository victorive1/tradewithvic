import { prisma } from "@/lib/prisma";

// Shared 30-day backlog loader — used by both the /dashboard/backlog page
// (server component) and the gated /api/backlog endpoint (Smart Alerts
// tab). Merges every persisted setup-bearing source into one timeline,
// each row carrying its immutable first-dropped instant (createdAt).

export const RETENTION_DAYS = 30;
// Hard ceiling per source so a busy window can't blow up the payload. We
// surface `capped` so the UI never silently looks "complete".
export const PER_SOURCE_CAP = 750;

export interface BacklogOrigin {
  /** Human-readable tab/signal name, e.g. "Order Block Signals". */
  label: string;
  /** Dashboard route the setup came from, for a direct link. */
  href: string | null;
}

export interface BacklogItem {
  id: string;
  source: "setup" | "intraday";
  symbol: string;
  direction: string;
  kind: string;
  timeframe: string;
  grade: string;
  score: number;
  entryLabel: string;
  stopLoss: string;
  takeProfit1: string;
  riskReward: number;
  status: string;
  explanation: string | null;
  createdAt: string; // ISO — the immutable "first dropped" instant
  /** Which tab/signal produced this setup. */
  origin: BacklogOrigin;
}

// Resolve the exact source tab/signal for a persisted TradeSetup. Captured
// rows carry a prefixed id (eng_/ob_/engulf_/brk_) identifying the surface
// precisely; brain-detected rows are matched by setupType.
function originForSetup(rawId: string, setupType: string): BacklogOrigin {
  if (rawId.startsWith("eng_")) return { label: "Trade Setups", href: "/dashboard/setups" };
  if (rawId.startsWith("ob_")) return { label: "Order Block Signals", href: "/dashboard/order-blocks" };
  if (rawId.startsWith("engulf_")) return { label: "Engulfing", href: "/dashboard/engulfing" };
  if (rawId.startsWith("brk_")) return { label: "Breakout Signals", href: "/dashboard/breakouts" };

  switch (setupType) {
    case "inverse_fvg":
      return { label: "Inverse FVG", href: "/dashboard/inverse-fvg" };
    case "bullish_fvg_inversion":
      return { label: "Bullish FVG Inversion", href: "/dashboard/bullish-fvg-inversion" };
    case "triple_lock":
      return { label: "Power of 3 (Triple Lock)", href: "/dashboard/triple-lock" };
    case "sr_zone_break":
      return { label: "Support & Resistance", href: "/dashboard/levels" };
    case "order_block":
    case "breaker_block":
    case "fvg_continuation":
      return { label: "Quant Signals", href: "/dashboard/quant" };
    default:
      // Fall back to a Title Cased setupType so nothing is unlabeled.
      return {
        label: setupType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        href: null,
      };
  }
}

export interface BacklogResult {
  items: BacklogItem[];
  capped: boolean;
  retentionDays: number;
  perSourceCap: number;
}

// Module scope so the dynamic clock read isn't treated as an impure call
// during a server component's render.
function retentionCutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  // Preserve FX precision (5dp) while trimming trailing zeros.
  return String(Number(n.toFixed(5)));
}

export async function loadBacklog(): Promise<BacklogResult> {
  const since = retentionCutoff(RETENTION_DAYS);

  const [tradeSetups, miniSignals] = await Promise.all([
    prisma.tradeSetup.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_CAP,
      select: {
        id: true,
        symbol: true,
        direction: true,
        setupType: true,
        timeframe: true,
        entry: true,
        stopLoss: true,
        takeProfit1: true,
        riskReward: true,
        confidenceScore: true,
        qualityGrade: true,
        status: true,
        explanation: true,
        createdAt: true,
      },
    }),
    prisma.miniSignal.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_CAP,
      select: {
        id: true,
        symbol: true,
        direction: true,
        template: true,
        entryTimeframe: true,
        entryZoneLow: true,
        entryZoneHigh: true,
        stopLoss: true,
        takeProfit1: true,
        riskReward: true,
        score: true,
        grade: true,
        status: true,
        explanation: true,
        createdAt: true,
      },
    }),
  ]);

  const items: BacklogItem[] = [
    ...tradeSetups.map((s): BacklogItem => ({
      id: `setup_${s.id}`,
      source: "setup",
      symbol: s.symbol,
      direction: s.direction,
      kind: s.setupType,
      timeframe: s.timeframe,
      grade: s.qualityGrade,
      score: s.confidenceScore,
      entryLabel: formatNum(s.entry),
      stopLoss: formatNum(s.stopLoss),
      takeProfit1: formatNum(s.takeProfit1),
      riskReward: s.riskReward,
      status: s.status,
      explanation: s.explanation,
      createdAt: s.createdAt.toISOString(),
      origin: originForSetup(s.id, s.setupType),
    })),
    ...miniSignals.map((s): BacklogItem => ({
      id: `mini_${s.id}`,
      source: "intraday",
      symbol: s.symbol,
      direction: s.direction,
      kind: s.template,
      timeframe: s.entryTimeframe,
      grade: s.grade,
      score: s.score,
      entryLabel: `${formatNum(s.entryZoneLow)} – ${formatNum(s.entryZoneHigh)}`,
      stopLoss: formatNum(s.stopLoss),
      takeProfit1: formatNum(s.takeProfit1),
      riskReward: s.riskReward,
      status: s.status,
      explanation: s.explanation,
      createdAt: s.createdAt.toISOString(),
      origin: { label: `Intraday · ${s.template.replace(/_/g, " ")}`, href: "/dashboard/intraday-prediction" },
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const capped =
    tradeSetups.length >= PER_SOURCE_CAP || miniSignals.length >= PER_SOURCE_CAP;

  return { items, capped, retentionDays: RETENTION_DAYS, perSourceCap: PER_SOURCE_CAP };
}
