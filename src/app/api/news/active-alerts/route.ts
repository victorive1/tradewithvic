import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { impactToSeverity, type Severity } from "@/lib/news/severity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Everything the top banner needs to render. Clients poll this every ~60s.
export interface ActiveAlert {
  id: string;
  kind: "calendar" | "headline";
  severity: Severity;
  title: string;
  subtitle: string | null;
  affectedSymbols: string[];
  publishedAt: string;
  eventTime: string | null;
  minutesUntil: number | null; // negative = already happened, null for headlines
  sourceUrl: string | null;
  sourceName: string | null;
  category: string;
}

const SEVERITY_RANK: Record<Severity, number> = { red: 0, orange: 1, green: 2 };

export async function GET() {
  const now = new Date();
  const lookAhead = new Date(now.getTime() + 60 * 60_000); // imminent events = next 60 min
  const lookBehind = new Date(now.getTime() - 15 * 60_000); // grace for events that just fired

  const [events, headlines] = await Promise.all([
    prisma.fundamentalEvent.findMany({
      where: {
        eventTime: { gte: lookBehind, lt: lookAhead },
        impact: { in: ["high", "medium"] },
      },
      orderBy: { eventTime: "asc" },
    }),
    prisma.marketNewsHeadline.findMany({
      where: { isActive: true, severity: { in: ["red", "orange"] } },
      orderBy: [{ severity: "asc" }, { publishedAt: "desc" }],
      take: 20,
    }),
  ]);

  const calendarAlerts: ActiveAlert[] = events.map((e) => {
    const minutesUntil = Math.round((e.eventTime.getTime() - now.getTime()) / 60_000);
    return {
      id: `cal:${e.id}`,
      kind: "calendar",
      severity: impactToSeverity(e.impact),
      title: formatCalendarTitle(e.country, e.eventName, minutesUntil),
      subtitle: formatCalendarSubtitle(e.forecast, e.previous, e.actual),
      affectedSymbols: safeParseJSONArray(e.affectedSymbolsJson),
      publishedAt: e.eventTime.toISOString(),
      eventTime: e.eventTime.toISOString(),
      minutesUntil,
      sourceUrl: null,
      sourceName: e.source,
      category: "macro",
    };
  });

  const headlineAlerts: ActiveAlert[] = headlines.map((h) => ({
    id: `hdl:${h.id}`,
    kind: "headline",
    severity: h.severity as Severity,
    title: h.headline,
    subtitle: h.summary,
    affectedSymbols: safeParseJSONArray(h.affectedSymbolsJson),
    publishedAt: h.publishedAt.toISOString(),
    eventTime: null,
    minutesUntil: null,
    sourceUrl: h.sourceUrl,
    sourceName: h.sourceName,
    category: h.category,
  }));

  const merged = [...calendarAlerts, ...headlineAlerts].sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  return NextResponse.json({
    alerts: merged,
    counts: {
      red: merged.filter((a) => a.severity === "red").length,
      orange: merged.filter((a) => a.severity === "orange").length,
      calendar: calendarAlerts.length,
      headline: headlineAlerts.length,
    },
    generatedAt: now.toISOString(),
  });
}

function formatCalendarTitle(country: string, eventName: string, minutesUntil: number): string {
  if (minutesUntil > 0) return `${country} ${eventName} in ${formatMinutes(minutesUntil)}`;
  return `${country} ${eventName} — released ${formatMinutes(-minutesUntil)} ago`;
}

function formatCalendarSubtitle(forecast: string | null, previous: string | null, actual: string | null): string | null {
  const parts: string[] = [];
  if (forecast) parts.push(`forecast ${forecast}`);
  if (previous) parts.push(`prev ${previous}`);
  if (actual) parts.push(`actual ${actual}`);
  return parts.length ? parts.join(" · ") : null;
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function safeParseJSONArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
