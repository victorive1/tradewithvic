// Finnhub client — free tier gives 60 req/min. We hit two endpoints:
// /calendar/economic for the scheduled calendar, /news?category=general
// for breaking headlines. Both are fetched via lazy-init to avoid the
// Next.js 16 build-time env trap.

function finnhubKey(): string | null {
  return process.env.FINNHUB_API_KEY?.trim() || null;
}

const BASE = "https://finnhub.io/api/v1";

export function finnhubAvailable(): boolean {
  return finnhubKey() !== null;
}

export interface FinnhubCalendarRow {
  actual: number | null;
  country: string; // ISO2, e.g. "US"
  estimate: number | null;
  event: string;
  impact: "high" | "medium" | "low" | string;
  prev: number | null;
  time: string; // "2026-04-24 12:30:00"
  unit: string;
}

export interface FinnhubNewsRow {
  category: string;
  datetime: number; // epoch seconds
  headline: string;
  id: number;
  image?: string;
  related?: string;
  source: string;
  summary: string;
  url: string;
}

export async function fetchEconomicCalendar(
  fromISO: string,
  toISO: string,
): Promise<FinnhubCalendarRow[]> {
  const key = finnhubKey();
  if (!key) return [];
  const url = `${BASE}/calendar/economic?from=${fromISO}&to=${toISO}&token=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`finnhub calendar ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { economicCalendar?: FinnhubCalendarRow[] };
  return data.economicCalendar ?? [];
}

export async function fetchGeneralNews(category = "general"): Promise<FinnhubNewsRow[]> {
  const key = finnhubKey();
  if (!key) return [];
  const url = `${BASE}/news?category=${encodeURIComponent(category)}&token=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`finnhub news ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as FinnhubNewsRow[];
  return Array.isArray(data) ? data : [];
}
