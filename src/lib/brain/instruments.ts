import { prisma } from "@/lib/prisma";
import { ALL_INSTRUMENTS } from "@/lib/constants";

export async function ensureInstruments() {
  const ops = ALL_INSTRUMENTS.map((i) =>
    prisma.instrument.upsert({
      where: { symbol: i.symbol },
      update: {
        displayName: i.displayName,
        category: i.category,
        decimalPlaces: i.decimals,
      },
      create: {
        symbol: i.symbol,
        displayName: i.displayName,
        category: i.category,
        decimalPlaces: i.decimals,
        isActive: true,
        scanTier: 1,
      },
    })
  );
  return Promise.all(ops);
}

export async function getActiveInstruments() {
  return prisma.instrument.findMany({
    where: { isActive: true },
    orderBy: [{ scanTier: "asc" }, { symbol: "asc" }],
  });
}
