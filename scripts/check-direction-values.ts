import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const groups = await prisma.tradeSetup.groupBy({ by: ["direction"], _count: true });
  console.log("=== TradeSetup.direction values in prod DB ===");
  for (const g of groups) console.log(`  "${g.direction}": ${g._count} rows`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
