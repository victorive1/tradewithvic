// Adds the new bullish_fvg_inversion strategy to the quant bot's
// strategyFilter so it's eligible for auto-routing once the signal earns
// confidence. Quant already aggregates institutional patterns
// (inverse_fvg, order_block, breaker_block, fvg_continuation) so this is
// the natural home for the new multi-timeframe FVG inversion signal.
import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const NEW_TYPE = "bullish_fvg_inversion";

async function main() {
  const quant = await prisma.algoBotConfig.findUnique({ where: { botId: "quant" } });
  if (!quant) {
    console.error("quant bot not found");
    process.exit(1);
  }
  console.log(`Before: "${quant.strategyFilter}"`);
  const types = quant.strategyFilter.split(",").map((s) => s.trim()).filter(Boolean);
  if (types.includes(NEW_TYPE)) {
    console.log("Already present — nothing to do.");
    await prisma.$disconnect();
    return;
  }
  types.push(NEW_TYPE);
  const next = types.join(",");
  await prisma.algoBotConfig.update({
    where: { botId: "quant" },
    data: { strategyFilter: next },
  });
  console.log(`After:  "${next}"`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
