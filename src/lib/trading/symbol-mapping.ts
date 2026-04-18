import { prisma } from "@/lib/prisma";

/**
 * Symbol translation between FX Wonders canonical symbols and broker-specific
 * symbols. Brokers commonly append suffixes like .m, .pro, .r, _ecn, etc.
 *
 * Lookup order:
 *   1. Exact match on (internalSymbol, brokerName, platformType)
 *   2. Wildcard broker match on (internalSymbol, brokerName=null, platformType)
 *   3. Fall back to internalSymbol as-is
 */
export async function mapSymbolForBroker(params: {
  internalSymbol: string;
  brokerName: string;
  platformType: "MT4" | "MT5";
}): Promise<{ brokerSymbol: string; rule: any | null }> {
  const { internalSymbol, brokerName, platformType } = params;

  const specific = await prisma.symbolMappingRule.findFirst({
    where: { internalSymbol, brokerName, platformType, isActive: true },
  });
  if (specific) return { brokerSymbol: specific.brokerSymbol, rule: specific };

  const wildcard = await prisma.symbolMappingRule.findFirst({
    where: { internalSymbol, brokerName: null, platformType, isActive: true },
  });
  if (wildcard) return { brokerSymbol: wildcard.brokerSymbol, rule: wildcard };

  const both = await prisma.symbolMappingRule.findFirst({
    where: { internalSymbol, brokerName: null, platformType: "both", isActive: true },
  });
  if (both) return { brokerSymbol: both.brokerSymbol, rule: both };

  return { brokerSymbol: internalSymbol, rule: null };
}

/**
 * Seed reasonable default mappings on first use so users don't hit an empty
 * symbol-mapping table. Idempotent.
 */
export async function ensureDefaultMappings(): Promise<void> {
  const defaults = [
    { s: "EURUSD", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "GBPUSD", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "USDJPY", digits: 3, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "AUDUSD", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "USDCAD", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "USDCHF", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "NZDUSD", digits: 5, contractSize: 100000, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
    { s: "XAUUSD", digits: 2, contractSize: 100,    minVolume: 0.01, maxVolume: 50,  volumeStep: 0.01 },
    { s: "XAGUSD", digits: 3, contractSize: 5000,   minVolume: 0.01, maxVolume: 50,  volumeStep: 0.01 },
    { s: "US30",   digits: 1, contractSize: 1,      minVolume: 0.1,  maxVolume: 100, volumeStep: 0.1 },
    { s: "NAS100", digits: 1, contractSize: 1,      minVolume: 0.1,  maxVolume: 100, volumeStep: 0.1 },
    { s: "SPX500", digits: 1, contractSize: 1,      minVolume: 0.1,  maxVolume: 100, volumeStep: 0.1 },
    { s: "BTCUSD", digits: 2, contractSize: 1,      minVolume: 0.01, maxVolume: 10,  volumeStep: 0.01 },
    { s: "ETHUSD", digits: 2, contractSize: 1,      minVolume: 0.01, maxVolume: 100, volumeStep: 0.01 },
  ];

  for (const d of defaults) {
    await prisma.symbolMappingRule.upsert({
      where: {
        internalSymbol_brokerName_platformType: {
          internalSymbol: d.s,
          brokerName: null as any,
          platformType: "both",
        } as any,
      },
      update: {},
      create: {
        internalSymbol: d.s,
        brokerSymbol: d.s,
        brokerName: null,
        platformType: "both",
        digits: d.digits,
        contractSize: d.contractSize,
        minVolume: d.minVolume,
        maxVolume: d.maxVolume,
        volumeStep: d.volumeStep,
      },
    }).catch(() => {
      // unique constraint with null is flaky across DBs — fall back to findFirst + create
    });
  }
}
