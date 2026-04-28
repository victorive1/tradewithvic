// Flip the keeper LinkedTradingAccount from adapterKind=mock to ea_webhook.
//
// DO NOT run until the EA on MT5 is confirmed connected.
// Verify with `npx tsx scripts/check-pending.ts` and ensure the keeper row
// shows `lastConn=<small number>m ago` (under 5 min). If `lastConn=never`,
// the EA isn't reaching /api/mt5/ea/pull or /api/mt5/ea/ping yet — fix that
// first; otherwise this flip just queues real-bridge requests with no listener.
import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const KEEPER_PREFIX = "cmofxx5k";
const MAX_LAST_CONN_MIN = 10;

async function main() {
  const keeper = await prisma.linkedTradingAccount.findFirst({
    where: { id: { startsWith: KEEPER_PREFIX } },
  });
  if (!keeper) {
    console.error("Keeper not found");
    process.exit(1);
  }

  console.log(`Keeper: ${keeper.id} (login=${keeper.accountLogin})`);
  console.log(`  current adapter: ${keeper.adapterKind}`);
  console.log(`  lastConnectedAt: ${keeper.lastConnectedAt ?? "never"}`);

  if (keeper.adapterKind === "ea_webhook") {
    console.log("\nAlready ea_webhook — nothing to do.");
    await prisma.$disconnect();
    return;
  }

  const ageMin = keeper.lastConnectedAt
    ? Math.floor((Date.now() - keeper.lastConnectedAt.getTime()) / 60000)
    : Number.POSITIVE_INFINITY;

  if (ageMin > MAX_LAST_CONN_MIN) {
    console.error(
      `\n⚠ Refusing to flip. EA last connected ${ageMin === Number.POSITIVE_INFINITY ? "never" : `${ageMin}m ago`}, ` +
        `must be within ${MAX_LAST_CONN_MIN}m. Set FORCE=1 to override.`
    );
    if (process.env.FORCE !== "1") process.exit(1);
    console.log("FORCE=1 set — proceeding anyway.");
  }

  const updated = await prisma.linkedTradingAccount.update({
    where: { id: keeper.id },
    data: { adapterKind: "ea_webhook" },
  });
  console.log(`\nFlipped. adapterKind is now: ${updated.adapterKind}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
