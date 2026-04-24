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
    // Only look 3 days ahead per cycle — fresher, faster, and the next
    // cron fire will extend the horizon as events age in.
    const to = new Date(now.getTime() + 3 * 86400_000).toISOString().slice(0, 10);
    const rows = await fetchEconomicCalendar(from, to);

    const jobs: Array<() => Promise<"inserted" | "updated" | "skipped">> = [];
    for (const row of rows) {
      if (!row.event || !row.time) continue;
      const eventTime = parseFinnhubTime(row.time);
      if (!eventTime) continue;

      const impact = normalizeImpact(row.impact);
      const country = row.country ?? "";
      const currency = COUNTRY_TO_CURRENCY[country.toUpperCase()] ?? country;
      const affected = currency ? CURRENCY_AFFECTS[currency] ?? [] : [];

      jobs.push(async () => {
        // upsert is one round trip vs findUnique+create/update; we lose
        // the insert/update distinction, so we detect it via createdAt.
        const res = await prisma.fundamentalEvent.upsert({
          where: {
            eventTime_country_eventName: { eventTime, country, eventName: row.event },
          },
          create: {
            eventTime,
            country,
            eventName: row.event,
            impact,
            forecast: row.estimate != null ? String(row.estimate) : null,
            previous: row.prev != null ? String(row.prev) : null,
            actual: row.actual != null ? String(row.actual) : null,
            affectedCurrenciesJson: JSON.stringify(currency ? [currency] : []),
            affectedSymbolsJson: JSON.stringify(affected),
            source: "finnhub",
          },
          update: {
            impact,
            ...(row.estimate != null ? { forecast: String(row.estimate) } : {}),
            ...(row.prev != null ? { previous: String(row.prev) } : {}),
            ...(row.actual != null ? { actual: String(row.actual) } : {}),
            affectedCurrenciesJson: JSON.stringify(currency ? [currency] : []),
            affectedSymbolsJson: JSON.stringify(affected),
            source: "finnhub",
          },
          select: { createdAt: true, updatedAt: true },
        });
        return res.createdAt.getTime() === res.updatedAt.getTime() ? "inserted" : "updated";
      });
    }

    const outcomes = await runInBatches(jobs, 5);
    for (const o of outcomes) {
      if (o === "inserted") result.calendarInserted++;
      else if (o === "updated") result.calendarUpdated++;
    }
  } catch (err) {
    result.errors.push(`calendar: ${(err as Error).message}`);
  }
}

async function ingestHeadlines(result: IngestResult) {
  try {
    const rows = await fetchGeneralNews("general");
    // Score first, then drop green headlines before we touch the DB.
    const scored = rows
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 50)
      .map((row) => ({ row, scored: scoreHeadline(row.headline, row.summary) }));

    const scorable = scored.filter((s) => s.scored.severity !== "green");
    result.headlinesSkipped += scored.length - scorable.length;

    if (scorable.length > 0) {
      // createMany + skipDuplicates is one round trip for N rows; the
      // (sourceName, externalId) unique index makes duplicates no-ops.
      const createRes = await prisma.marketNewsHeadline.createMany({
        data: scorable.map(({ row, scored }) => ({
          publishedAt: new Date(row.datetime * 1000),
          headline: row.headline,
          summary: row.summary || null,
          severity: scored.severity,
          category: scored.category,
          affectedSymbolsJson: JSON.stringify(scored.symbols),
          sourceName: row.source || "finnhub",
          sourceUrl: row.url || null,
          externalId: String(row.id),
        })),
        skipDuplicates: true,
      });
      result.headlinesInserted += createRes.count;
      result.headlinesSkipped += scorable.length - createRes.count;
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

async function runInBatches<T>(jobs: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < jobs.length; i += concurrency) {
    const slice = jobs.slice(i, i + concurrency);
    const results = await Promise.all(slice.map((j) => j()));
    out.push(...results);
  }
  return out;
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
