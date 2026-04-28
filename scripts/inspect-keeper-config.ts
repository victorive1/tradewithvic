import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const keeper = await prisma.linkedTradingAccount.findFirst({
    where: { id: { startsWith: "cmofxx5k" } },
  });
  if (!keeper) {
    console.error("Keeper account not found");
    process.exit(1);
  }
  console.log("Keeper config:");
  console.log(`  id:              ${keeper.id}`);
  console.log(`  login:           ${keeper.accountLogin}`);
  console.log(`  broker:          ${keeper.brokerName}`);
  console.log(`  platformType:    ${keeper.platformType}`);
  console.log(`  adapterKind:     ${keeper.adapterKind}`);
  console.log(`  brokerSymbolSuffix: "${keeper.brokerSymbolSuffix}"`);
  console.log(`  adapterConfigJson: ${keeper.adapterConfigJson ?? "(null)"}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
