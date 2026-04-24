import { prisma } from "@/lib/prisma";
import {
  finnhubAvailable,
  fetchEconomicCalendar,
  fetchGeneralNews,
  type FinnhubCalendarRow,
} from "@/lib/news/finnhub";
import { scoreHeadline } from "@/lib/news/severity";

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", EU: "EUR", UK: "GBP", GB: "GBP", JP: "JPY", AU: "AUD",
  NZ: "NZD", CA: "CAD", CH: "CHF", DE: "EUR", FR: "EUR", IT: "EUR",
};

const CURRENCY_AFFECTS: Record<string, string[]> = {
  USD: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "NZDUSD", "USDCAD", "XAUUSD", "XAGUSD", "US30", "US500", "NAS100"],
  EUR: ["EURUSD", "EURGBP", "EURJPY"],
  GBP: ["GBPUSD", "EURGBP", "GBPJPY"],
  JPY: ["USDJPY", "EURJPY", "GBPJPY"],
  AUD: ["AUDUSD", "AUDJPY"],
  NZD: ["NZDUSD"],
  CAD: ["USDCAD"],
  CHF: ["USDCHF"],
};

export interface IngestResult {
  source: "finnhub" | "skipped_no_key";
  calendarInserted: number;
  calendarUpdated: number;
  headlinesInserted: number;
  headlinesSkipped: number;
  durationMs: number;
  errors: string[];
}

export async function runNewsIngest(): Promise<IngestResult> {
  const start = Date.now();
  const result: IngestResult = {
    source: "finnhub",
    calendarInserted: 0,
    calendarUpdated: 0,
    headlinesInserted: 0,
    headlinesSkipped: 0,
    durationMs: 0,
    errors: [],
  };

  if (!finnhubAvailable()) {
    result.source = "skipped_no_key";
    result.durationMs = Date.now() - start;
    return result;
  }

  await Promise.all([
    ingestCalendar(result),
    ingestHeadlines(result),
  ]);

  result.durationMs = Date.now() - start;
  return result;
}

async function ingestCalendar(result: IngestResult) {
  try {
    const now = new Date();
    const from = now.toISOString().slice(0, 10);
    const to = new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 10);
    const rows = await fetchEconomicCalendar(from, to);

    for (const row of rows) {
      if (!row.event || !row.time) continue;
      const eventTime = parseFinnhubTime(row.time);
      if (!eventTime) continue;

      const impact = normalizeImpact(row.impact);
      const currency = COUNTRY_TO_CURRENCY[row.country?.toUpperCase()] ?? row.country;
      const affected = currency ? CURRENCY_AFFECTS[currency] ?? [] : [];

      const existing = await prisma.fundamentalEvent.findUnique({
        where: {
          eventTime_country_eventName: {
            eventTime,
            country: row.country ?? "",
            eventName: row.event,
          },
        },
      });

      if (existing) {
        await prisma.fundamentalEvent.update({
          where: { id: existing.id },
          data: {
            impact,
            forecast: row.estimate != null ? String(row.estimate) : existing.forecast,
            previous: row.prev != null ? String(row.prev) : existing.previous,
            actual: row.actual != null ? String(row.actual) : existing.actual,
            affectedCurrenciesJson: JSON.stringify(currency ? [currency] : []),
            affectedSymbolsJson: JSON.stringify(affected),
            source: "finnhub",
          },
        });
        result.calendarUpdated++;
      } else {
        await prisma.fundamentalEvent.create({
          data: {
            eventTime,
            country: row.country ?? "",
            eventName: row.event,
            impact,
            forecast: row.estimate != null ? String(row.estimate) : null,
            previous: row.prev != null ? String(row.prev) : null,
            actual: row.actual != null ? String(row.actual) : null,
            affectedCurrenciesJson: JSON.stringify(currency ? [currency] : []),
            affectedSymbolsJson: JSON.stringify(affected),
            source: "finnhub",
          },
        });
        result.calendarInserted++;
      }
    }
  } catch (err) {
    result.errors.push(`calendar: ${(err as Error).message}`);
  }
}

async function ingestHeadlines(result: IngestResult) {
  try {
    const rows = await fetchGeneralNews("general");
    // Most recent first, but dedup newest → oldest.
    const sorted = [...rows].sort((a, b) => b.datetime - a.datetime).slice(0, 50);

    for (const row of sorted) {
      const scored = scoreHeadline(row.headline, row.summary);
      // Skip truly neutral headlines — the banner is a risk tool, not a news feed.
      if (scored.severity === "green") {
        result.headlinesSkipped++;
        continue;
      }

      const externalId = String(row.id);
      const existing = await prisma.marketNewsHeadline.findUnique({
        where: { sourceName_externalId: { sourceName: row.source || "finnhub", externalId } },
      });
      if (existing) {
        result.headlinesSkipped++;
        continue;
      }

      await prisma.marketNewsHeadline.create({
        data: {
          publishedAt: new Date(row.datetime * 1000),
          headline: row.headline,
          summary: row.summary || null,
          severity: scored.severity,
          category: scored.category,
          affectedSymbolsJson: JSON.stringify(scored.symbols),
          sourceName: row.source || "finnhub",
          sourceUrl: row.url || null,
          externalId,
        },
      });
      result.headlinesInserted++;
    }

    // Auto-resolve any red/orange headlines older than 6h — the market
    // has moved on, the banner shouldn't still be shouting about them.
    const cutoff = new Date(Date.now() - 6 * 3600_000);
    await prisma.marketNewsHeadline.updateMany({
      where: { isActive: true, publishedAt: { lt: cutoff } },
      data: { isActive: false, resolvedAt: new Date() },
    });
  } catch (err) {
    result.errors.push(`headlines: ${(err as Error).message}`);
  }
}

function parseFinnhubTime(raw: string): Date | null {
  // Finnhub returns "YYYY-MM-DD HH:MM:SS" in UTC, without a Z. Force UTC parse.
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeImpact(raw: string): string {
  const s = String(raw).toLowerCase();
  if (s === "high" || s === "3") return "high";
  if (s === "medium" || s === "2") return "medium";
  return "low";
}
