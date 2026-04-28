import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const before = await prisma.algoBotConfig.findMany({
    where: { sizingMode: "fixed_lot", autoLotSizingEnabled: true },
    select: { botId: true, fixedLotSize: true, autoLotSizingAmount: true },
  });

  console.log(`=== ${before.length} bots will be patched ===`);
  for (const b of before) {
    console.log(`  ${b.botId.padEnd(12)} fixedLot=${b.fixedLotSize} autoAmt=$${b.autoLotSizingAmount}`);
  }

  if (before.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const updated = await prisma.algoBotConfig.updateMany({
    where: { sizingMode: "fixed_lot", autoLotSizingEnabled: true },
    data: { autoLotSizingEnabled: false },
  });
  console.log(`\nPatched: ${updated.count}`);

  console.log("\n=== POST-STATE (active bots only) ===");
  const after = await prisma.algoBotConfig.findMany({
    where: { enabled: true, running: true },
    orderBy: { botId: "asc" },
  });
  for (const b of after) {
    console.log(
      `  ${b.botId.padEnd(12)} sizingMode=${b.sizingMode} fixedLot=${b.fixedLotSize} autoEnabled=${b.autoLotSizingEnabled} closeAt1R=${b.closeAt1R}`
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
