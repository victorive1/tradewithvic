import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

interface Stats {
  count: number;
  min: number; max: number; mean: number;
  p25: number; p50: number; p75: number; p90: number;
}

function computeStats(scores: number[]): Stats | null {
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const sum = scores.reduce((a, b) => a + b, 0);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    count: scores.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / scores.length,
    p25: pct(0.25),
    p50: pct(0.5),
    p75: pct(0.75),
    p90: pct(0.9),
  };
}

function pctAbove(scores: number[], threshold: number): number {
  if (scores.length === 0) return 0;
  return scores.filter((s) => s >= threshold).length / scores.length;
}

async function main() {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const allBots = await prisma.algoBotConfig.findMany({
    select: { botId: true, strategyFilter: true, minScore: true, minRiskReward: true, symbolFilter: true, enabled: true, running: true },
    orderBy: { botId: "asc" },
  });
  console.log(`[bot states] ${allBots.map((b) => `${b.botId}=${b.enabled ? "E" : "·"}${b.running ? "R" : "·"}`).join("  ")}`);
  console.log(`[bot states] legend: ER=enabled+running  E·=enabled only  ··=fully off`);
  const bots = allBots; // audit ALL bots, even off ones — config drift matters either way

  console.log("════════════════════════════════════════════════════════════════════════════");
  console.log("MINSCORE CALIBRATION AUDIT — last 30 days");
  console.log("════════════════════════════════════════════════════════════════════════════");
  console.log("For each bot: distribution of confidenceScore among A+/A setups in its");
  console.log("strategyFilter ∩ symbolFilter, vs. the bot's current minScore threshold.");
  console.log();

  // Engine-wide score distribution by setupType (the calibration baseline)
  console.log("=== ENGINE BASELINE — A+/A score distribution by setupType (last 30d) ===");
  console.log("setupType                count  min  p25  p50  p75  p90  max  mean");
  console.log("──────────────────────────────────────────────────────────────────────");
  const engineSetups = await prisma.tradeSetup.findMany({
    where: {
      qualityGrade: { in: ["A+", "A"] },
      createdAt: { gte: since30d },
    },
    select: { setupType: true, confidenceScore: true },
  });
  const byType: Record<string, number[]> = {};
  for (const s of engineSetups) {
    (byType[s.setupType] ??= []).push(s.confidenceScore);
  }
  const sortedTypes = Object.entries(byType).sort((a, b) => b[1].length - a[1].length);
  for (const [type, scores] of sortedTypes) {
    const st = computeStats(scores)!;
    console.log(
      `${type.padEnd(24)} ${String(st.count).padStart(5)}  ${String(st.min).padStart(3)}  ${String(st.p25).padStart(3)}  ${String(st.p50).padStart(3)}  ${String(st.p75).padStart(3)}  ${String(st.p90).padStart(3)}  ${String(st.max).padStart(3)}  ${st.mean.toFixed(1).padStart(4)}`,
    );
  }

  console.log("\n");
  console.log("=== PER-BOT GAP ANALYSIS ===");
  console.log();

  for (const bot of bots) {
    const strategies = (bot.strategyFilter ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const symbols = (bot.symbolFilter ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const where: Record<string, unknown> = {
      qualityGrade: { in: ["A+", "A"] },
      createdAt: { gte: since30d },
    };
    if (strategies.length) where.setupType = { in: strategies };
    if (symbols.length) where.symbol = { in: symbols };
    const inFilter = await prisma.tradeSetup.findMany({
      where,
      select: { confidenceScore: true, riskReward: true, setupType: true },
    });
    const scores = inFilter.map((s) => s.confidenceScore);
    const stats = computeStats(scores);

    const stateBadge = (bot as { enabled?: boolean; running?: boolean }).enabled
      ? ((bot as { running?: boolean }).running ? "ER" : "E·")
      : "··";
    console.log(`╭── ${bot.botId.toUpperCase()} [${stateBadge}] ─────────────────────────────`);
    console.log(`│  strategyFilter: ${strategies.join(", ") || "(any)"}`);
    console.log(`│  current minScore: ${bot.minScore}    minRR: ${bot.minRiskReward}`);
    if (!stats) {
      console.log(`│  ⚠ ZERO A+/A setups in filter over last 30d`);
      console.log(`│  → either engine isn't producing this strategy, or symbolFilter is too narrow`);
      console.log(`╰──────────────────────────────────────────────────────────────`);
      console.log();
      continue;
    }
    console.log(`│  A+/A setups available: ${stats.count}`);
    console.log(`│  score distribution: min=${stats.min}  p25=${stats.p25}  p50=${stats.p50}  p75=${stats.p75}  p90=${stats.p90}  max=${stats.max}  mean=${stats.mean.toFixed(1)}`);

    const passesNow = pctAbove(scores, bot.minScore);
    const passesAt80 = pctAbove(scores, 80);
    const passesAt82 = pctAbove(scores, 82);
    const passesAtP50 = pctAbove(scores, stats.p50);
    console.log(`│  passes current minScore (${bot.minScore}): ${(passesNow * 100).toFixed(0)}% (${Math.round(passesNow * stats.count)}/${stats.count})`);
    console.log(`│  hypothetical pass rates:  @80=${(passesAt80 * 100).toFixed(0)}%  @82=${(passesAt82 * 100).toFixed(0)}%  @${stats.p50}(p50)=${(passesAtP50 * 100).toFixed(0)}%`);

    // Recommendation: target ~50-70% pass rate, anchoring on p25 to keep bot active without over-firing
    const recommended = stats.p25;
    const recPassRate = pctAbove(scores, recommended);
    let verdict = "";
    if (passesNow === 0) {
      verdict = `🔴 STARVED — current threshold filters out everything. Drop to ${recommended} (would pass ${(recPassRate * 100).toFixed(0)}% of A-grade)`;
    } else if (passesNow < 0.2) {
      verdict = `🟡 TIGHT — only ${(passesNow * 100).toFixed(0)}% pass. Consider ${recommended} (${(recPassRate * 100).toFixed(0)}% pass).`;
    } else if (passesNow > 0.8) {
      verdict = `🟢 LOOSE — ${(passesNow * 100).toFixed(0)}% pass. Could tighten to ${stats.p50} (${(pctAbove(scores, stats.p50) * 100).toFixed(0)}% pass) for higher selectivity.`;
    } else {
      verdict = `🟢 OK — ${(passesNow * 100).toFixed(0)}% pass; reasonable selectivity.`;
    }
    console.log(`│  ${verdict}`);
    console.log(`╰──────────────────────────────────────────────────────────────`);
    console.log();
  }

  // Drift indicator: compare engine taxonomy to bot strategyFilters
  console.log("=== STRATEGY-FILTER COVERAGE ===");
  const allEngineTypes = new Set(Object.keys(byType));
  const allBotTypes = new Set<string>();
  for (const b of bots) {
    for (const s of (b.strategyFilter ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
      allBotTypes.add(s);
    }
  }
  const engineOnly = [...allEngineTypes].filter((t) => !allBotTypes.has(t));
  const botOnly = [...allBotTypes].filter((t) => !allEngineTypes.has(t));
  if (engineOnly.length > 0) {
    console.log(`  Engine produces but no bot accepts: ${engineOnly.join(", ")}`);
    console.log(`    → these A-grade setups never get routed by any bot`);
  }
  if (botOnly.length > 0) {
    console.log(`  Bots filter for but engine never produces: ${botOnly.join(", ")}`);
    console.log(`    → these strategy slots are dead weight in bot configs`);
  }
  if (engineOnly.length === 0 && botOnly.length === 0) {
    console.log(`  ✓ Bot strategyFilters and engine setupType taxonomy fully match`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
