import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  console.log("=== AUTO-LOT-SIZING CONFIG (the volume-explosion suspect) ===");
  const bots = await prisma.algoBotConfig.findMany({
    where: { enabled: true, running: true },
    select: {
      botId: true, fixedLotSize: true,
      autoLotSizingEnabled: true, autoLotSizingAmount: true,
      closeAt1R: true, sizingMode: true, riskPercent: true,
    },
  });
  for (const b of bots) {
    const flag = b.autoLotSizingEnabled ? "AUTO" : "fixed";
    console.log(
      `  ${b.botId.padEnd(15)} ${flag.padEnd(6)} amount=$${b.autoLotSizingAmount} ` +
      `fixedLot=${b.fixedLotSize} sizingMode=${b.sizingMode} riskPct=${b.riskPercent} closeAt1R=${b.closeAt1R}`,
    );
  }

  console.log("\n=== AUDUSD A-grade setups — entry/SL/distance (last 24h) ===");
  const audusdSetups = await prisma.tradeSetup.findMany({
    where: {
      symbol: "AUDUSD",
      qualityGrade: { in: ["A+", "A"] },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true, setupType: true, qualityGrade: true, confidenceScore: true,
      direction: true, entry: true, stopLoss: true, takeProfit1: true, riskReward: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const s of audusdSetups) {
    const slDist = Math.abs(s.entry - s.stopLoss);
    const slPips = (slDist / 0.0001).toFixed(1);
    console.log(
      `  ${s.qualityGrade} ${s.direction.padEnd(7)} entry=${s.entry.toFixed(5)} SL=${s.stopLoss.toFixed(5)} ` +
      `dist=${slDist.toFixed(5)} (${slPips} pips) RR=${s.riskReward.toFixed(2)} ${s.setupType}`,
    );
  }

  console.log("\n=== MT5 EA BRIDGE STATUS — pending ratio, last submitted ===");
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const totalReqs = await prisma.tradeExecutionRequest.count({ where: { createdAt: { gte: since24h } } });
  const pendingReqs = await prisma.tradeExecutionRequest.count({
    where: { createdAt: { gte: since24h }, status: { in: ["submitted", "pending_submission", "validating"] } },
  });
  const filledReqs = await prisma.tradeExecutionRequest.count({
    where: { createdAt: { gte: since24h }, status: "filled" },
  });
  const failedReqs = await prisma.tradeExecutionRequest.count({
    where: { createdAt: { gte: since24h }, status: { in: ["failed", "rejected"] } },
  });
  console.log(`  total=${totalReqs}  pending=${pendingReqs}  filled=${filledReqs}  failed=${failedReqs}`);
  if (pendingReqs > 0 && filledReqs === 0) {
    console.log(`  ⚠ ALL pending — EA bridge isn't picking up requests at all`);
  } else if (pendingReqs > filledReqs * 5) {
    console.log(`  ⚠ EA bridge is severely backed up (>5x pending)`);
  }

  const linkedAccounts = await prisma.linkedTradingAccount.findMany({
    where: { isActive: true },
    select: {
      accountLogin: true, brokerName: true, platformType: true,
      connectionStatus: true, lastConnectedAt: true, adapterKind: true,
      brokerSymbolSuffix: true,
    },
  });
  console.log("\n=== LINKED MT ACCOUNTS — adapter + last connect tell us if bridge is alive ===");
  for (const a of linkedAccounts) {
    const lastConn = a.lastConnectedAt
      ? `${Math.floor((Date.now() - a.lastConnectedAt.getTime()) / 60000)} min ago`
      : "(never)";
    console.log(
      `  ${a.accountLogin}  ${a.brokerName}/${a.platformType}  status=${a.connectionStatus}  ` +
      `adapter=${a.adapterKind ?? "—"}  lastConnect=${lastConn}  symSuffix="${a.brokerSymbolSuffix ?? ""}"`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
