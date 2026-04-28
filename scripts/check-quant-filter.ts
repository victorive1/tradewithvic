import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const bots = await prisma.algoBotConfig.findMany({ where: { enabled: true, running: true }, orderBy: { botId: "asc" } });
  for (const b of bots) console.log(`${b.botId.padEnd(12)} strategyFilter="${b.strategyFilter}"`);
  await prisma.$disconnect();
}
main();
