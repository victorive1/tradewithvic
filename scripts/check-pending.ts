import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  console.log("=== ACCOUNTS (ALL, including inactive) ===");
  const accts = await prisma.linkedTradingAccount.findMany({
    orderBy: { createdAt: "desc" },
  });
  for (const a of accts) {
    const lc = a.lastConnectedAt
      ? `${Math.floor((Date.now() - a.lastConnectedAt.getTime()) / 60000)}m ago`
      : "never";
    console.log(
      `  id=${a.id.slice(0, 8)} login=${a.accountLogin} ${a.platformType}/${a.brokerName} adapter=${a.adapterKind} status=${a.connectionStatus} active=${a.isActive} lastConn=${lc} suffix="${a.brokerSymbolSuffix}"`
    );
  }

  const reqs = await prisma.tradeExecutionRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { account: true, result: true },
  });

  const counts: Record<string, number> = {};
  for (const r of reqs) counts[r.status] = (counts[r.status] ?? 0) + 1;
  console.log("\n=== STATUS COUNTS (last 30) ===");
  for (const [s, n] of Object.entries(counts)) console.log(`  ${s}: ${n}`);

  console.log("\n=== LAST 30 REQUESTS ===");
  for (const r of reqs) {
    const ageMin = Math.floor((Date.now() - r.createdAt.getTime()) / 60000);
    const submittedAt = r.submittedAt
      ? `submAt=${Math.floor((Date.now() - r.submittedAt.getTime()) / 60000)}m`
      : "submAt=null";
    console.log(
      `  [${r.status}] ${r.internalSymbol} ${r.side} vol=${r.requestedVolume.toFixed(2)} acct=${r.accountId.slice(0, 8)} adapter=${r.account?.adapterKind ?? "?"} src=${r.sourceType ?? "?"} age=${ageMin}m ${submittedAt} reason=${r.statusReason ?? ""}`
    );
  }

  console.log("\n=== BY ACCOUNT/ADAPTER ===");
  const byAcct: Record<string, { adapter: string; count: number; statuses: Record<string, number> }> = {};
  for (const r of reqs) {
    const k = `${r.accountId.slice(0, 8)}/${r.account?.adapterKind ?? "?"}`;
    if (!byAcct[k]) byAcct[k] = { adapter: r.account?.adapterKind ?? "?", count: 0, statuses: {} };
    byAcct[k].count++;
    byAcct[k].statuses[r.status] = (byAcct[k].statuses[r.status] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(byAcct)) {
    console.log(`  ${k}: ${v.count} total — ${JSON.stringify(v.statuses)}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
