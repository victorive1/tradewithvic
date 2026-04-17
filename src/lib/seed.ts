import { PrismaClient } from "@/generated/prisma/client";
import { ALL_INSTRUMENTS } from "./constants";

const prisma = new (PrismaClient as any)();

async function seed() {
  console.log("Seeding instruments...");

  for (const inst of ALL_INSTRUMENTS) {
    await prisma.instrument.upsert({
      where: { symbol: inst.symbol },
      update: { displayName: inst.displayName, category: inst.category },
      create: {
        symbol: inst.symbol,
        displayName: inst.displayName,
        category: inst.category,
        decimalPlaces: inst.decimals,
      },
    });
  }

  console.log(`Seeded ${ALL_INSTRUMENTS.length} instruments`);
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
