import { fetchAllQuotes } from "@/lib/market-data";
import { generateSetups } from "@/lib/setup-engine";
import { SetupsClient } from "./SetupsClient";

export const revalidate = 60;

export default async function SetupsPage() {
  const quotes = await fetchAllQuotes();
  const setups = generateSetups(quotes);
  return <SetupsClient initialSetups={setups} />;
}
