import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const TARGET_BOT = process.env.TARGET_BOT ?? "quant";
  console.log(`=== ${TARGET_BOT.toUpperCase()} BOT FULL CONFIG ===`);
  const quant = await prisma.algoBotConfig.findFirst({ where: { botId: TARGET_BOT } });
  if (!quant) { console.log(`${TARGET_BOT} bot not found!`); return; }
  console.log(JSON.stringify(quant, null, 2));

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  console.log("\n=== ALL setups matching quant's strategyFilter (last 7d) ===");
  const quantSetupTypes = quant.strategyFilter?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  console.log(`\n  strategyFilter parsed → [${quantSetupTypes.join(", ")}]`);
  const allMatches = await prisma.tradeSetup.findMany({
    where: { setupType: { in: quantSetupTypes }, createdAt: { gte: since7d } },
    select: {
      symbol: true, setupType: true, qualityGrade: true, confidenceScore: true,
      riskReward: true, status: true, createdAt: true, direction: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  console.log(`  total in last 7d: ${allMatches.length}`);
  if (allMatches.length === 0) {
    console.log("  ⚠ The setup engine has produced ZERO of quant's strategies in 7 days");
    return;
  }

  // Group by status × grade
  const grid: Record<string, number> = {};
  for (const s of allMatches) {
    const k = `${s.qualityGrade ?? "—"}/${s.status}/${s.setupType}`;
    grid[k] = (grid[k] ?? 0) + 1;
  }
  console.log("\n  breakdown (grade/status/setupType):");
  for (const [k, v] of Object.entries(grid).sort()) console.log(`    ${k.padEnd(40)} ${v}`);

  console.log("\n=== A-grade quant-strategy setups (any score / RR / symbol filter — relaxed) — do they exist at all? ===");
  const aGrade = await prisma.tradeSetup.findMany({
    where: { setupType: { in: quantSetupTypes }, qualityGrade: { in: ["A+", "A"] }, createdAt: { gte: since7d } },
    select: { symbol: true, setupType: true, qualityGrade: true, confidenceScore: true, riskReward: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(`  ${aGrade.length} A-grade quant-strategy setups in last 7d (any status/symbol/score)`);
  for (const a of aGrade) {
    console.log(`    ${a.createdAt.toISOString()} ${a.symbol.padEnd(8)} ${a.setupType.padEnd(20)} ${a.qualityGrade} score=${a.confidenceScore} RR=${a.riskReward} status=${a.status}`);
  }

  console.log("\n=== Quant-eligible setups (A+/A AND active AND score≥85 AND RR≥1.2) ===");
  const quantSymbols = quant.symbolFilter?.split(",") ?? [];
  const eligible = await prisma.tradeSetup.findMany({
    where: {
      setupType: { in: quantSetupTypes },
      qualityGrade: { in: ["A+", "A"] },
      status: "active",
      confidenceScore: { gte: quant.minScore },
      riskReward: { gte: quant.minRiskReward },
      createdAt: { gte: since7d },
      ...(quantSymbols.length ? { symbol: { in: quantSymbols } } : {}),
    },
    select: {
      id: true, symbol: true, setupType: true, qualityGrade: true,
      confidenceScore: true, riskReward: true, direction: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(`  ${eligible.length} setups passed gates 1–8 (the in-DB filter) in last 7d`);
  for (const e of eligible.slice(0, 10)) {
    console.log(
      `  ${e.createdAt.toISOString()} ${e.symbol.padEnd(8)} ${e.setupType.padEnd(20)} ${e.qualityGrade} score=${e.confidenceScore} RR=${e.riskReward}`,
    );
  }

  if (eligible.length === 0) {
    console.log("\n  ⇒ ROOT CAUSE: no setup has cleared the in-DB filter (gates 4-8). Either:");
    console.log("       - all matching setups score below 85");
    console.log("       - or RR is below 1.2");
    console.log("       - or the symbols aren't in quant's symbolFilter");
    console.log("       - or none reached qualityGrade ∈ {A+, A}");
    return;
  }

  console.log("\n=== Did quant ever EVALUATE any of these in algoBotExecution? ===");
  const evalIds = eligible.map((e) => e.id);
  const evaluated = await prisma.algoBotExecution.findMany({
    where: { botId: TARGET_BOT, setupId: { in: evalIds } },
    select: { setupId: true, status: true, rejectReason: true, routedAt: true },
  });
  console.log(`  quant has rows for ${evaluated.length} of the ${eligible.length} eligible setups`);
  for (const e of evaluated.slice(0, 15)) {
    console.log(`    setup=${e.setupId.slice(0,8)} status=${e.status} reason=${e.rejectReason ?? "—"}`);
  }
  const evaluatedIds = new Set(evaluated.map((e) => e.setupId));
  const skipped = eligible.filter((e) => !evaluatedIds.has(e.id));
  if (skipped.length > 0) {
    console.log(`\n  ⚠ ${skipped.length} eligible setups have NO quant row at all → quant never reached them`);
    console.log(`    (means: regime gate failed silently, OR currency-exposure cap blocked, OR routedThisRun budget exhausted)`);
    console.log("\n  Sample skipped:");
    for (const s of skipped.slice(0, 5)) {
      console.log(`    ${s.createdAt.toISOString()} ${s.symbol} ${s.setupType} ${s.qualityGrade} score=${s.confidenceScore}`);
    }
  }

  console.log("\n=== Regime check on quant's eligible setup symbols ===");
  const symbols = [...new Set(eligible.map((e) => e.symbol))];
  for (const sym of symbols.slice(0, 5)) {
    const regimes = await prisma.regimeSnapshot.findMany({
      where: { symbol: sym },
      select: { timeframe: true, structureRegime: true, directionalBias: true, volatilityRegime: true, trendStrength: true, updatedAt: true },
      take: 4,
    });
    console.log(`  ${sym}:`);
    for (const r of regimes) {
      const tsNum: unknown = r.trendStrength;
      const ts = typeof tsNum === "number" ? tsNum.toFixed(2) : String(tsNum);
      console.log(`    ${r.timeframe}  structure=${r.structureRegime} bias=${r.directionalBias} vol=${r.volatilityRegime} trend=${ts} updated=${r.updatedAt.toISOString()}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
