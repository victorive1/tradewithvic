import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const bots = await prisma.algoBotConfig.findMany({
    orderBy: { botId: "asc" },
  });
  for (const b of bots) {
    console.log(
      `${b.botId.padEnd(15)} enabled=${b.enabled} running=${b.running} sizingMode=${b.sizingMode} fixedLot=${b.fixedLotSize} riskPct=${b.riskPercent} autoEnabled=${b.autoLotSizingEnabled} autoAmt=${b.autoLotSizingAmount} closeAt1R=${b.closeAt1R}`
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
