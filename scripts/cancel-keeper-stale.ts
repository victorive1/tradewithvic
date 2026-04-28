import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const KEEPER_PREFIX = "cmofxx5k";
const STALE_AGE_MS = 30 * 60 * 1000;

async function main() {
  const keeper = await prisma.linkedTradingAccount.findFirst({
    where: { id: { startsWith: KEEPER_PREFIX } },
  });
  if (!keeper) {
    console.error("Keeper account not found");
    process.exit(1);
  }
  console.log(`Keeper: ${keeper.id} (login=${keeper.accountLogin})`);

  const cutoff = new Date(Date.now() - STALE_AGE_MS);
  const stale = await prisma.tradeExecutionRequest.findMany({
    where: {
      accountId: keeper.id,
      status: { in: ["pending_submission", "validating", "submitted"] },
      createdAt: { lt: cutoff },
    },
    select: { id: true, internalSymbol: true, side: true, status: true, createdAt: true },
  });

  console.log(`\nFound ${stale.length} stale requests (>30 min old, not finalized).`);

  if (stale.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const updated = await prisma.tradeExecutionRequest.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: {
      status: "cancelled",
      statusReason: "Stale baseline cleanup — never ack'd by adapter",
    },
  });

  console.log(`Cancelled: ${updated.count}`);

  const after = await prisma.tradeExecutionRequest.groupBy({
    by: ["status"],
    where: { accountId: keeper.id },
    _count: true,
  });
  console.log("\nKeeper status counts now:");
  for (const row of after) console.log(`  ${row.status}: ${row._count}`);

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
