import { fetchAllQuotes, calculateCurrencyStrength } from "@/lib/market-data";
import { MarketRadarClient } from "@/components/dashboard/MarketRadarClient";

export const revalidate = 60;

export default async function DashboardPage() {
  const quotes = await fetchAllQuotes();
  const strength = calculateCurrencyStrength(quotes);

  return <MarketRadarClient initialQuotes={quotes} initialStrength={strength} />;
}
