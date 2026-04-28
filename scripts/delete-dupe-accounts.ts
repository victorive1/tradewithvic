import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const KEEPER_ID_PREFIX = "cmofxx5k";
const TO_DELETE_PREFIXES = [
  "cmo99a7c",
  "cmo7p8a6",
  "cmo5avja",
  "cmo5avi2",
  "cmo4piqo",
  "cmo4piqk",
];

async function main() {
  const all = await prisma.linkedTradingAccount.findMany({ select: { id: true } });

  const resolveOne = (prefix: string): string => {
    const found = all.filter((a) => a.id.startsWith(prefix));
    if (found.length !== 1) {
      console.error(`⚠ Prefix ${prefix} matched ${found.length} rows — aborting.`);
      process.exit(1);
    }
    return found[0].id;
  };

  const keeperId = resolveOne(KEEPER_ID_PREFIX);
  const idsToDelete = TO_DELETE_PREFIXES.map(resolveOne);

  console.log("=== PLAN ===");
  console.log(`  keep:   ${keeperId}`);
  for (const id of idsToDelete) console.log(`  delete: ${id}`);

  const stale = await prisma.tradeExecutionRequest.findMany({
    where: { accountId: { in: idsToDelete } },
    select: { id: true, accountId: true, internalSymbol: true, status: true },
  });
  console.log(`\n=== STALE REQUESTS TO CANCEL: ${stale.length} ===`);
  const byStatus: Record<string, number> = {};
  for (const r of stale) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  console.log(`  status counts: ${JSON.stringify(byStatus)}`);

  const requestIds = stale.map((r) => r.id);

  console.log("\n=== EXECUTING (transaction) ===");
  const result = await prisma.$transaction(async (tx) => {
    const audits = await tx.tradeExecutionAuditLog.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    const results = await tx.tradeExecutionResult.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    const requests = await tx.tradeExecutionRequest.deleteMany({
      where: { id: { in: requestIds } },
    });
    const accounts = await tx.linkedTradingAccount.deleteMany({
      where: { id: { in: idsToDelete } },
    });
    return {
      audits: audits.count,
      results: results.count,
      requests: requests.count,
      accounts: accounts.count,
    };
  });

  console.log(`  deleted audits:   ${result.audits}`);
  console.log(`  deleted results:  ${result.results}`);
  console.log(`  deleted requests: ${result.requests}`);
  console.log(`  deleted accounts: ${result.accounts}`);

  console.log("\n=== POST-STATE ===");
  const remaining = await prisma.linkedTradingAccount.findMany({});
  for (const a of remaining) {
    console.log(
      `  id=${a.id.slice(0, 8)} login=${a.accountLogin} adapter=${a.adapterKind} active=${a.isActive}`
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
