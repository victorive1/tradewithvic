import { fetchAllQuotes, calculateCurrencyStrength } from "@/lib/market-data";
import { StrengthClient } from "./StrengthClient";

export const revalidate = 60;

export default async function StrengthPage() {
  const quotes = await fetchAllQuotes();
  const strength = calculateCurrencyStrength(quotes);
  return <StrengthClient strength={strength} quotes={quotes} />;
}
