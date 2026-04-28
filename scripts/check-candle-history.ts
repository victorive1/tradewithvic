import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const groups = await prisma.candle.groupBy({
    by: ["timeframe"],
    _count: true,
    _min: { openTime: true },
    _max: { openTime: true },
  });
  console.log("=== Candle store coverage ===");
  for (const g of groups) {
    const min = g._min.openTime;
    const max = g._max.openTime;
    const span = min && max ? `${Math.round((max.getTime() - min.getTime()) / (60 * 60 * 1000))}h` : "?";
    console.log(
      `  ${g.timeframe.padEnd(6)} count=${g._count} span=${span} oldest=${min?.toISOString() ?? "?"} newest=${max?.toISOString() ?? "?"}`
    );
  }

  console.log("\n=== Per-symbol 1h coverage (top 10) ===");
  const perSymbol = await prisma.$queryRawUnsafe<Array<{ symbol: string; count: bigint; min: Date; max: Date }>>(
    `SELECT symbol, COUNT(*) as count, MIN("openTime") as min, MAX("openTime") as max
     FROM "Candle" WHERE timeframe='1h' GROUP BY symbol ORDER BY COUNT(*) DESC LIMIT 10`
  );
  for (const r of perSymbol) {
    const span = Math.round((r.max.getTime() - r.min.getTime()) / (60 * 60 * 1000));
    console.log(`  ${r.symbol.padEnd(10)} 1h count=${Number(r.count)} span=${span}h`);
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
