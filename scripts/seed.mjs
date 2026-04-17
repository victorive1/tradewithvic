import pkg from "@prisma/client";
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

const instruments = [
  { symbol: "EURUSD", displayName: "EUR/USD", category: "forex", decimalPlaces: 5 },
  { symbol: "GBPUSD", displayName: "GBP/USD", category: "forex", decimalPlaces: 5 },
  { symbol: "USDJPY", displayName: "USD/JPY", category: "forex", decimalPlaces: 3 },
  { symbol: "USDCHF", displayName: "USD/CHF", category: "forex", decimalPlaces: 5 },
  { symbol: "AUDUSD", displayName: "AUD/USD", category: "forex", decimalPlaces: 5 },
  { symbol: "NZDUSD", displayName: "NZD/USD", category: "forex", decimalPlaces: 5 },
  { symbol: "USDCAD", displayName: "USD/CAD", category: "forex", decimalPlaces: 5 },
  { symbol: "EURJPY", displayName: "EUR/JPY", category: "forex", decimalPlaces: 3 },
  { symbol: "GBPJPY", displayName: "GBP/JPY", category: "forex", decimalPlaces: 3 },
  { symbol: "EURGBP", displayName: "EUR/GBP", category: "forex", decimalPlaces: 5 },
  { symbol: "AUDJPY", displayName: "AUD/JPY", category: "forex", decimalPlaces: 3 },
  { symbol: "XAUUSD", displayName: "XAU/USD", category: "metals", decimalPlaces: 2 },
  { symbol: "XAGUSD", displayName: "XAG/USD", category: "metals", decimalPlaces: 3 },
  { symbol: "USOIL", displayName: "US Oil (WTI)", category: "energy", decimalPlaces: 2 },
  { symbol: "NAS100", displayName: "NAS100", category: "indices", decimalPlaces: 1 },
  { symbol: "US30", displayName: "US30 (Dow)", category: "indices", decimalPlaces: 1 },
  { symbol: "SPX500", displayName: "S&P 500", category: "indices", decimalPlaces: 1 },
  { symbol: "GER40", displayName: "GER40 (DAX)", category: "indices", decimalPlaces: 1 },
  { symbol: "BTCUSD", displayName: "BTC/USD", category: "crypto", decimalPlaces: 2 },
  { symbol: "ETHUSD", displayName: "ETH/USD", category: "crypto", decimalPlaces: 2 },
  { symbol: "SOLUSD", displayName: "SOL/USD", category: "crypto", decimalPlaces: 2 },
  { symbol: "XRPUSD", displayName: "XRP/USD", category: "crypto", decimalPlaces: 4 },
];

async function seed() {
  console.log("Seeding instruments...");
  for (const inst of instruments) {
    await prisma.instrument.upsert({
      where: { symbol: inst.symbol },
      update: { displayName: inst.displayName, category: inst.category },
      create: inst,
    });
  }
  console.log(`Seeded ${instruments.length} instruments`);
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
